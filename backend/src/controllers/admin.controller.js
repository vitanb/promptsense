const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../db/pool');
const logger = require('../utils/logger');

// ── PLATFORM STATS ────────────────────────────────────────────────────────────
async function getStats(req, res) {
  const [users, orgs, requests, revenue] = await Promise.all([
    query(`SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_30d,
                  COUNT(*) FILTER (WHERE is_superuser = true) as superusers
           FROM users WHERE deleted_at IS NULL`),
    query(`SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_30d,
                  COUNT(*) FILTER (WHERE subscription_status = 'active') as paying
           FROM organizations WHERE deleted_at IS NULL`),
    query(`SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as month
           FROM prompt_logs`),
    query(`SELECT COALESCE(SUM(p.price_monthly), 0) as mrr
           FROM organizations o JOIN plans p ON p.id=o.plan_id
           WHERE o.subscription_status='active' AND o.deleted_at IS NULL AND p.price_monthly > 0`),
  ]);

  res.json({
    users:    users.rows[0],
    orgs:     orgs.rows[0],
    requests: requests.rows[0],
    mrr:      revenue.rows[0].mrr,
  });
}

// ── USER MANAGEMENT ───────────────────────────────────────────────────────────
async function listUsers(req, res) {
  const { search = '', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const where = search
    ? `WHERE (u.email ILIKE $3 OR u.full_name ILIKE $3) AND u.deleted_at IS NULL`
    : `WHERE u.deleted_at IS NULL`;
  const params = search
    ? [parseInt(limit), offset, `%${search}%`]
    : [parseInt(limit), offset];

  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.email_verified, u.is_superuser,
            u.last_login_at, u.created_at,
            COUNT(m.id) FILTER (WHERE m.active = true) as org_count,
            STRING_AGG(DISTINCT o.name, ', ' ORDER BY o.name) FILTER (WHERE m.active = true) as org_names,
            MAX(m.role) FILTER (WHERE m.active = true) as highest_role
     FROM users u
     LEFT JOIN memberships m ON m.user_id = u.id
     LEFT JOIN organizations o ON o.id = m.org_id AND o.deleted_at IS NULL
     ${where}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const { rows: [{ total }] } = await query(
    `SELECT COUNT(*) as total FROM users u ${where}`,
    search ? [`%${search}%`] : []
  );

  res.json({ users: rows, total: parseInt(total), page: parseInt(page) });
}

async function getUser(req, res) {
  const { userId } = req.params;
  const { rows: [user] } = await query(
    `SELECT u.id, u.email, u.full_name, u.email_verified, u.is_superuser, u.last_login_at, u.created_at
     FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { rows: orgs } = await query(
    `SELECT m.role, m.active, m.created_at as joined_at, o.id, o.name, p.name as plan_name
     FROM memberships m JOIN organizations o ON o.id=m.org_id JOIN plans p ON p.id=o.plan_id
     WHERE m.user_id = $1 AND o.deleted_at IS NULL ORDER BY m.created_at`,
    [userId]
  );

  res.json({ ...user, orgs });
}

async function deleteUser(req, res) {
  const { userId } = req.params;

  // Prevent superusers from deleting themselves
  if (userId === req.userId) {
    return res.status(400).json({ error: 'You cannot delete your own superuser account' });
  }

  const { rows: [user] } = await query('SELECT id, email, is_superuser FROM users WHERE id=$1 AND deleted_at IS NULL', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Revoke tokens + remove memberships + hard-delete user
  await query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [userId]);
  await query('DELETE FROM memberships WHERE user_id=$1', [userId]);
  await query('DELETE FROM users WHERE id=$1', [userId]);

  logger.warn('Super admin deleted user', { deletedBy: req.userId, deletedUser: userId, email: user.email });
  res.json({ deleted: true, email: user.email });
}

async function toggleSuperuser(req, res) {
  const { userId } = req.params;
  if (userId === req.userId) return res.status(400).json({ error: 'You cannot change your own superuser status' });

  const { rows: [user] } = await query('SELECT id, is_superuser FROM users WHERE id=$1 AND deleted_at IS NULL', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newVal = !user.is_superuser;
  await query('UPDATE users SET is_superuser=$1 WHERE id=$2', [newVal, userId]);
  logger.info('Superuser status changed', { changedBy: req.userId, targetUser: userId, isSuperuser: newVal });
  res.json({ id: userId, is_superuser: newVal });
}

async function resetUserPassword(req, res) {
  const { userId } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash=$1 WHERE id=$2 AND deleted_at IS NULL', [hash, userId]);
  // Revoke all existing tokens to force re-login
  await query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [userId]);
  logger.warn('Super admin reset user password', { resetBy: req.userId, targetUser: userId });
  res.json({ message: 'Password reset successfully. User will need to log in again.' });
}

// ── ORGANIZATION MANAGEMENT ───────────────────────────────────────────────────
async function listOrgs(req, res) {
  const { search = '', page = 1, limit = 50, status = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let conditions = ['o.deleted_at IS NULL'];
  const params = [parseInt(limit), offset];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(o.name ILIKE $${params.length} OR o.slug ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`o.tenant_status = $${params.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await query(
    `SELECT o.id, o.name, o.slug, o.subscription_status, o.tenant_status,
            o.suspended_at, o.suspended_reason, o.created_at,
            o.primary_color, o.logo_url, o.custom_domain, o.timezone,
            p.name as plan_name, p.display_name as plan_display,
            COUNT(m.id) FILTER (WHERE m.active=true) as member_count,
            COUNT(pl.id) FILTER (WHERE pl.created_at > NOW() - INTERVAL '30 days') as requests_30d
     FROM organizations o
     JOIN plans p ON p.id = o.plan_id
     LEFT JOIN memberships m ON m.org_id = o.id
     LEFT JOIN prompt_logs pl ON pl.org_id = o.id
     ${where}
     GROUP BY o.id, p.id
     ORDER BY o.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const { rows: [{ total }] } = await query(
    `SELECT COUNT(*) as total FROM organizations o ${where}`,
    params.slice(2)
  );

  res.json({ orgs: rows, total: parseInt(total), page: parseInt(page) });
}

async function getOrgDetail(req, res) {
  const { orgId } = req.params;
  const { rows: [org] } = await query(
    `SELECT o.*, p.name as plan_name, p.display_name as plan_display,
            COUNT(m.id) FILTER (WHERE m.active=true) as member_count
     FROM organizations o
     JOIN plans p ON p.id=o.plan_id
     LEFT JOIN memberships m ON m.org_id=o.id
     WHERE o.id=$1 AND o.deleted_at IS NULL
     GROUP BY o.id, p.id`,
    [orgId]
  );
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  const { rows: events } = await query(
    `SELECT te.event_type, te.metadata, te.created_at, u.email as actor_email
     FROM tenant_events te LEFT JOIN users u ON u.id=te.actor_id
     WHERE te.org_id=$1 ORDER BY te.created_at DESC LIMIT 20`,
    [orgId]
  );

  res.json({ ...org, events });
}

async function createOrg(req, res) {
  const { name, adminEmail, adminName, adminPassword, planName = 'starter' } = req.body;
  if (!name || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'name, adminEmail, and adminPassword are required' });
  }

  const { rows: [plan] } = await query('SELECT id FROM plans WHERE name=$1', [planName]);
  if (!plan) return res.status(400).json({ error: 'Unknown plan' });

  // Create or find the admin user
  let { rows: [adminUser] } = await query('SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL', [adminEmail.toLowerCase()]);
  if (!adminUser) {
    const hash = await bcrypt.hash(adminPassword, 12);
    const { rows: [newUser] } = await query(
      'INSERT INTO users (email, full_name, password_hash, email_verified) VALUES ($1,$2,$3,true) RETURNING id',
      [adminEmail.toLowerCase(), adminName || adminEmail.split('@')[0], hash]
    );
    adminUser = newUser;
  }

  // Create the org
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + crypto.randomBytes(3).toString('hex');
  const { rows: [org] } = await query(
    `INSERT INTO organizations (name, slug, plan_id, subscription_status, billing_email, tenant_status)
     VALUES ($1,$2,$3,'active',$4,'active') RETURNING id, name, slug`,
    [name, slug, plan.id, adminEmail.toLowerCase()]
  );

  // Add user as administrator
  await query(
    'INSERT INTO memberships (org_id, user_id, role, invite_status) VALUES ($1,$2,$3,$4)',
    [org.id, adminUser.id, 'administrator', 'accepted']
  );

  // Log the event
  await query(
    "INSERT INTO tenant_events (org_id, event_type, actor_id, metadata) VALUES ($1,'created',$2,$3)",
    [org.id, req.userId, JSON.stringify({ plan: planName, admin: adminEmail })]
  );

  logger.info('Super admin created tenant', { createdBy: req.userId, orgId: org.id, name, admin: adminEmail });
  res.status(201).json({ org, adminUser: { id: adminUser.id, email: adminEmail } });
}

async function suspendOrg(req, res) {
  const { orgId } = req.params;
  const { reason = '' } = req.body;

  const { rows: [org] } = await query('SELECT id, name, tenant_status FROM organizations WHERE id=$1 AND deleted_at IS NULL', [orgId]);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (org.tenant_status === 'suspended') return res.status(400).json({ error: 'Organization is already suspended' });

  await query(
    'UPDATE organizations SET tenant_status=$1, suspended_at=NOW(), suspended_reason=$2, suspended_by=$3 WHERE id=$4',
    ['suspended', reason || null, req.userId, orgId]
  );
  // Revoke all org API keys immediately
  await query('UPDATE api_keys SET revoked=true WHERE org_id=$1', [orgId]);

  await query(
    "INSERT INTO tenant_events (org_id, event_type, actor_id, metadata) VALUES ($1,'suspended',$2,$3)",
    [orgId, req.userId, JSON.stringify({ reason })]
  );

  logger.warn('Super admin suspended org', { suspendedBy: req.userId, orgId, name: org.name, reason });
  res.json({ suspended: true, name: org.name });
}

async function activateOrg(req, res) {
  const { orgId } = req.params;

  const { rows: [org] } = await query('SELECT id, name, tenant_status FROM organizations WHERE id=$1 AND deleted_at IS NULL', [orgId]);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (org.tenant_status === 'active') return res.status(400).json({ error: 'Organization is already active' });

  await query(
    'UPDATE organizations SET tenant_status=$1, suspended_at=NULL, suspended_reason=NULL, suspended_by=NULL WHERE id=$2',
    ['active', orgId]
  );

  await query(
    "INSERT INTO tenant_events (org_id, event_type, actor_id, metadata) VALUES ($1,'activated',$2,$3)",
    [orgId, req.userId, JSON.stringify({})]
  );

  logger.info('Super admin activated org', { activatedBy: req.userId, orgId, name: org.name });
  res.json({ activated: true, name: org.name });
}

async function updateOrgPlan(req, res) {
  const { orgId } = req.params;
  const { planName } = req.body;

  const { rows: [plan] } = await query('SELECT id FROM plans WHERE name=$1', [planName]);
  if (!plan) return res.status(400).json({ error: 'Unknown plan' });

  const { rows: [org] } = await query(
    'UPDATE organizations SET plan_id=$1 WHERE id=$2 AND deleted_at IS NULL RETURNING id, name',
    [plan.id, orgId]
  );
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  await query(
    "INSERT INTO tenant_events (org_id, event_type, actor_id, metadata) VALUES ($1,'plan_changed',$2,$3)",
    [orgId, req.userId, JSON.stringify({ planName })]
  );

  logger.info('Super admin changed org plan', { changedBy: req.userId, orgId, planName });
  res.json({ id: orgId, plan_name: planName });
}

async function deleteOrg(req, res) {
  const { orgId } = req.params;

  const { rows: [org] } = await query('SELECT id, name FROM organizations WHERE id=$1 AND deleted_at IS NULL', [orgId]);
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  // Soft-delete the org (preserves data for compliance/audit)
  await query('UPDATE organizations SET deleted_at=NOW(), tenant_status=$1 WHERE id=$2', ['suspended', orgId]);
  // Deactivate all memberships
  await query('UPDATE memberships SET active=false WHERE org_id=$1', [orgId]);
  // Revoke all org API keys
  await query('UPDATE api_keys SET revoked=true WHERE org_id=$1', [orgId]);

  await query(
    "INSERT INTO tenant_events (org_id, event_type, actor_id, metadata) VALUES ($1,'deleted',$2,$3)",
    [orgId, req.userId, JSON.stringify({ name: org.name })]
  );

  logger.warn('Super admin deleted org', { deletedBy: req.userId, orgId, name: org.name });
  res.json({ deleted: true, name: org.name });
}

module.exports = {
  getStats, listUsers, getUser, deleteUser, toggleSuperuser, resetUserPassword,
  listOrgs, getOrgDetail, createOrg, suspendOrg, activateOrg, updateOrgPlan, deleteOrg,
};
