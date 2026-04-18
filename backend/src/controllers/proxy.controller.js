const axios = require('axios');
const { query: platformQuery } = require('../db/pool'); // platform DB — used for nothing here currently
const { decrypt } = require('../utils/encryption');
const { renderBodyTemplate } = require('../middleware/validate');
const { runComplianceRules } = require('../utils/compliance');
const { sendBlockAlert } = require('../utils/slack');
const logger = require('../utils/logger');

// All tenant-data functions receive `db` (req.db) instead of using a module-level import

// ── Country detection ─────────────────────────────────────────────────────────
let geoip = null;
try { geoip = require('geoip-lite'); } catch (_) {}

function detectCountry(req) {
  if (!geoip) return null;
  const raw = req.headers['x-forwarded-for'] || req.ip || '';
  const ip  = raw.split(',')[0].trim();
  const geo = geoip.lookup(ip);
  return geo?.country ? geo.country.toUpperCase() : null;
}

// ── Guardrail evaluation (tenant DB) ─────────────────────────────────────────
async function runGuardrails(db, orgId, text, direction, countryCode) {
  const { rows } = await db.query(
    "SELECT * FROM guardrails WHERE org_id=$1 AND enabled=true AND (type=$2 OR type='both') ORDER BY sort_order",
    [orgId, direction]
  );
  const flags = [];
  for (const g of rows) {
    if (g.countries && g.countries.length > 0 && countryCode) {
      if (!g.countries.includes(countryCode)) continue;
    }
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

// Fire webhooks asynchronously (tenant DB)
async function fireWebhooks(db, orgId, eventType, payload) {
  const { rows } = await db.query(
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
      await db.query('UPDATE webhooks SET last_fired_at=NOW(), total_deliveries=total_deliveries+1 WHERE id=$1', [wh.id]);
      await db.query('INSERT INTO webhook_deliveries (webhook_id,event_type,payload,status_code,success) VALUES ($1,$2,$3,$4,true)', [wh.id, eventType, payload, 200]);
    }).catch(async (err) => {
      await db.query('INSERT INTO webhook_deliveries (webhook_id,event_type,payload,success,error) VALUES ($1,$2,$3,false,$4)', [wh.id, eventType, payload, err.message]);
    });
  }
}

// Upsert usage record (tenant DB)
async function recordUsage(db, orgId, tokens) {
  const period = new Date(); period.setDate(1); period.setHours(0,0,0,0);
  await db.query(`
    INSERT INTO usage_records (org_id, period, requests, tokens)
    VALUES ($1, $2, 1, $3)
    ON CONFLICT (org_id, period) DO UPDATE
    SET requests=usage_records.requests+1, tokens=usage_records.tokens+$3, updated_at=NOW()
  `, [orgId, period, tokens || 0]);
}

// Check usage quota (tenant DB)
async function checkQuota(db, orgId, limit) {
  if (limit === -1) return true;
  const period = new Date(); period.setDate(1); period.setHours(0,0,0,0);
  const { rows: [rec] } = await db.query('SELECT requests FROM usage_records WHERE org_id=$1 AND period=$2', [orgId, period]);
  return (rec?.requests || 0) < limit;
}

// POST /orgs/:orgId/proxy
async function proxyPrompt(req, res) {
  const { prompt, provider: providerOverride, stream = false } = req.safeBody || req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

  const db = req.db;  // tenant DB
  const t0 = Date.now();
  const countryCode = detectCountry(req);

  const withinQuota = await checkQuota(db, req.orgId, req.org.requests_per_month);
  if (!withinQuota) return res.status(429).json({ error: 'Monthly request quota exceeded. Upgrade your plan.' });

  // ── Step 1: Input guardrails ────────────────────────────────────────────────
  const complianceMode = req.org?.settings?.compliance_mode || null;
  const inputFlags = await runGuardrails(db, req.orgId, prompt, 'input', countryCode);

  if (complianceMode) {
    const complianceInputFlags = runComplianceRules(complianceMode, prompt, 'input');
    for (const cf of complianceInputFlags) {
      if (!inputFlags.some(f => f.name === cf.name)) inputFlags.push(cf);
    }
  }

  const blocked = inputFlags.filter(g => g.action === 'block');
  const storePrompts = req.org?.settings?.store_prompts !== false;

  if (blocked.length > 0) {
    const msg = `[Blocked: ${blocked.map(g => g.name).join(', ')}]`;
    await recordUsage(db, req.orgId, 0);
    await fireWebhooks(db, req.orgId, 'block', { prompt, guardrails: blocked.map(g => g.name), direction: 'input' });
    const event = await db.query(
      `INSERT INTO audit_events (org_id,user_id,provider,route,input_text,output_text,input_flags,passed,latency_ms,tokens_used)
       VALUES ($1,$2,$3,'blocked',$4,$5,$6,false,$7,0) RETURNING id`,
      [req.orgId, req.userId, providerOverride || 'blocked',
       storePrompts ? prompt : null,
       storePrompts ? msg    : null,
       blocked.map(g => g.name), Date.now()-t0]
    );
    const slackAlertsUrl = req.org?.settings?.slack_alerts_url;
    if (slackAlertsUrl && req.org?.settings?.slack_alerts_enabled !== false) {
      sendBlockAlert(slackAlertsUrl, {
        orgName: req.org.org_name,
        prompt: storePrompts ? prompt : '[not stored]',
        flags: blocked.map(g => g.name),
        provider: providerOverride || 'unknown',
        auditId: event.rows[0].id,
        appUrl: process.env.FRONTEND_URL || 'https://app.prompt-sense.net',
      });
    }
    return res.status(200).json({ output: msg, blocked: true, inputFlags: blocked.map(g=>g.name), outputFlags: [], auditId: event.rows[0].id, latency: Date.now()-t0 });
  }

  // ── Step 2: Load provider connection (tenant DB) ────────────────────────────
  const providerName = providerOverride || 'anthropic';
  const { rows: [conn] } = await db.query('SELECT * FROM provider_connections WHERE org_id=$1 AND provider=$2 AND enabled=true', [req.orgId, providerName]);
  if (!conn) return res.status(400).json({ error: `Provider '${providerName}' not configured or disabled` });

  const apiKey = decrypt(conn.encrypted_key);
  if (!apiKey) return res.status(400).json({ error: 'Provider API key could not be decrypted' });

  // ── Step 3: Try downstream first (tenant DB) ────────────────────────────────
  let raw = null;
  let route = providerName;
  let downstreamQuery;
  if (req.apiKeyDownstreamId) {
    downstreamQuery = await db.query('SELECT * FROM downstream_systems WHERE id=$1 AND org_id=$2 AND enabled=true', [req.apiKeyDownstreamId, req.orgId]);
  } else {
    downstreamQuery = await db.query('SELECT * FROM downstream_systems WHERE org_id=$1 AND enabled=true LIMIT 1', [req.orgId]);
  }
  const { rows: [downstream] } = downstreamQuery;

  if (downstream) {
    try {
      const body = renderBodyTemplate(downstream.body_template, prompt);
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
      const openaiCompat = async (endpointUrl, authHeader) => {
        const url = (endpointUrl || '').replace('{model}', conn.model || '');
        const headers = { 'Content-Type': 'application/json', ...authHeader };
        const body = {
          model:      conn.model || undefined,
          max_tokens: conn.max_tokens || 1000,
          messages: [
            ...(conn.system_prompt ? [{ role: 'system', content: conn.system_prompt }] : []),
            { role: 'user', content: prompt },
          ],
        };
        const r = await axios.post(url, body, { headers });
        return r.data?.choices?.[0]?.message?.content || '';
      };

      const awsSign = (method, service, region, host, path, body, accessKey, secretKey) => {
        const crypto = require('crypto');
        const now    = new Date();
        const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
        const dateStamp = amzDate.slice(0, 8);
        const bodyHash  = crypto.createHash('sha256').update(body).digest('hex');
        const canonReq  = [method, path, '', `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`, 'content-type;host;x-amz-date', bodyHash].join('\n');
        const credScope = `${dateStamp}/${region}/${service}/aws4_request`;
        const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${crypto.createHash('sha256').update(canonReq).digest('hex')}`;
        const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
        const sigKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), service), 'aws4_request');
        const sig    = crypto.createHmac('sha256', sigKey).update(strToSign).digest('hex');
        const auth   = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credScope}, SignedHeaders=content-type;host;x-amz-date, Signature=${sig}`;
        return { 'Authorization': auth, 'x-amz-date': amzDate, 'Content-Type': 'application/json' };
      };

      const PROVIDER_CALLS = {
        anthropic: async () => {
          const r = await axios.post(
            conn.endpoint_url || 'https://api.anthropic.com/v1/messages',
            { model: conn.model || 'claude-sonnet-4-20250514', max_tokens: conn.max_tokens || 1000,
              system: conn.system_prompt || 'You are a helpful assistant.',
              messages: [{ role: 'user', content: prompt }] },
            { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } }
          );
          return r.data?.content?.find(b => b.type === 'text')?.text || '';
        },
        gemini: async () => {
          const model = conn.model || 'gemini-2.0-flash';
          const url   = (conn.endpoint_url || `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`).replace('{model}', model);
          const systemParts = conn.system_prompt ? [{ text: conn.system_prompt }] : [];
          const body = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: conn.max_tokens || 1000 },
            ...(systemParts.length ? { systemInstruction: { parts: systemParts } } : {}),
          };
          const r = await axios.post(url, body, { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey } });
          return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        },
        cohere: async () => {
          const r = await axios.post(
            conn.endpoint_url || 'https://api.cohere.com/v1/chat',
            { model: conn.model || 'command-r-plus', max_tokens: conn.max_tokens || 1000,
              message: prompt,
              ...(conn.system_prompt ? { preamble: conn.system_prompt } : {}) },
            { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } }
          );
          return r.data?.text || '';
        },
        replicate: async () => {
          const model = conn.model || '';
          const url   = (conn.endpoint_url || `https://api.replicate.com/v1/models/${model}/predictions`).replace('{model}', model);
          const create = await axios.post(url,
            { input: { prompt, max_new_tokens: conn.max_tokens || 1000, system_prompt: conn.system_prompt || '' } },
            { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Prefer': 'wait' } }
          );
          const output = create.data?.output;
          if (Array.isArray(output)) return output.join('');
          if (typeof output === 'string') return output;
          const pollUrl = create.data?.urls?.get;
          if (!pollUrl) return '';
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const poll = await axios.get(pollUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
            if (poll.data?.status === 'succeeded') {
              const out = poll.data?.output;
              return Array.isArray(out) ? out.join('') : (out || '');
            }
            if (poll.data?.status === 'failed') throw new Error(poll.data?.error || 'Replicate prediction failed');
          }
          throw new Error('Replicate prediction timed out');
        },
        bedrock: async () => {
          const [accessKey, secretKey, region = 'us-east-1'] = apiKey.split('|');
          if (!accessKey || !secretKey) throw new Error('Bedrock credentials must be formatted as ACCESS_KEY_ID|SECRET_ACCESS_KEY|REGION');
          const model  = conn.model || 'anthropic.claude-3-haiku-20240307-v1:0';
          const host   = `bedrock-runtime.${region}.amazonaws.com`;
          const path   = `/model/${encodeURIComponent(model)}/converse`;
          const bodyObj = {
            messages: [{ role: 'user', content: [{ text: prompt }] }],
            inferenceConfig: { maxTokens: conn.max_tokens || 1000 },
            ...(conn.system_prompt ? { system: [{ text: conn.system_prompt }] } : {}),
          };
          const bodyStr = JSON.stringify(bodyObj);
          const headers = awsSign('POST', 'bedrock', region, host, path, bodyStr, accessKey, secretKey);
          const r = await axios.post(`https://${host}${path}`, bodyStr, { headers });
          return r.data?.output?.message?.content?.[0]?.text || '';
        },
        openai:      () => openaiCompat(conn.endpoint_url || 'https://api.openai.com/v1/chat/completions',            { Authorization: `Bearer ${apiKey}` }),
        azure:       () => openaiCompat(conn.endpoint_url,                                                             { Authorization: `Bearer ${apiKey}`, 'api-key': apiKey }),
        mistral:     () => openaiCompat(conn.endpoint_url || 'https://api.mistral.ai/v1/chat/completions',             { Authorization: `Bearer ${apiKey}` }),
        groq:        () => openaiCompat(conn.endpoint_url || 'https://api.groq.com/openai/v1/chat/completions',        { Authorization: `Bearer ${apiKey}` }),
        deepseek:    () => openaiCompat(conn.endpoint_url || 'https://api.deepseek.com/v1/chat/completions',           { Authorization: `Bearer ${apiKey}` }),
        xai:         () => openaiCompat(conn.endpoint_url || 'https://api.x.ai/v1/chat/completions',                  { Authorization: `Bearer ${apiKey}` }),
        perplexity:  () => openaiCompat(conn.endpoint_url || 'https://api.perplexity.ai/chat/completions',            { Authorization: `Bearer ${apiKey}` }),
        together:    () => openaiCompat(conn.endpoint_url || 'https://api.together.xyz/v1/chat/completions',           { Authorization: `Bearer ${apiKey}` }),
        fireworks:   () => openaiCompat(conn.endpoint_url || 'https://api.fireworks.ai/inference/v1/chat/completions', { Authorization: `Bearer ${apiKey}` }),
        openrouter:  () => openaiCompat(conn.endpoint_url || 'https://openrouter.ai/api/v1/chat/completions',          { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://promptsense.ai', 'X-Title': 'PromptSense' }),
        aimlapi:     () => openaiCompat(conn.endpoint_url || 'https://api.aimlapi.com/v1/chat/completions',            { Authorization: `Bearer ${apiKey}` }),
        ai21:        () => openaiCompat(conn.endpoint_url || 'https://api.ai21.com/studio/v1/chat/completions',        { Authorization: `Bearer ${apiKey}` }),
        github:      () => openaiCompat(conn.endpoint_url || 'https://models.inference.ai.azure.com/chat/completions', { Authorization: `Bearer ${apiKey}` }),
        cloudflare:  () => openaiCompat(conn.endpoint_url,                                                             { Authorization: `Bearer ${apiKey}` }),
        huggingface: () => openaiCompat((conn.endpoint_url || 'https://api-inference.huggingface.co/models/{model}/v1/chat/completions').replace('{model}', conn.model || ''), { Authorization: `Bearer ${apiKey}` }),
        ollama:      () => openaiCompat(conn.endpoint_url || 'http://localhost:11434/v1/chat/completions',             apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        litellm:     () => openaiCompat(conn.endpoint_url || 'http://localhost:4000/v1/chat/completions',              apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        vllm:        () => openaiCompat(conn.endpoint_url || 'http://localhost:8000/v1/chat/completions',              apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        localai:     () => openaiCompat(conn.endpoint_url || 'http://localhost:8080/v1/chat/completions',              apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        cerebras:    () => openaiCompat(conn.endpoint_url || 'https://api.cerebras.ai/v1/chat/completions',           { Authorization: `Bearer ${apiKey}` }),
        sambanova:   () => openaiCompat(conn.endpoint_url || 'https://api.sambanova.ai/v1/chat/completions',          { Authorization: `Bearer ${apiKey}` }),
        nvidia:      () => openaiCompat(conn.endpoint_url || 'https://integrate.api.nvidia.com/v1/chat/completions',  { Authorization: `Bearer ${apiKey}` }),
        llamaapi:    () => openaiCompat(conn.endpoint_url || 'https://api.llama.com/v1/chat/completions',             { Authorization: `Bearer ${apiKey}` }),
        watsonx:     () => openaiCompat(conn.endpoint_url || 'https://us-south.ml.cloud.ibm.com/ml/v1/text/chat?version=2024-05-01', { Authorization: `Bearer ${apiKey}` }),
        custom:      () => openaiCompat(conn.endpoint_url,                                                            apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        vertex:    async () => { throw Object.assign(new Error('Google Vertex AI with service-account auth is coming soon.'), { response: { status: 501 } }); },
        sagemaker: async () => { throw Object.assign(new Error('Amazon SageMaker endpoint support is coming soon.'), { response: { status: 501 } }); },
      };

      const caller = PROVIDER_CALLS[providerName];
      if (!caller) return res.status(400).json({ error: `Unsupported provider: ${providerName}` });
      raw = await caller();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) return res.status(401).json({ error: 'Invalid provider API key' });
      if (status === 403) return res.status(403).json({ error: 'Provider access denied — check API key permissions' });
      if (status === 429) return res.status(429).json({ error: 'Provider rate limit reached. Please try again shortly.' });
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.response?.data?.error || err.message;
      return res.status(502).json({ error: `Provider error: ${msg}` });
    }
  }

  // ── Step 5: Output guardrails ──────────────────────────────────────────────
  const outputFlags = await runGuardrails(db, req.orgId, raw, 'output', countryCode);
  if (complianceMode) {
    const complianceOutputFlags = runComplianceRules(complianceMode, raw, 'output');
    for (const cf of complianceOutputFlags) {
      if (!outputFlags.some(f => f.name === cf.name)) outputFlags.push(cf);
    }
  }

  const outBlocked = outputFlags.filter(g => g.action === 'block');
  const finalOutput = outBlocked.length > 0
    ? `[Output blocked: ${outBlocked.map(g => g.name).join(', ')}]`
    : raw;

  // ── Step 6: Persist + respond ──────────────────────────────────────────────
  const tokens = Math.round(raw.length / 4);
  await recordUsage(db, req.orgId, tokens);

  if (outBlocked.length > 0 || outputFlags.some(g => g.severity === 'critical')) {
    await fireWebhooks(db, req.orgId, outBlocked.length ? 'block' : 'critical', { output: finalOutput, guardrails: outputFlags.map(g => g.name), direction: 'output' });
  }

  const latency = Date.now() - t0;
  const { rows: [event] } = await db.query(
    `INSERT INTO audit_events (org_id,user_id,provider,model,route,input_text,output_text,input_flags,output_flags,passed,latency_ms,tokens_used)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [req.orgId, req.userId||null, providerName, conn.model, route,
     storePrompts ? prompt       : null,
     storePrompts ? finalOutput  : null,
     inputFlags.map(g=>g.name), outputFlags.map(g=>g.name), outBlocked.length===0, latency, tokens]
  );

  res.json({ output: finalOutput, blocked: outBlocked.length > 0, inputFlags: inputFlags.map(g=>g.name),
    outputFlags: outputFlags.map(g=>g.name), provider: providerName, model: conn.model,
    route, latency, tokens, auditId: event.id });
}

// GET /orgs/:orgId/audit (tenant DB)
async function getAuditLog(req, res) {
  try {
    const { page = 1, provider, passed, from, to } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (parseInt(page) - 1) * limit;

    const conditions = ['org_id=$1'];
    const params = [req.orgId];
    let idx = 2;
    if (provider) { conditions.push(`provider=$${idx++}`); params.push(provider); }
    if (passed !== undefined && passed !== '') { conditions.push(`passed=$${idx++}`); params.push(passed === 'true'); }
    if (from) { conditions.push(`created_at>=$${idx++}`); params.push(from); }
    if (to)   { conditions.push(`created_at<=$${idx++}`); params.push(to); }

    const where = conditions.join(' AND ');
    const [{ rows }, { rows: [{ count }] }] = await Promise.all([
      req.db.query(`SELECT * FROM audit_events WHERE ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params),
      req.db.query(`SELECT COUNT(*) FROM audit_events WHERE ${where}`, params),
    ]);
    res.json({ events: rows, total: parseInt(count), page: parseInt(page), limit });
  } catch (err) {
    logger.error('getAuditLog error', { error: err.message, orgId: req.orgId });
    res.status(500).json({ error: 'Failed to load audit log' });
  }
}

// GET /orgs/:orgId/analytics (tenant DB + platform DB for user/membership data)
async function getAnalytics(req, res) {
  try {
    const { days = 30 } = req.query;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const db = req.db;

    const [summary, byProvider, byHour, flagSummary, usagePeriod, auditByUser] = await Promise.all([
      db.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE passed) as passed,
                COUNT(*) FILTER(WHERE NOT passed) as failed,
                AVG(latency_ms) as avg_latency, SUM(tokens_used) as total_tokens
         FROM audit_events WHERE org_id=$1 AND created_at>=$2`,
        [req.orgId, from]
      ),
      db.query(
        `SELECT provider, COUNT(*) as count FROM audit_events WHERE org_id=$1 AND created_at>=$2
         GROUP BY provider ORDER BY count DESC`,
        [req.orgId, from]
      ),
      db.query(
        `SELECT DATE_TRUNC('hour', created_at) as hour, COUNT(*) as total,
                COUNT(*) FILTER(WHERE NOT passed) as flagged
         FROM audit_events WHERE org_id=$1 AND created_at>=$2
         GROUP BY hour ORDER BY hour`,
        [req.orgId, from]
      ),
      db.query(
        `SELECT unnest(input_flags||output_flags) as flag, COUNT(*) as count
         FROM audit_events WHERE org_id=$1 AND created_at>=$2
         GROUP BY flag ORDER BY count DESC LIMIT 10`,
        [req.orgId, from]
      ),
      db.query(
        `SELECT requests, blocked, tokens, cost_usd FROM usage_records WHERE org_id=$1 ORDER BY period DESC LIMIT 1`,
        [req.orgId]
      ),
      // Aggregate by user_id from tenant DB
      db.query(
        `SELECT COALESCE(user_id::text, 'api') AS user_id,
                COUNT(*) AS total, COUNT(*) FILTER(WHERE NOT passed) AS flagged,
                SUM(tokens_used) AS tokens,
                ROUND((SUM(tokens_used) * 0.00001)::numeric, 4) AS est_cost_usd
         FROM audit_events WHERE org_id=$1 AND created_at>=$2
         GROUP BY user_id ORDER BY total DESC LIMIT 25`,
        [req.orgId, from]
      ),
    ]);

    // Resolve user names/emails from platform DB
    const userIds = auditByUser.rows.filter(r => r.user_id !== 'api').map(r => r.user_id);
    let userMap = {};
    if (userIds.length > 0) {
      const { rows: users } = await platformQuery('SELECT id, full_name, email FROM users WHERE id = ANY($1)', [userIds]);
      userMap = Object.fromEntries(users.map(u => [u.id, u]));
    }

    // Resolve role info from platform DB for department breakdown
    const { rows: members } = await platformQuery(
      'SELECT user_id, role FROM memberships WHERE org_id=$1 AND active=true',
      [req.orgId]
    );
    const roleMap = Object.fromEntries(members.map(m => [m.user_id, m.role]));

    const byUser = auditByUser.rows.map(r => ({
      ...r,
      name:  r.user_id === 'api' ? 'API / System' : (userMap[r.user_id]?.full_name || userMap[r.user_id]?.email || 'Unknown'),
      email: r.user_id === 'api' ? '' : (userMap[r.user_id]?.email || ''),
    }));

    // Build department/role breakdown from the user-level data
    const deptMap = {};
    for (const u of auditByUser.rows) {
      const dept = u.user_id === 'api' ? 'api' : (roleMap[u.user_id] || 'user');
      if (!deptMap[dept]) deptMap[dept] = { department: dept, total: 0, flagged: 0, tokens: 0, est_cost_usd: 0 };
      deptMap[dept].total    += parseInt(u.total) || 0;
      deptMap[dept].flagged  += parseInt(u.flagged) || 0;
      deptMap[dept].tokens   += parseInt(u.tokens) || 0;
      deptMap[dept].est_cost_usd += parseFloat(u.est_cost_usd) || 0;
    }
    const byDepartment = Object.values(deptMap).sort((a, b) => b.total - a.total);

    res.json({
      summary:       summary.rows[0],
      byProvider:    byProvider.rows,
      byHour:        byHour.rows,
      flagSummary:   flagSummary.rows,
      currentPeriod: usagePeriod.rows[0] || { requests: 0, blocked: 0, tokens: 0, cost_usd: 0 },
      byUser,
      byDepartment,
    });
  } catch (err) {
    logger.error('getAnalytics error', { error: err.message, orgId: req.orgId });
    res.status(500).json({ error: 'Failed to load analytics' });
  }
}

module.exports = { proxyPrompt, getAuditLog, getAnalytics };
