const jwt = require('jsonwebtoken');
const { query } = require('../db/pool');
const logger = require('../utils/logger');

// Lazy-load to avoid circular dependency (auth.controller → auth.js → auth.controller)
function getRevokedJtiCache() {
  return require('../controllers/auth.controller').revokedJtiCache;
}

// Verify JWT access token
// User fields are embedded in the token payload (set at login) so we skip the DB query on every request.
// The /auth/me endpoint is the only place that re-fetches from DB to get fresh data when needed.
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // JTI revocation check — in-process cache first, then DB fallback
    if (payload.jti) {
      const cache = getRevokedJtiCache();
      let revoked = cache.has(payload.jti);
      if (!revoked) {
        const { rows } = await query('SELECT 1 FROM revoked_tokens WHERE jti=$1', [payload.jti]);
        if (rows.length > 0) {
          cache.add(payload.jti); // warm the cache
          revoked = true;
        }
      }
      if (revoked) return res.status(401).json({ error: 'Token has been revoked', code: 'TOKEN_REVOKED' });
    }

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
    // Expose JTI and expiry so logout can revoke this specific token
    req.tokenJti = payload.jti;
    req.tokenExpiresAt = payload.exp ? new Date(payload.exp * 1000) : null;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Invalid token' });
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Load org membership + role into req.membership
async function loadOrg(req, res, next) {
  const orgId = req.params.orgId || req.headers['x-org-id'];
  if (!orgId) return res.status(400).json({ error: 'Missing org ID' });
  if (!UUID_RE.test(orgId)) return res.status(400).json({ error: 'Invalid org ID — please log out and back in' });

  // Superusers get full org access regardless of membership
  if (req.isSuperuser) {
    const { rows: orgRows } = await query(
      `SELECT o.id as org_id, o.name as org_name, o.slug, o.plan_id,
              o.subscription_status, o.tenant_status, o.deleted_at,
              o.primary_color, o.logo_url, o.custom_domain, o.timezone,
              o.settings,
              (o.created_at + INTERVAL '7 days') AS trial_ends_at,
              (o.subscription_status = 'active')  AS is_paid,
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
            o.subscription_status, o.tenant_status, o.deleted_at,
            o.primary_color, o.logo_url, o.custom_domain, o.timezone,
            o.settings,
            (o.created_at + INTERVAL '7 days') AS trial_ends_at,
            (o.subscription_status = 'active')  AS is_paid,
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

/**
 * Trial access gate — call AFTER loadOrg.
 *
 * requireTrialAccess()                   → blocked during trial AND after expiry
 * requireTrialAccess({ trial: true })    → allowed during active trial, blocked after expiry
 *
 * Rules:
 *  - Superusers:        always pass
 *  - Paid subscription: always pass
 *  - Free plan, trial active   + trial:true  → pass
 *  - Free plan, trial active   + trial:false → 403 TRIAL_RESTRICTED
 *  - Free plan, trial expired  (any)         → 402 TRIAL_EXPIRED
 */
function requireTrialAccess({ trial = false } = {}) {
  return (req, res, next) => {
    if (req.isSuperuser) return next();
    if (req.apiKeyAuth)  return next(); // API-key callers bypass trial gate

    const org = req.org;
    if (!org) return next(); // loadOrg didn't run — let other middleware handle it

    // Paid subscription — full access regardless of plan label
    if (org.is_paid || org.subscription_status === 'active') return next();

    // Not on starter → full access (enterprise plan, etc.)
    if (org.plan_name !== 'starter') return next();

    // Check trial window
    const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
    const trialActive = trialEnd && trialEnd > new Date();

    if (!trialActive) {
      return res.status(402).json({
        error: 'Your 7-day free trial has expired. Please upgrade your plan to continue.',
        code: 'TRIAL_EXPIRED',
      });
    }

    if (!trial) {
      return res.status(403).json({
        error: 'This feature is not available during the free trial. Upgrade to unlock it.',
        code: 'TRIAL_RESTRICTED',
      });
    }

    next();
  };
}

// API key auth (for SDK proxy requests)
async function authenticateApiKey(req, res, next) {
  const key = req.headers['x-promptsense-key'];
  if (!key) return next(); // fall through to JWT auth

  const crypto = require('crypto');
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const { rows } = await query(
    `SELECT ak.org_id, ak.revoked, ak.expires_at, ak.downstream_system_id, o.subscription_status
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
  req.apiKeyDownstreamId = rows[0].downstream_system_id || null;
  next();
}

module.exports = { authenticate, loadOrg, requireRole, requireSuperuser, requireTrialAccess, authenticateApiKey };
