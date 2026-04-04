const { query } = require('../db/pool');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ── GUARDRAILS ────────────────────────────────────────────────────────────────
async function listGuardrails(req, res) {
  const { rows } = await query(
    'SELECT * FROM guardrails WHERE org_id=$1 ORDER BY sort_order, created_at',
    [req.orgId]
  );
  res.json(rows);
}

async function updateGuardrail(req, res) {
  const { id } = req.params;
  const { name, description, type, severity, action, pattern, color, enabled } = req.body;
  const { rows: [g] } = await query(
    `UPDATE guardrails SET name=COALESCE($1,name), description=COALESCE($2,description),
     type=COALESCE($3,type), severity=COALESCE($4,severity), action=COALESCE($5,action),
     pattern=COALESCE($6,pattern), color=COALESCE($7,color), enabled=COALESCE($8,enabled)
     WHERE id=$9 AND org_id=$10 RETURNING *`,
    [name, description, type, severity, action, pattern, color, enabled, id, req.orgId]
  );
  if (!g) return res.status(404).json({ error: 'Guardrail not found' });
  res.json(g);
}

async function createGuardrail(req, res) {
  const { name, description, type, severity, action, pattern, color } = req.body;
  // Check plan limit
  const { rows: [{ count }] } = await query('SELECT COUNT(*) FROM guardrails WHERE org_id=$1', [req.orgId]);
  if (req.org.guardrails_limit > 0 && parseInt(count) >= req.org.guardrails_limit) {
    return res.status(402).json({ error: 'Guardrail limit reached for your plan. Upgrade to add more.' });
  }
  const { rows: [g] } = await query(
    `INSERT INTO guardrails (org_id,name,description,type,severity,action,pattern,color,enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
    [req.orgId, name, description||'', type||'both', severity||'medium', action||'block', pattern||'', color||'#7F77DD']
  );
  res.status(201).json(g);
}

async function deleteGuardrail(req, res) {
  const { id } = req.params;
  const { rowCount } = await query('DELETE FROM guardrails WHERE id=$1 AND org_id=$2 AND is_system=false', [id, req.orgId]);
  if (!rowCount) return res.status(404).json({ error: 'Guardrail not found or is a system rule' });
  res.json({ deleted: true });
}

// ── POLICIES ─────────────────────────────────────────────────────────────────
async function listPolicies(req, res) {
  const { rows } = await query('SELECT * FROM policies WHERE org_id=$1 ORDER BY created_at', [req.orgId]);
  res.json(rows);
}

async function createPolicy(req, res) {
  const { name, description, guardrailIds } = req.body;
  const { rows: [p] } = await query(
    'INSERT INTO policies (org_id,name,description,guardrail_ids,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.orgId, name, description||'', guardrailIds||[], req.userId]
  );
  res.status(201).json(p);
}

async function updatePolicy(req, res) {
  const { id } = req.params;
  const { name, description, guardrailIds, isActive } = req.body;
  const client = (await require('../db/pool').getClient());
  try {
    await client.query('BEGIN');
    if (isActive) await client.query('UPDATE policies SET is_active=false WHERE org_id=$1', [req.orgId]);
    const { rows: [p] } = await client.query(
      `UPDATE policies SET name=COALESCE($1,name), description=COALESCE($2,description),
       guardrail_ids=COALESCE($3,guardrail_ids), is_active=COALESCE($4,is_active)
       WHERE id=$5 AND org_id=$6 RETURNING *`,
      [name, description, guardrailIds, isActive, id, req.orgId]
    );
    await client.query('COMMIT');
    res.json(p);
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

async function deletePolicy(req, res) {
  const { id } = req.params;
  await query('DELETE FROM policies WHERE id=$1 AND org_id=$2', [id, req.orgId]);
  res.json({ deleted: true });
}

// ── TEMPLATES ────────────────────────────────────────────────────────────────
async function listTemplates(req, res) {
  const { rows } = await query(
    'SELECT * FROM prompt_templates WHERE org_id=$1 ORDER BY category, name',
    [req.orgId]
  );
  res.json(rows);
}

async function createTemplate(req, res) {
  const { name, category, prompt, isFavorite } = req.body;
  const { rows: [t] } = await query(
    'INSERT INTO prompt_templates (org_id,created_by,name,category,prompt,is_favorite) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.orgId, req.userId, name, category||'General', prompt, isFavorite||false]
  );
  res.status(201).json(t);
}

async function updateTemplate(req, res) {
  const { id } = req.params;
  const { name, category, prompt, isFavorite } = req.body;
  const { rows: [t] } = await query(
    `UPDATE prompt_templates SET name=COALESCE($1,name), category=COALESCE($2,category),
     prompt=COALESCE($3,prompt), is_favorite=COALESCE($4,is_favorite)
     WHERE id=$5 AND org_id=$6 RETURNING *`,
    [name, category, prompt, isFavorite, id, req.orgId]
  );
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json(t);
}

async function deleteTemplate(req, res) {
  await query('DELETE FROM prompt_templates WHERE id=$1 AND org_id=$2', [req.params.id, req.orgId]);
  res.json({ deleted: true });
}

// ── WEBHOOKS ─────────────────────────────────────────────────────────────────
async function listWebhooks(req, res) {
  const { rows } = await query('SELECT * FROM webhooks WHERE org_id=$1 ORDER BY created_at', [req.orgId]);
  res.json(rows);
}

async function createWebhook(req, res) {
  const { name, url, events, active } = req.body;
  const { rows: [{ count }] } = await query('SELECT COUNT(*) FROM webhooks WHERE org_id=$1', [req.orgId]);
  if (req.org.webhooks_limit > 0 && parseInt(count) >= req.org.webhooks_limit) {
    return res.status(402).json({ error: 'Webhook limit reached for your plan.' });
  }
  const secret = require('crypto').randomBytes(20).toString('hex');
  const { rows: [w] } = await query(
    'INSERT INTO webhooks (org_id,name,url,secret,events,active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.orgId, name, url, secret, events||[], active??true]
  );
  res.status(201).json(w);
}

async function updateWebhook(req, res) {
  const { id } = req.params;
  const { name, url, events, active } = req.body;
  const { rows: [w] } = await query(
    `UPDATE webhooks SET name=COALESCE($1,name), url=COALESCE($2,url),
     events=COALESCE($3,events), active=COALESCE($4,active)
     WHERE id=$5 AND org_id=$6 RETURNING *`,
    [name, url, events, active, id, req.orgId]
  );
  if (!w) return res.status(404).json({ error: 'Webhook not found' });
  res.json(w);
}

async function deleteWebhook(req, res) {
  await query('DELETE FROM webhooks WHERE id=$1 AND org_id=$2', [req.params.id, req.orgId]);
  res.json({ deleted: true });
}

module.exports = {
  listGuardrails, updateGuardrail, createGuardrail, deleteGuardrail,
  listPolicies, createPolicy, updatePolicy, deletePolicy,
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  listWebhooks, createWebhook, updateWebhook, deleteWebhook,
};
