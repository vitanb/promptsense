const jwt = require('jsonwebtoken');
const { query } = require('../db/pool');
const logger = require('../utils/logger');

// Verify JWT access token
// User fields are embedded in the token payload (set at login) so we skip the DB query on every request.
// The /auth/me endpoint is the only place that re-fetches from DB to get fresh data when needed.
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Reconstruct req.user from the token payload — no DB round-trip needed
    req.user = {
      id: payload.userId,
      email: payload.email,
      full_name: payload.fullName,
      avatar_url: payload.avatarUrl,
      email_verified: payload.emailVerified,
      is_superuser: payload.isSuperuser === true,
    };
    req.userId = payload.userId;
    req.isSuperuser = payload.isSuperuser === true;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Load org membership + role into req.membership
async function loadOrg(req, res, next) {
  const orgId = req.params.orgId || req.headers['x-org-id'];
  if (!orgId) return res.status(400).json({ error: 'Missing org ID' });

  // Superusers get full org access regardless of membership
  if (req.isSuperuser) {
    const { rows: orgRows } = await query(
      `SELECT o.id as org_id, o.name as org_name, o.slug, o.plan_id,
              o.subscription_status, o.trial_ends_at, o.tenant_status, o.deleted_at,
              o.primary_color, o.logo_url, o.custom_domain, o.timezone,
              p.name as plan_name, p.requests_per_month,
              p.members_limit, p.guardrails_limit, p.webhooks_limit
       FROM organizations o JOIN plans p ON p.id = o.plan_id
       WHERE o.id = $1`,
      [orgId]
    );
    if (!orgRows[0]) return res.status(404).json({ error: 'Organization not found' });
    if (orgRows[0].deleted_at) return res.status(403).json({ error: 'This organization has been deleted', code: 'ORG_DELETED' });
    req.org = orgRows[0];
    req.orgId = orgId;
    req.role = 'administrator'; // superusers act as administrators in any org
    return next();
  }

  const { rows } = await query(
    `SELECT m.role, m.active, o.id as org_id, o.name as org_name, o.slug, o.plan_id,
            o.subscription_status, o.trial_ends_at, o.tenant_status, o.deleted_at,
            o.primary_color, o.logo_url, o.custom_domain, o.timezone,
            p.name as plan_name, p.requests_per_month,
            p.members_limit, p.guardrails_limit, p.webhooks_limit
     FROM memberships m
     JOIN organizations o ON o.id = m.org_id
     JOIN plans p ON p.id = o.plan_id
     WHERE m.user_id = $1 AND m.org_id = $2`,
    [req.userId, orgId]
  );
  if (!rows[0] || !rows[0].active) return res.status(403).json({ error: 'Access denied to this organization' });

  // Block access to deleted tenants
  if (rows[0].deleted_at) return res.status(403).json({ error: 'This organization has been deleted', code: 'ORG_DELETED' });

  // Block access to suspended tenants
  if (rows[0].tenant_status === 'suspended') {
    return res.status(402).json({
      error: 'This organization has been suspended. Please contact support.',
      code: 'ORG_SUSPENDED',
    });
  }

  req.org = rows[0];
  req.orgId = orgId;
  req.role = rows[0].role;
  next();
}

// Role-based permission gates — superusers bypass all role checks
const ROLE_HIERARCHY = { user: 0, developer: 1, administrator: 2 };

function requireRole(minRole) {
  return (req, res, next) => {
    if (req.isSuperuser) return next(); // superusers have full access everywhere
    const userLevel = ROLE_HIERARCHY[req.role] ?? -1;
    const minLevel = ROLE_HIERARCHY[minRole] ?? 99;
    if (userLevel < minLevel) return res.status(403).json({ error: `Requires ${minRole} role or higher` });
    next();
  };
}

// Platform-level superuser gate (only is_superuser=true users pass)
function requireSuperuser(req, res, next) {
  if (!req.isSuperuser) return res.status(403).json({ error: 'Super-user access required' });
  next();
}

// API key auth (for SDK proxy requests)
async function authenticateApiKey(req, res, next) {
  const key = req.headers['x-promptsense-key'];
  if (!key) return next(); // fall through to JWT auth

  const crypto = require('crypto');
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const { rows } = await query(
    `SELECT ak.org_id, ak.revoked, ak.expires_at, o.subscription_status
     FROM api_keys ak JOIN organizations o ON o.id = ak.org_id
     WHERE ak.key_hash = $1`,
    [keyHash]
  );

  if (!rows[0] || rows[0].revoked) return res.status(401).json({ error: 'Invalid API key' });
  if (rows[0].expires_at && new Date(rows[0].expires_at) < new Date()) return res.status(401).json({ error: 'API key expired' });

  // Update last used
  await query('UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1', [keyHash]);
  req.orgId = rows[0].org_id;
  req.apiKeyAuth = true;
  next();
}

module.exports = { authenticate, loadOrg, requireRole, requireSuperuser, authenticateApiKey };
