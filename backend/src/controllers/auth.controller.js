const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/pool');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { SYSTEM_GUARDRAILS } = require('../db/seed');
const logger = require('../utils/logger');

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
  const refreshToken = crypto.randomBytes(40).toString('hex');
  return { accessToken, refreshToken };
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

  const passwordHash = await bcrypt.hash(password, 12);
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
  const { rows: [org] } = await query(
    `INSERT INTO organizations (name, slug, plan_id, billing_email)
     VALUES ($1,$2,$3,$4) RETURNING id, name, slug`,
    [orgName, slug, starterPlan.id, email]
  );

  // Create admin membership
  await query('INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,$3)', [org.id, user.id, 'administrator']);

  // Seed system guardrails for this org
  for (let i = 0; i < SYSTEM_GUARDRAILS.length; i++) {
    const g = SYSTEM_GUARDRAILS[i];
    await query(
      `INSERT INTO guardrails (org_id, name, description, type, severity, action, pattern, color, enabled, is_system, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)`,
      [org.id, g.name, g.description, g.type, g.severity, g.action, g.pattern, g.color, g.enabled, i]
    );
  }

  // Seed default policy
  const guardrailRows = await query(
    "SELECT id FROM guardrails WHERE org_id=$1 AND name IN ('PII detection','Prompt injection','Toxicity filter','Secrets detection','Hallucination check','Output length cap')",
    [org.id]
  );
  const gids = guardrailRows.rows.map(r => r.id);
  await query(
    "INSERT INTO policies (org_id, name, description, guardrail_ids, is_active, created_by) VALUES ($1,'Default policy','Standard guardrails for all traffic',$2,true,$3)",
    [org.id, gids, user.id]
  );

  await sendVerificationEmail(user, verifyToken);

  const { accessToken, refreshToken } = generateTokens(user.id);
  await storeRefreshToken(user.id, refreshToken);

  logger.info('New user registered', { userId: user.id, orgId: org.id });

  res.status(201).json({
    user: { id: user.id, email: user.email, fullName: user.full_name },
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

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  // Get org memberships
  const { rows: memberships } = await query(
    `SELECT m.role, m.org_id, o.name as org_name, o.slug, p.name as plan_name
     FROM memberships m JOIN organizations o ON o.id=m.org_id JOIN plans p ON p.id=o.plan_id
     WHERE m.user_id=$1 AND m.active=true`,
    [user.id]
  );

  await query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);

  const { accessToken, refreshToken } = generateTokens(user.id);
  await storeRefreshToken(user.id, refreshToken);

  res.json({
    user: { id: user.id, email: user.email, fullName: user.full_name, avatarUrl: user.avatar_url, emailVerified: user.email_verified },
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

  const hash = await bcrypt.hash(password, 12);
  await query('UPDATE users SET password_hash=$1, reset_token=null, reset_token_expires=null WHERE id=$2', [hash, user.id]);
  await query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [user.id]); // invalidate all sessions

  res.json({ message: 'Password reset successfully' });
}

// POST /auth/logout
async function logout(req, res) {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await query('UPDATE refresh_tokens SET revoked=true WHERE token_hash=$1', [hash]);
  }
  res.json({ message: 'Logged out' });
}

// GET /auth/me
async function me(req, res) {
  const { rows: memberships } = await query(
    `SELECT m.role, m.org_id, o.name as org_name, o.slug, o.subscription_status, p.name as plan_name
     FROM memberships m JOIN organizations o ON o.id=m.org_id JOIN plans p ON p.id=o.plan_id
     WHERE m.user_id=$1 AND m.active=true`,
    [req.userId]
  );
  res.json({ user: req.user, orgs: memberships });
}

module.exports = { register, login, refresh, verifyEmail, forgotPassword, resetPassword, logout, me };
