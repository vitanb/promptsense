const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/pool');
const { provisionTenantDb } = require('../db/provision');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const logger = require('../utils/logger');
const { nullifyUserReferences } = require('./admin.controller');

// In-process cache of revoked JTIs — consulted by authenticate() before DB
// to avoid a DB round-trip on every request. Only populated on explicit
// revocation (logout, org membership removal). Entries are purged when the
// token's natural expiry has passed (handled by the same periodic DB cleanup).
const revokedJtiCache = new Set();

function generateTokens(userId, extra = {}) {
  // Embed lightweight user fields in the token so authenticate() skips the DB on most requests.
  // Algorithm is pinned to HS256 to prevent algorithm-confusion attacks (e.g. RS256 / none).
  // jti (JWT ID) enables explicit per-token revocation without invalidating all user tokens.
  const jti = uuidv4();
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
  const accessToken = jwt.sign(
    { userId, jti, ...extra },
    process.env.JWT_SECRET,
    { expiresIn, algorithm: 'HS256' }
  );
  const refreshToken = crypto.randomBytes(40).toString('hex');
  // Compute absolute expiry for revocation table (match token's exp)
  const expiresMs = parseExpiresIn(expiresIn);
  const tokenExpiresAt = new Date(Date.now() + expiresMs);
  return { accessToken, refreshToken, jti, tokenExpiresAt };
}

// Parse JWT expiresIn shorthand to milliseconds
function parseExpiresIn(expiresIn) {
  if (typeof expiresIn === 'number') return expiresIn * 1000;
  const match = String(expiresIn).match(/^(\d+)([smhd])$/);
  if (!match) return 15 * 60 * 1000; // default 15m
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * (multipliers[unit] || 60000);
}

async function storeRefreshToken(userId, refreshToken) {
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [userId, hash, expiresAt]);
  return refreshToken;
}

// POST /auth/register
async function register(req, res) {
  const { email, password, fullName, orgName } = req.body;

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const verifyToken = crypto.randomBytes(32).toString('hex');

  // Create user
  const { rows: [user] } = await query(
    `INSERT INTO users (email, password_hash, full_name, email_verify_token)
     VALUES ($1,$2,$3,$4) RETURNING id, email, full_name`,
    [email.toLowerCase(), passwordHash, fullName, verifyToken]
  );

  // Create org
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50) + '-' + uuidv4().slice(0, 6);
  const { rows: [starterPlan] } = await query("SELECT id FROM plans WHERE name='starter'");
  if (!starterPlan) {
    logger.error('Starter plan not found — run database migrations and seed');
    return res.status(500).json({ error: 'Database not initialised. Please contact support.' });
  }
  const { rows: [org] } = await query(
    `INSERT INTO organizations (name, slug, plan_id, billing_email)
     VALUES ($1,$2,$3,$4) RETURNING id, name, slug`,
    [orgName, slug, starterPlan.id, email]
  );

  // Create admin membership (stays in platform DB)
  await query('INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,$3)', [org.id, user.id, 'administrator']);

  // Provision isolated tenant database — creates DB, applies schema, seeds guardrails + default policy
  try {
    await provisionTenantDb(org.id, user.id);
  } catch (err) {
    logger.error('Tenant provisioning failed during registration', { orgId: org.id, error: err.message });
    // Don't fail registration — admin can reprovision later; org is usable with platform fallback
  }

  await sendVerificationEmail(user, verifyToken);

  const { accessToken, refreshToken } = generateTokens(user.id, { email: user.email, fullName: user.full_name, emailVerified: false, isSuperuser: false });
  await storeRefreshToken(user.id, refreshToken);

  logger.info('New user registered', { userId: user.id, orgId: org.id });

  res.status(201).json({
    user: { id: user.id, email: user.email, fullName: user.full_name, emailVerified: false },
    orgs: [{ org_id: org.id, org_name: org.name, slug: org.slug, role: 'administrator', plan_name: 'starter' }],
    accessToken,
    refreshToken,
  });
}

// POST /auth/login
async function login(req, res) {
  const { email, password } = req.body;

  const { rows: [user] } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  if (!user.password_hash) return res.status(401).json({ error: 'This account uses social login' });

  // Account lockout check — must happen before bcrypt to avoid timing oracle
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    return res.status(429).json({ error: `Account locked due to too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`, code: 'ACCOUNT_LOCKED' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    // Increment failure counter; lock after 10 consecutive failures for 15 minutes
    await query(
      `UPDATE users
       SET login_attempts = login_attempts + 1,
           locked_until   = CASE WHEN login_attempts + 1 >= 10
                                 THEN NOW() + INTERVAL '15 minutes'
                                 ELSE locked_until END
       WHERE id = $1`,
      [user.id]
    );
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Successful auth — clear lockout state
  await query('UPDATE users SET login_attempts=0, locked_until=NULL WHERE id=$1', [user.id]);

  // Run all independent operations in parallel to cut login time
  const isSuperuser = user.is_superuser === true;
  const tokenExtra = { email: user.email, fullName: user.full_name, avatarUrl: user.avatar_url, emailVerified: user.email_verified, isSuperuser };
  const tokens = generateTokens(user.id, tokenExtra);

  // Superusers have no membership rows — fetch all orgs for them instead
  const membershipQuery = isSuperuser
    ? query(
        `SELECT o.id as org_id, o.name as org_name, o.slug,
                o.subscription_status, COALESCE(p.name, 'starter') as plan_name,
                'administrator' as role
         FROM organizations o
         LEFT JOIN plans p ON p.id = o.plan_id
         WHERE o.deleted_at IS NULL
         ORDER BY o.created_at ASC`,
        []
      )
    : query(
        `SELECT m.role, m.org_id, o.name as org_name, o.slug,
                COALESCE(p.name, 'starter') as plan_name
         FROM memberships m
         JOIN organizations o ON o.id=m.org_id
         LEFT JOIN plans p ON p.id=o.plan_id
         WHERE m.user_id=$1 AND m.active=true`,
        [user.id]
      );

  const [{ rows: memberships }] = await Promise.all([
    membershipQuery,
    storeRefreshToken(user.id, tokens.refreshToken),
    query('UPDATE users SET last_login_at=NOW(), login_attempts=0, locked_until=NULL WHERE id=$1', [user.id]),
  ]);
  const { accessToken, refreshToken } = tokens;

  res.json({
    user: { id: user.id, email: user.email, fullName: user.full_name, avatarUrl: user.avatar_url, emailVerified: user.email_verified, isSuperuser },
    orgs: memberships,
    accessToken,
    refreshToken,
  });
}

// POST /auth/refresh
async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' });

  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const { rows: [token] } = await query(
    'SELECT * FROM refresh_tokens WHERE token_hash=$1 AND revoked=false AND expires_at > NOW()',
    [hash]
  );
  if (!token) return res.status(401).json({ error: 'Invalid or expired refresh token' });

  // Rotate token
  await query('UPDATE refresh_tokens SET revoked=true WHERE id=$1', [token.id]);
  const { accessToken, refreshToken: newRefresh } = generateTokens(token.user_id);
  await storeRefreshToken(token.user_id, newRefresh);

  res.json({ accessToken, refreshToken: newRefresh });
}

// POST /auth/verify-email
async function verifyEmail(req, res) {
  const { token } = req.body;
  const { rows: [user] } = await query('SELECT id FROM users WHERE email_verify_token=$1', [token]);
  if (!user) return res.status(400).json({ error: 'Invalid or expired verification token' });

  await query('UPDATE users SET email_verified=true, email_verify_token=null WHERE id=$1', [user.id]);
  res.json({ message: 'Email verified successfully' });
}

// POST /auth/forgot-password
async function forgotPassword(req, res) {
  const { email } = req.body;
  const { rows: [user] } = await query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);

  // Always return 200 to prevent email enumeration
  if (!user) return res.json({ message: 'If that email exists, a reset link was sent' });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await query('UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3', [token, expires, user.id]);
  await sendPasswordResetEmail(user, token);

  res.json({ message: 'If that email exists, a reset link was sent' });
}

// POST /auth/reset-password
async function resetPassword(req, res) {
  const { token, password } = req.body;
  const { rows: [user] } = await query(
    'SELECT id FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()',
    [token]
  );
  if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

  const hash = await bcrypt.hash(password, 10);
  await query(
    'UPDATE users SET password_hash=$1, reset_token=null, reset_token_expires=null, login_attempts=0, locked_until=NULL WHERE id=$2',
    [hash, user.id]
  );
  await query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [user.id]); // invalidate all sessions

  res.json({ message: 'Password reset successfully' });
}

// DELETE /auth/account
async function deleteAccount(req, res) {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password is required to delete your account' });

  const { rows: [user] } = await query('SELECT * FROM users WHERE id=$1', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.password_hash) return res.status(400).json({ error: 'Social login accounts cannot be deleted this way — contact support.' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  // Block deletion if the user is the sole admin of an org that still has other active members
  const { rows: soloAdminOrgs } = await query(`
    SELECT m.org_id FROM memberships m
    WHERE m.user_id=$1 AND m.role='administrator' AND m.active=true
      AND (SELECT COUNT(*) FROM memberships m2 WHERE m2.org_id=m.org_id AND m2.role='administrator' AND m2.active=true) = 1
      AND (SELECT COUNT(*) FROM memberships m3 WHERE m3.org_id=m.org_id AND m3.active=true) > 1
  `, [req.userId]);

  if (soloAdminOrgs.length > 0) {
    return res.status(400).json({ error: 'You are the sole administrator of an organization that has other members. Assign another administrator or remove all members first.' });
  }

  // Null out all non-cascading FK references, then hard-delete
  await nullifyUserReferences(req.userId);
  await query('DELETE FROM users WHERE id=$1', [req.userId]);

  logger.info('User account deleted', { userId: req.userId });
  res.json({ message: 'Account deleted successfully' });
}

// POST /auth/logout
async function logout(req, res) {
  const { refreshToken } = req.body;
  const promises = [];

  if (refreshToken) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    promises.push(query('UPDATE refresh_tokens SET revoked=true WHERE token_hash=$1', [hash]));
  }

  // Revoke the current access token by JTI so it cannot be replayed until it expires
  if (req.tokenJti && req.tokenExpiresAt) {
    promises.push(
      query(
        'INSERT INTO revoked_tokens (jti, user_id, expires_at) VALUES ($1,$2,$3) ON CONFLICT (jti) DO NOTHING',
        [req.tokenJti, req.userId, req.tokenExpiresAt]
      )
    );
    // Also add to the in-process cache so the check in authenticate() is instant
    revokedJtiCache.add(req.tokenJti);
  }

  await Promise.all(promises);
  res.json({ message: 'Logged out' });
}

// GET /auth/me
async function me(req, res) {
  try {
    let orgs;

    if (req.isSuperuser) {
      // Superusers have no membership rows — return all active orgs so they
      // can pick one from the org switcher in the UI.
      const { rows } = await query(
        `SELECT o.id as org_id, o.name as org_name, o.slug,
                o.subscription_status, COALESCE(p.name, 'starter') as plan_name,
                'administrator' as role
         FROM organizations o
         LEFT JOIN plans p ON p.id = o.plan_id
         WHERE o.deleted_at IS NULL
         ORDER BY o.created_at ASC`,
        []
      );
      orgs = rows;
    } else {
      const { rows } = await query(
        `SELECT m.role, m.org_id, o.name as org_name, o.slug,
                o.subscription_status, COALESCE(p.name, 'starter') as plan_name
         FROM memberships m
         JOIN organizations o ON o.id=m.org_id
         LEFT JOIN plans p ON p.id=o.plan_id
         WHERE m.user_id=$1 AND m.active=true AND o.deleted_at IS NULL`,
        [req.userId]
      );
      orgs = rows;
    }

    // Always fetch email_verified from DB — JWT claim is stale after verification
    const { rows: [freshUser] } = await query(
      'SELECT email_verified FROM users WHERE id=$1', [req.userId]
    );

    res.json({
      user: { ...req.user, isSuperuser: req.user.is_superuser === true, emailVerified: freshUser?.email_verified === true },
      orgs,
    });
  } catch (err) {
    logger.error('me endpoint error', { error: err.message, userId: req.userId });
    res.status(500).json({ error: 'Failed to load session' });
  }
}

module.exports = { register, login, refresh, verifyEmail, forgotPassword, resetPassword, logout, me, deleteAccount, generateTokens, storeRefreshToken, revokedJtiCache };
