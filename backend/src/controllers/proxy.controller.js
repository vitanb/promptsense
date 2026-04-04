const axios = require('axios');
const { query } = require('../db/pool');
const { decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

// Run regex guardrails against text
async function runGuardrails(orgId, text, direction) {
  const { rows } = await query(
    "SELECT * FROM guardrails WHERE org_id=$1 AND enabled=true AND (type=$2 OR type='both') ORDER BY sort_order",
    [orgId, direction]
  );
  const flags = [];
  for (const g of rows) {
    if (!g.pattern) {
      if (g.id === 'length' && text.length > 3000) flags.push(g);
      continue;
    }
    try {
      if (new RegExp(g.pattern, 'i').test(text)) flags.push(g);
    } catch (e) { /* invalid regex — skip */ }
  }
  return flags;
}

// Fire webhooks asynchronously
async function fireWebhooks(orgId, eventType, payload) {
  const { rows } = await query(
    "SELECT * FROM webhooks WHERE org_id=$1 AND active=true AND (events @> ARRAY['all'] OR events @> ARRAY[$2])",
    [orgId, eventType]
  );
  for (const wh of rows) {
    const body = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), ...payload });
    const crypto = require('crypto');
    const sig = crypto.createHmac('sha256', wh.secret || '').update(body).digest('hex');
    axios.post(wh.url, body, {
      headers: { 'Content-Type': 'application/json', 'X-PromptSense-Signature': sig },
      timeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '5000'),
    }).then(async () => {
      await query('UPDATE webhooks SET last_fired_at=NOW(), total_deliveries=total_deliveries+1 WHERE id=$1', [wh.id]);
      await query('INSERT INTO webhook_deliveries (webhook_id,event_type,payload,status_code,success) VALUES ($1,$2,$3,$4,true)', [wh.id, eventType, payload, 200]);
    }).catch(async (err) => {
      await query('INSERT INTO webhook_deliveries (webhook_id,event_type,payload,success,error) VALUES ($1,$2,$3,false,$4)', [wh.id, eventType, payload, err.message]);
    });
  }
}

// Upsert usage record
async function recordUsage(orgId, tokens) {
  const period = new Date(); period.setDate(1); period.setHours(0,0,0,0);
  await query(`
    INSERT INTO usage_records (org_id, period, requests, tokens)
    VALUES ($1, $2, 1, $3)
    ON CONFLICT (org_id, period) DO UPDATE
    SET requests=usage_records.requests+1, tokens=usage_records.tokens+$3, updated_at=NOW()
  `, [orgId, period, tokens || 0]);
}

// Check usage quota
async function checkQuota(orgId, limit) {
  if (limit === -1) return true; // unlimited
  const period = new Date(); period.setDate(1); period.setHours(0,0,0,0);
  const { rows: [rec] } = await query('SELECT requests FROM usage_records WHERE org_id=$1 AND period=$2', [orgId, period]);
  return (rec?.requests || 0) < limit;
}

// POST /orgs/:orgId/proxy
async function proxyPrompt(req, res) {
  // req.safeBody is populated by validateProxy middleware (sanitised + length-checked)
  const { prompt, provider: providerOverride, stream = false } = req.safeBody || req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

  const t0 = Date.now();

  // Check quota
  const withinQuota = await checkQuota(req.orgId, req.org.requests_per_month);
  if (!withinQuota) return res.status(429).json({ error: 'Monthly request quota exceeded. Upgrade your plan.' });

  // ── Step 1: Input guardrails ────────────────────────────────────────────────
  const inputFlags = await runGuardrails(req.orgId, prompt, 'input');
  const blocked = inputFlags.filter(g => g.action === 'block');

  if (blocked.length > 0) {
    const msg = `[Blocked: ${blocked.map(g => g.name).join(', ')}]`;
    await recordUsage(req.orgId, 0);
    await fireWebhooks(req.orgId, 'block', { prompt, guardrails: blocked.map(g => g.name), direction: 'input' });
    const event = await query(
      `INSERT INTO audit_events (org_id,user_id,provider,route,input_text,output_text,input_flags,passed,latency_ms,tokens_used)
       VALUES ($1,$2,$3,'blocked',$4,$5,$6,false,$7,0) RETURNING id`,
      [req.orgId, req.userId, providerOverride || 'blocked', prompt, msg, blocked.map(g => g.name), Date.now()-t0]
    );
    return res.status(200).json({ output: msg, blocked: true, inputFlags: blocked.map(g=>g.name), outputFlags: [], auditId: event.rows[0].id, latency: Date.now()-t0 });
  }

  // ── Step 2: Load provider connection ───────────────────────────────────────
  const providerName = providerOverride || 'anthropic';
  const { rows: [conn] } = await query('SELECT * FROM provider_connections WHERE org_id=$1 AND provider=$2 AND enabled=true', [req.orgId, providerName]);
  if (!conn) return res.status(400).json({ error: `Provider '${providerName}' not configured or disabled` });

  const apiKey = decrypt(conn.encrypted_key);
  if (!apiKey) return res.status(400).json({ error: 'Provider API key could not be decrypted' });

  // ── Step 3: Try downstream first ───────────────────────────────────────────
  let raw = null;
  let route = providerName;
  const { rows: [downstream] } = await query('SELECT * FROM downstream_systems WHERE org_id=$1 AND enabled=true LIMIT 1', [req.orgId]);

  if (downstream) {
    try {
      const body = downstream.body_template.replace('{{prompt}}', prompt.replace(/"/g, '\\"'));
      let headers = { 'Content-Type': 'application/json' };
      if (downstream.extra_headers) Object.assign(headers, downstream.extra_headers);
      if (downstream.encrypted_api_key) headers['Authorization'] = 'Bearer ' + decrypt(downstream.encrypted_api_key);

      const dsRes = await axios({ method: downstream.http_method, url: downstream.endpoint_url, data: body, headers, timeout: downstream.timeout_ms });
      const data = dsRes.data;
      if (downstream.response_field) {
        raw = downstream.response_field.split('.').reduce((o, k) => o?.[k], data);
        raw = raw !== undefined ? String(raw) : JSON.stringify(data);
      } else {
        raw = typeof data === 'string' ? data : JSON.stringify(data);
      }
      route = 'downstream';
    } catch (err) {
      logger.warn('Downstream failed', { error: err.message, orgId: req.orgId });
      if (!downstream.fallback_to_provider) {
        return res.status(502).json({ error: 'Downstream system unavailable' });
      }
    }
  }

  // ── Step 4: Call LLM provider ──────────────────────────────────────────────
  if (raw === null) {
    try {
      const PROVIDER_CALLS = {
        anthropic: async () => {
          const r = await axios.post(conn.endpoint_url || 'https://api.anthropic.com/v1/messages', {
            model: conn.model || 'claude-sonnet-4-20250514',
            max_tokens: conn.max_tokens || 1000,
            system: conn.system_prompt || 'You are a helpful assistant.',
            messages: [{ role: 'user', content: prompt }],
          }, { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } });
          return r.data?.content?.find(b => b.type === 'text')?.text || '';
        },
        openai: async () => {
          const r = await axios.post(conn.endpoint_url || 'https://api.openai.com/v1/chat/completions', {
            model: conn.model || 'gpt-4o',
            max_tokens: conn.max_tokens || 1000,
            messages: [{ role: 'system', content: conn.system_prompt || '' }, { role: 'user', content: prompt }],
          }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
          return r.data?.choices?.[0]?.message?.content || '';
        },
        gemini: async () => {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${conn.model || 'gemini-1.5-pro'}:generateContent`;
          const r = await axios.post(url, {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: conn.max_tokens || 1000 },
          }, { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey } });
          return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        },
        mistral: async () => {
          const r = await axios.post(conn.endpoint_url || 'https://api.mistral.ai/v1/chat/completions', {
            model: conn.model || 'mistral-large-latest',
            max_tokens: conn.max_tokens || 1000,
            messages: [{ role: 'system', content: conn.system_prompt || '' }, { role: 'user', content: prompt }],
          }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
          return r.data?.choices?.[0]?.message?.content || '';
        },
      };

      const caller = PROVIDER_CALLS[providerName];
      if (!caller) return res.status(400).json({ error: `Unsupported provider: ${providerName}` });
      raw = await caller();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) return res.status(401).json({ error: 'Invalid provider API key' });
      if (status === 429) return res.status(429).json({ error: 'Provider rate limit reached' });
      return res.status(502).json({ error: err.response?.data?.error?.message || err.message });
    }
  }

  // ── Step 5: Output guardrails ──────────────────────────────────────────────
  const outputFlags = await runGuardrails(req.orgId, raw, 'output');
  const outBlocked = outputFlags.filter(g => g.action === 'block');
  const finalOutput = outBlocked.length > 0
    ? `[Output blocked: ${outBlocked.map(g => g.name).join(', ')}]`
    : raw;

  // ── Step 6: Persist + respond ──────────────────────────────────────────────
  const tokens = Math.round(raw.length / 4);
  await recordUsage(req.orgId, tokens);

  if (outBlocked.length > 0 || outputFlags.some(g => g.severity === 'critical')) {
    await fireWebhooks(req.orgId, outBlocked.length ? 'block' : 'critical', { output: finalOutput, guardrails: outputFlags.map(g => g.name), direction: 'output' });
  }

  const latency = Date.now() - t0;
  const { rows: [event] } = await query(
    `INSERT INTO audit_events (org_id,user_id,provider,model,route,input_text,output_text,input_flags,output_flags,passed,latency_ms,tokens_used)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [req.orgId, req.userId||null, providerName, conn.model, route, prompt, finalOutput,
     inputFlags.map(g=>g.name), outputFlags.map(g=>g.name), outBlocked.length===0, latency, tokens]
  );

  res.json({
    output: finalOutput,
    blocked: outBlocked.length > 0,
    inputFlags: inputFlags.map(g => g.name),
    outputFlags: outputFlags.map(g => g.name),
    provider: providerName,
    model: conn.model,
    route,
    latency,
    tokens,
    auditId: event.id,
  });
}

// GET /orgs/:orgId/audit
async function getAuditLog(req, res) {
  const { page = 1, limit = 50, provider, passed, from, to } = req.query;
  const offset = (page - 1) * limit;
  const conditions = ['org_id=$1'];
  const params = [req.orgId];
  let idx = 2;
  if (provider) { conditions.push(`provider=$${idx++}`); params.push(provider); }
  if (passed !== undefined) { conditions.push(`passed=$${idx++}`); params.push(passed === 'true'); }
  if (from) { conditions.push(`created_at>=$${idx++}`); params.push(from); }
  if (to)   { conditions.push(`created_at<=$${idx++}`); params.push(to); }

  const where = conditions.join(' AND ');
  const { rows } = await query(
    `SELECT * FROM audit_events WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
    [...params, limit, offset]
  );
  const { rows: [{ count }] } = await query(`SELECT COUNT(*) FROM audit_events WHERE ${where}`, params);
  res.json({ events: rows, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
}

// GET /orgs/:orgId/analytics
async function getAnalytics(req, res) {
  const { days = 30 } = req.query;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [summary, byProvider, byHour, flagSummary, usagePeriod, byUser, byDepartment] = await Promise.all([
    // Overall summary
    query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER(WHERE passed) as passed,
              COUNT(*) FILTER(WHERE NOT passed) as failed,
              AVG(latency_ms) as avg_latency,
              SUM(tokens_used) as total_tokens
       FROM audit_events WHERE org_id=$1 AND created_at>=$2`,
      [req.orgId, from]
    ),

    // By provider
    query(
      `SELECT provider, COUNT(*) as count
       FROM audit_events WHERE org_id=$1 AND created_at>=$2
       GROUP BY provider ORDER BY count DESC`,
      [req.orgId, from]
    ),

    // By hour
    query(
      `SELECT DATE_TRUNC('hour', created_at) as hour,
              COUNT(*) as total,
              COUNT(*) FILTER(WHERE NOT passed) as flagged
       FROM audit_events WHERE org_id=$1 AND created_at>=$2
       GROUP BY hour ORDER BY hour`,
      [req.orgId, from]
    ),

    // Top guardrail flags
    query(
      `SELECT unnest(input_flags||output_flags) as flag, COUNT(*) as count
       FROM audit_events WHERE org_id=$1 AND created_at>=$2
       GROUP BY flag ORDER BY count DESC LIMIT 10`,
      [req.orgId, from]
    ),

    // Current billing period usage
    query(
      `SELECT requests, blocked, tokens, cost_usd
       FROM usage_records WHERE org_id=$1 ORDER BY period DESC LIMIT 1`,
      [req.orgId]
    ),

    // Per-user breakdown: requests, flagged, tokens, estimated cost
    // Includes API-key requests (user_id IS NULL → shown as "API / System")
    query(
      `SELECT
         COALESCE(u.id::text, 'api') AS user_id,
         COALESCE(u.full_name, u.email, 'API / System') AS name,
         COALESCE(u.email, '') AS email,
         COALESCE(m.department, '') AS department,
         COUNT(*) AS total,
         COUNT(*) FILTER(WHERE NOT ae.passed) AS flagged,
         SUM(ae.tokens_used) AS tokens,
         ROUND((SUM(ae.tokens_used) * 0.00001)::numeric, 4) AS est_cost_usd
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.user_id
       LEFT JOIN memberships m ON m.user_id = ae.user_id AND m.org_id = ae.org_id
       WHERE ae.org_id = $1 AND ae.created_at >= $2
       GROUP BY u.id, u.full_name, u.email, m.department
       ORDER BY total DESC
       LIMIT 25`,
      [req.orgId, from]
    ),

    // Per-department breakdown
    // Rows with no department (API keys or untagged users) grouped as "Unassigned"
    query(
      `SELECT
         COALESCE(NULLIF(m.department, ''), 'Unassigned') AS department,
         COUNT(*) AS total,
         COUNT(*) FILTER(WHERE NOT ae.passed) AS flagged,
         SUM(ae.tokens_used) AS tokens,
         ROUND((SUM(ae.tokens_used) * 0.00001)::numeric, 4) AS est_cost_usd
       FROM audit_events ae
       LEFT JOIN memberships m ON m.user_id = ae.user_id AND m.org_id = ae.org_id
       WHERE ae.org_id = $1 AND ae.created_at >= $2
       GROUP BY COALESCE(NULLIF(m.department, ''), 'Unassigned')
       ORDER BY total DESC`,
      [req.orgId, from]
    ),
  ]);

  res.json({
    summary:       summary.rows[0],
    byProvider:    byProvider.rows,
    byHour:        byHour.rows,
    flagSummary:   flagSummary.rows,
    currentPeriod: usagePeriod.rows[0] || { requests: 0, blocked: 0, tokens: 0, cost_usd: 0 },
    byUser:        byUser.rows,
    byDepartment:  byDepartment.rows,
  });
}

module.exports = { proxyPrompt, getAuditLog, getAnalytics };
