const crypto = require('crypto');
const { query } = require('../db/pool');
const { encrypt, decrypt } = require('../utils/encryption');
const { sendInviteEmail } = require('../utils/email');
const logger = require('../utils/logger');

// ── MEMBERS ──────────────────────────────────────────────────────────────────
async function listMembers(req, res) {
  const { rows } = await query(
    `SELECT m.id, m.role, m.active, m.created_at, m.invite_status, m.department,
            u.id as user_id, u.email, u.full_name, u.avatar_url, u.last_login_at
     FROM memberships m JOIN users u ON u.id=m.user_id
     WHERE m.org_id=$1 ORDER BY m.created_at`,
    [req.orgId]
  );
  res.json(rows);
}

async function inviteMember(req, res) {
  const { email, role = 'user' } = req.body;

  // Check member limit — superusers are exempt
  if (!req.isSuperuser) {
    const { rows: [{ count }] } = await query('SELECT COUNT(*) FROM memberships WHERE org_id=$1 AND active=true', [req.orgId]);
    if (req.org.members_limit > 0 && parseInt(count) >= req.org.members_limit) {
      return res.status(402).json({ error: 'Member limit reached for your plan. Upgrade to add more.' });
    }
  }

  // Find or create user
  let { rows: [user] } = await query('SELECT id, email, full_name FROM users WHERE email=$1', [email.toLowerCase()]);
  const token = crypto.randomBytes(32).toString('hex');

  if (!user) {
    const { rows: [newUser] } = await query(
      'INSERT INTO users (email) VALUES ($1) RETURNING id, email, full_name',
      [email.toLowerCase()]
    );
    user = newUser;
  }

  // Check if already a member
  const { rows: [existing] } = await query('SELECT id FROM memberships WHERE org_id=$1 AND user_id=$2', [req.orgId, user.id]);
  if (existing) return res.status(409).json({ error: 'User is already a member' });

  await query(
    'INSERT INTO memberships (org_id,user_id,role,invited_by,invite_token,invite_status) VALUES ($1,$2,$3,$4,$5,$6)',
    [req.orgId, user.id, role, req.userId, token, 'pending']
  );

  const { rows: [org] } = await query('SELECT name FROM organizations WHERE id=$1', [req.orgId]);
  const { rows: [inviter] } = await query('SELECT full_name FROM users WHERE id=$1', [req.userId]);
  await sendInviteEmail(user, org, inviter, token);

  res.json({ message: `Invitation sent to ${email}` });
}

async function updateMemberRole(req, res) {
  const { memberId } = req.params;
  const { role } = req.body;
  if (!['user', 'developer', 'administrator'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  // Prevent removing last admin
  if (role !== 'administrator') {
    const { rows: [{ count }] } = await query("SELECT COUNT(*) FROM memberships WHERE org_id=$1 AND role='administrator' AND active=true", [req.orgId]);
    if (parseInt(count) <= 1) {
      const { rows: [m] } = await query('SELECT role FROM memberships WHERE id=$1 AND org_id=$2', [memberId, req.orgId]);
      if (m?.role === 'administrator') return res.status(400).json({ error: 'Cannot remove the last administrator' });
    }
  }

  const { rows: [m] } = await query('UPDATE memberships SET role=$1 WHERE id=$2 AND org_id=$3 RETURNING *', [role, memberId, req.orgId]);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  res.json(m);
}

async function updateMemberDepartment(req, res) {
  const { memberId } = req.params;
  const { department } = req.body;
  // Allow empty string to clear the department
  const dept = typeof department === 'string' ? department.trim().slice(0, 100) : null;
  const { rows: [m] } = await query(
    'UPDATE memberships SET department=$1 WHERE id=$2 AND org_id=$3 RETURNING id, role, department',
    [dept || null, memberId, req.orgId]
  );
  if (!m) return res.status(404).json({ error: 'Member not found' });
  res.json(m);
}

async function removeMember(req, res) {
  const { memberId } = req.params;
  await query('UPDATE memberships SET active=false WHERE id=$1 AND org_id=$2', [memberId, req.orgId]);
  res.json({ removed: true });
}

// ── TENANT BRANDING ───────────────────────────────────────────────────────────
async function updateBranding(req, res) {
  const { logoUrl, primaryColor, customDomain, timezone, locale } = req.body;

  // Validate color format (allow null/empty to reset)
  if (primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
    return res.status(400).json({ error: 'primaryColor must be a valid hex color (e.g. #7F77DD)' });
  }

  // Validate custom domain (basic check)
  if (customDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(customDomain.toLowerCase())) {
    return res.status(400).json({ error: 'customDomain must be a valid domain (e.g. ai.yourcompany.com)' });
  }

  const { rows: [org] } = await query(
    `UPDATE organizations
     SET logo_url      = COALESCE($1, logo_url),
         primary_color = COALESCE($2, primary_color),
         custom_domain = $3,
         timezone      = COALESCE($4, timezone),
         locale        = COALESCE($5, locale),
         updated_at    = NOW()
     WHERE id = $6
     RETURNING id, logo_url, primary_color, custom_domain, timezone, locale`,
    [logoUrl || null, primaryColor || null, customDomain || null, timezone || null, locale || null, req.orgId]
  );

  if (!org) return res.status(404).json({ error: 'Organization not found' });
  res.json(org);
}

// ── PROVIDER CONNECTIONS ──────────────────────────────────────────────────────
async function listProviders(req, res) {
  const { rows } = await query(
    'SELECT id, provider, label, endpoint_url, model, max_tokens, system_prompt, enabled, created_at FROM provider_connections WHERE org_id=$1',
    [req.orgId]
  );
  // Never return encrypted keys
  res.json(rows.map(r => ({ ...r, hasKey: true })));
}

async function upsertProvider(req, res) {
  try {
    const { provider, label, apiKey, endpointUrl, model, maxTokens, systemPrompt, enabled } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider is required' });

    const encryptedKey = apiKey ? encrypt(apiKey) : undefined;

    const { rows: [existing] } = await query('SELECT id FROM provider_connections WHERE org_id=$1 AND provider=$2', [req.orgId, provider]);

    if (existing) {
      const sets = ['label=COALESCE($1,label)', 'endpoint_url=COALESCE($2,endpoint_url)', 'model=COALESCE($3,model)',
                    'max_tokens=COALESCE($4,max_tokens)', 'system_prompt=COALESCE($5,system_prompt)', 'enabled=COALESCE($6,enabled)'];
      const params = [label||null, endpointUrl||null, model||null, maxTokens||null, systemPrompt||null, enabled??null];
      if (encryptedKey) { sets.push(`encrypted_key=$${params.length+1}`); params.push(encryptedKey); }
      params.push(existing.id, req.orgId);
      const { rows: [conn] } = await query(
        `UPDATE provider_connections SET ${sets.join(',')} WHERE id=$${params.length-1} AND org_id=$${params.length} RETURNING id,provider,label,endpoint_url,model,max_tokens,system_prompt,enabled`,
        params
      );
      return res.json(conn);
    }

    const { rows: [conn] } = await query(
      `INSERT INTO provider_connections (org_id,provider,label,encrypted_key,endpoint_url,model,max_tokens,system_prompt,enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,provider,label,endpoint_url,model,max_tokens,system_prompt,enabled`,
      [req.orgId, provider, label||provider, encryptedKey||null, endpointUrl||null, model||null, maxTokens||1000, systemPrompt||'You are a helpful assistant.', enabled??true]
    );
    res.status(201).json(conn);
  } catch (err) {
    logger.error('upsertProvider error', { error: err.message, orgId: req.orgId });
    res.status(500).json({ error: 'Failed to save provider: ' + err.message });
  }
}

async function deleteProvider(req, res) {
  await query('DELETE FROM provider_connections WHERE provider=$1 AND org_id=$2', [req.params.provider, req.orgId]);
  res.json({ deleted: true });
}

// ── API KEYS ──────────────────────────────────────────────────────────────────
async function listApiKeys(req, res) {
  const { rows } = await query(
    'SELECT id, name, key_prefix, last_used_at, expires_at, revoked, created_at FROM api_keys WHERE org_id=$1 ORDER BY created_at DESC',
    [req.orgId]
  );
  res.json(rows);
}

async function createApiKey(req, res) {
  const { name, expiresAt } = req.body;
  const raw = 'ps_live_' + crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 17) + '...'; // VARCHAR(20) limit: 17 chars + '...' = 20

  await query(
    'INSERT INTO api_keys (org_id,created_by,name,key_hash,key_prefix,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [req.orgId, req.userId, name, hash, prefix, expiresAt||null]
  );

  // Return the raw key ONCE — never stored in plaintext
  res.status(201).json({ key: raw, prefix, message: 'Store this key securely — it will not be shown again.' });
}

async function revokeApiKey(req, res) {
  await query('UPDATE api_keys SET revoked=true WHERE id=$1 AND org_id=$2', [req.params.id, req.orgId]);
  res.json({ revoked: true });
}

async function deleteApiKey(req, res) {
  // Only allowed on revoked keys — extra guard so active keys can't be silently wiped
  const { rows } = await query('SELECT revoked FROM api_keys WHERE id=$1 AND org_id=$2', [req.params.id, req.orgId]);
  if (!rows[0]) return res.status(404).json({ error: 'API key not found' });
  if (!rows[0].revoked) return res.status(400).json({ error: 'Key must be revoked before it can be deleted' });
  await query('DELETE FROM api_keys WHERE id=$1 AND org_id=$2', [req.params.id, req.orgId]);
  res.json({ deleted: true });
}

// ── ORG SETTINGS (privacy / data) ────────────────────────────────────────────

const VALID_COMPLIANCE_MODES = new Set(['hipaa', 'financial', 'legal', 'government', null]);

// Allowed setting keys and their validators — whitelist prevents arbitrary JSONB writes
const SETTINGS_SCHEMA = {
  store_prompts:       (v) => typeof v === 'boolean',
  retention_days:      (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 3650),
  mask_pii_in_logs:    (v) => typeof v === 'boolean',
  // compliance_mode: null = off, or one of the industry mode keys
  compliance_mode:     (v) => v === null || (typeof v === 'string' && VALID_COMPLIANCE_MODES.has(v)),
};

async function getSettings(req, res) {
  const { rows: [org] } = await query('SELECT settings FROM organizations WHERE id=$1', [req.orgId]);
  // Merge stored settings with defaults so callers always get a complete object
  const defaults = { store_prompts: true, retention_days: null, mask_pii_in_logs: false, compliance_mode: null };
  res.json({ ...defaults, ...(org?.settings || {}) });
}

async function updateSettings(req, res) {
  const incoming = req.body || {};
  const patch    = {};
  const errors   = [];

  for (const [key, value] of Object.entries(incoming)) {
    if (!SETTINGS_SCHEMA[key]) { errors.push(`Unknown setting: ${key}`); continue; }
    if (!SETTINGS_SCHEMA[key](value)) { errors.push(`Invalid value for ${key}`); continue; }
    patch[key] = value;
  }
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid settings provided' });

  // Merge patch into existing JSONB (|| operator merges at top level)
  const { rows: [org] } = await query(
    `UPDATE organizations SET settings = settings || $1::jsonb, updated_at = NOW()
     WHERE id = $2 RETURNING settings`,
    [JSON.stringify(patch), req.orgId]
  );
  const defaults = { store_prompts: true, retention_days: null, mask_pii_in_logs: false, compliance_mode: null };
  res.json({ ...defaults, ...(org?.settings || {}) });
}

// ── COMPLIANCE TEMPLATES ──────────────────────────────────────────────────────
const { getIndustryTemplates } = require('../utils/compliance');

/** GET /orgs/:orgId/settings/compliance-templates — returns all industry template definitions */
async function getComplianceTemplates(req, res) {
  res.json(getIndustryTemplates());
}

module.exports = { listMembers, inviteMember, updateMemberRole, updateMemberDepartment, removeMember, updateBranding, listProviders, upsertProvider, deleteProvider, listApiKeys, createApiKey, revokeApiKey, deleteApiKey, getSettings, updateSettings, getComplianceTemplates };
