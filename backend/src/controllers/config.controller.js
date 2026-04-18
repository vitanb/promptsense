// All tables in this controller live in the tenant DB (req.db).
// The platform pool is NOT imported here.
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ── GUARDRAILS ────────────────────────────────────────────────────────────────
async function listGuardrails(req, res) {
  const { rows } = await req.db.query(
    'SELECT * FROM guardrails WHERE org_id=$1 ORDER BY sort_order, created_at',
    [req.orgId]
  );
  res.json(rows);
}

async function updateGuardrail(req, res) {
  const { id } = req.params;
  const { name, description, type, severity, action, pattern, color, enabled, countries } = req.body;
  const { rows: [g] } = await req.db.query(
    `UPDATE guardrails SET name=COALESCE($1,name), description=COALESCE($2,description),
     type=COALESCE($3,type), severity=COALESCE($4,severity), action=COALESCE($5,action),
     pattern=COALESCE($6,pattern), color=COALESCE($7,color), enabled=COALESCE($8,enabled),
     countries=COALESCE($9,countries)
     WHERE id=$10 AND org_id=$11 RETURNING *`,
    [name, description, type, severity, action, pattern, color, enabled,
     countries !== undefined ? countries : null,
     id, req.orgId]
  );
  if (!g) return res.status(404).json({ error: 'Guardrail not found' });
  res.json(g);
}

async function createGuardrail(req, res) {
  const { name, description, type, severity, action, pattern, color, countries } = req.body;
  // Check plan limit — superusers are exempt
  if (!req.isSuperuser) {
    const { rows: [{ count }] } = await req.db.query('SELECT COUNT(*) FROM guardrails WHERE org_id=$1', [req.orgId]);
    if (req.org.guardrails_limit > 0 && parseInt(count) >= req.org.guardrails_limit) {
      return res.status(402).json({ error: 'Guardrail limit reached for your plan. Upgrade to add more.' });
    }
  }
  const { rows: [g] } = await req.db.query(
    `INSERT INTO guardrails (org_id,name,description,type,severity,action,pattern,color,enabled,countries)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING *`,
    [req.orgId, name, description||'', type||'both', severity||'medium', action||'block',
     pattern||'', color||'#7F77DD', countries||[]]
  );
  res.status(201).json(g);
}

async function deleteGuardrail(req, res) {
  const { id } = req.params;
  const { rowCount } = await req.db.query('DELETE FROM guardrails WHERE id=$1 AND org_id=$2 AND is_system=false', [id, req.orgId]);
  if (!rowCount) return res.status(404).json({ error: 'Guardrail not found or is a system rule' });
  res.json({ deleted: true });
}

// ── POLICIES ─────────────────────────────────────────────────────────────────
async function listPolicies(req, res) {
  const { rows } = await req.db.query('SELECT * FROM policies WHERE org_id=$1 ORDER BY created_at', [req.orgId]);
  res.json(rows);
}

async function createPolicy(req, res) {
  const { name, description, guardrailIds } = req.body;
  const { rows: [p] } = await req.db.query(
    'INSERT INTO policies (org_id,name,description,guardrail_ids,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.orgId, name, description||'', guardrailIds||[], req.userId]
  );
  res.status(201).json(p);
}

async function updatePolicy(req, res) {
  const { id } = req.params;
  const { name, description, guardrailIds, isActive } = req.body;
  const client = await req.db.getClient();
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
  await req.db.query('DELETE FROM policies WHERE id=$1 AND org_id=$2', [id, req.orgId]);
  res.json({ deleted: true });
}

// ── TEMPLATES ────────────────────────────────────────────────────────────────
async function listTemplates(req, res) {
  const { rows } = await req.db.query(
    'SELECT * FROM prompt_templates WHERE org_id=$1 ORDER BY category, name',
    [req.orgId]
  );
  res.json(rows);
}

async function createTemplate(req, res) {
  const { name, category, prompt, isFavorite } = req.body;
  const { rows: [t] } = await req.db.query(
    'INSERT INTO prompt_templates (org_id,created_by,name,category,prompt,is_favorite) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.orgId, req.userId, name, category||'General', prompt, isFavorite||false]
  );
  res.status(201).json(t);
}

async function updateTemplate(req, res) {
  const { id } = req.params;
  const { name, category, prompt, isFavorite } = req.body;
  const { rows: [t] } = await req.db.query(
    `UPDATE prompt_templates SET name=COALESCE($1,name), category=COALESCE($2,category),
     prompt=COALESCE($3,prompt), is_favorite=COALESCE($4,is_favorite)
     WHERE id=$5 AND org_id=$6 RETURNING *`,
    [name, category, prompt, isFavorite, id, req.orgId]
  );
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json(t);
}

async function deleteTemplate(req, res) {
  await req.db.query('DELETE FROM prompt_templates WHERE id=$1 AND org_id=$2', [req.params.id, req.orgId]);
  res.json({ deleted: true });
}

// ── WEBHOOKS ─────────────────────────────────────────────────────────────────
async function listWebhooks(req, res) {
  const { rows } = await req.db.query('SELECT * FROM webhooks WHERE org_id=$1 ORDER BY created_at', [req.orgId]);
  res.json(rows);
}

async function createWebhook(req, res) {
  const { name, url, events, active } = req.body;
  if (!req.isSuperuser) {
    const { rows: [{ count }] } = await req.db.query('SELECT COUNT(*) FROM webhooks WHERE org_id=$1', [req.orgId]);
    if (req.org.webhooks_limit > 0 && parseInt(count) >= req.org.webhooks_limit) {
      return res.status(402).json({ error: 'Webhook limit reached for your plan.' });
    }
  }
  const secret = require('crypto').randomBytes(20).toString('hex');
  const { rows: [w] } = await req.db.query(
    'INSERT INTO webhooks (org_id,name,url,secret,events,active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.orgId, name, url, secret, events||[], active??true]
  );
  res.status(201).json(w);
}

async function updateWebhook(req, res) {
  const { id } = req.params;
  const { name, url, events, active } = req.body;
  const { rows: [w] } = await req.db.query(
    `UPDATE webhooks SET name=COALESCE($1,name), url=COALESCE($2,url),
     events=COALESCE($3,events), active=COALESCE($4,active)
     WHERE id=$5 AND org_id=$6 RETURNING *`,
    [name, url, events, active, id, req.orgId]
  );
  if (!w) return res.status(404).json({ error: 'Webhook not found' });
  res.json(w);
}

async function deleteWebhook(req, res) {
  await req.db.query('DELETE FROM webhooks WHERE id=$1 AND org_id=$2', [req.params.id, req.orgId]);
  res.json({ deleted: true });
}

module.exports = {
  listGuardrails, updateGuardrail, createGuardrail, deleteGuardrail,
  listPolicies, createPolicy, updatePolicy, deletePolicy,
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  listWebhooks, createWebhook, updateWebhook, deleteWebhook,
};
