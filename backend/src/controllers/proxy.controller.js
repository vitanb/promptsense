const axios = require('axios');
const { query } = require('../db/pool');
const { decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

// ── Country detection ─────────────────────────────────────────────────────────
// Uses geoip-lite for local IP → country lookup (no external API call, works
// on any host including Render + Google Cloud DNS).
// Express trust proxy is already set to 1, so req.ip reflects the real client
// IP from the X-Forwarded-For header passed by Render's load balancer.
let geoip = null;
try { geoip = require('geoip-lite'); } catch (_) {}

function detectCountry(req) {
  if (!geoip) return null; // library not installed — apply all guardrails

  // Take the leftmost (original client) IP from X-Forwarded-For.
  // With trust proxy = 1, req.ip is already the client IP, but
  // reading the header directly is more explicit and equally reliable.
  const raw = req.headers['x-forwarded-for'] || req.ip || '';
  const ip  = raw.split(',')[0].trim();

  const geo = geoip.lookup(ip);
  return geo?.country ? geo.country.toUpperCase() : null;
}

// ── Guardrail evaluation ──────────────────────────────────────────────────────
async function runGuardrails(orgId, text, direction, countryCode) {
  const { rows } = await query(
    "SELECT * FROM guardrails WHERE org_id=$1 AND enabled=true AND (type=$2 OR type='both') ORDER BY sort_order",
    [orgId, direction]
  );
  const flags = [];
  for (const g of rows) {
    // Skip if the guardrail is restricted to specific countries and caller's
    // country is known but not in the list. Unknown country → apply all.
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
  const countryCode = detectCountry(req);

  // Check quota
  const withinQuota = await checkQuota(req.orgId, req.org.requests_per_month);
  if (!withinQuota) return res.status(429).json({ error: 'Monthly request quota exceeded. Upgrade your plan.' });

  // ── Step 1: Input guardrails ────────────────────────────────────────────────
  const inputFlags = await runGuardrails(req.orgId, prompt, 'input', countryCode);
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
      // ── Shared helpers ────────────────────────────────────────────────────

      // OpenAI-compatible: works for OpenAI, Azure, Groq, Mistral, Together,
      // Fireworks, Perplexity, DeepSeek, xAI, AI21, Cohere (v2), GitHub Models,
      // Cloudflare AI, Ollama, LiteLLM, HuggingFace TGI, OpenRouter, AI/ML API, etc.
      const openaiCompat = async (endpointUrl, authHeader) => {
        // Substitute {model} in URL (used by HuggingFace, Gemini, etc.)
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

      // AWS Signature V4 signer (pure Node.js crypto — no SDK needed)
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

      // ── Provider dispatch table ───────────────────────────────────────────
      const PROVIDER_CALLS = {

        // Native Anthropic Messages API
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

        // Google Gemini (native generateContent API)
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

        // Cohere Chat API (native v1 format)
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

        // Replicate (predictions API)
        replicate: async () => {
          const model = conn.model || '';
          const url   = (conn.endpoint_url || `https://api.replicate.com/v1/models/${model}/predictions`).replace('{model}', model);
          // Create prediction
          const create = await axios.post(url,
            { input: { prompt, max_new_tokens: conn.max_tokens || 1000, system_prompt: conn.system_prompt || '' } },
            { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Prefer': 'wait' } }
          );
          // Replicate may return output directly when using Prefer: wait
          const output = create.data?.output;
          if (Array.isArray(output)) return output.join('');
          if (typeof output === 'string') return output;
          // Otherwise poll
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

        // AWS Bedrock (Converse API with AWS Sig V4)
        bedrock: async () => {
          // Credentials stored as ACCESS_KEY|SECRET_KEY|REGION
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

        // ── OpenAI-compatible providers (single line each) ─────────────────
        openai:      () => openaiCompat(conn.endpoint_url || 'https://api.openai.com/v1/chat/completions',           { Authorization: `Bearer ${apiKey}` }),
        azure:       () => openaiCompat(conn.endpoint_url,                                                            { Authorization: `Bearer ${apiKey}`, 'api-key': apiKey }),
        mistral:     () => openaiCompat(conn.endpoint_url || 'https://api.mistral.ai/v1/chat/completions',            { Authorization: `Bearer ${apiKey}` }),
        groq:        () => openaiCompat(conn.endpoint_url || 'https://api.groq.com/openai/v1/chat/completions',       { Authorization: `Bearer ${apiKey}` }),
        deepseek:    () => openaiCompat(conn.endpoint_url || 'https://api.deepseek.com/v1/chat/completions',          { Authorization: `Bearer ${apiKey}` }),
        xai:         () => openaiCompat(conn.endpoint_url || 'https://api.x.ai/v1/chat/completions',                 { Authorization: `Bearer ${apiKey}` }),
        perplexity:  () => openaiCompat(conn.endpoint_url || 'https://api.perplexity.ai/chat/completions',           { Authorization: `Bearer ${apiKey}` }),
        together:    () => openaiCompat(conn.endpoint_url || 'https://api.together.xyz/v1/chat/completions',          { Authorization: `Bearer ${apiKey}` }),
        fireworks:   () => openaiCompat(conn.endpoint_url || 'https://api.fireworks.ai/inference/v1/chat/completions',{ Authorization: `Bearer ${apiKey}` }),
        openrouter:  () => openaiCompat(conn.endpoint_url || 'https://openrouter.ai/api/v1/chat/completions',         { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://promptsense.ai', 'X-Title': 'PromptSense' }),
        aimlapi:     () => openaiCompat(conn.endpoint_url || 'https://api.aimlapi.com/v1/chat/completions',           { Authorization: `Bearer ${apiKey}` }),
        ai21:        () => openaiCompat(conn.endpoint_url || 'https://api.ai21.com/studio/v1/chat/completions',       { Authorization: `Bearer ${apiKey}` }),
        github:      () => openaiCompat(conn.endpoint_url || 'https://models.inference.ai.azure.com/chat/completions',{ Authorization: `Bearer ${apiKey}` }),
        cloudflare:  () => openaiCompat(conn.endpoint_url,                                                            { Authorization: `Bearer ${apiKey}` }),
        huggingface: () => openaiCompat((conn.endpoint_url || 'https://api-inference.huggingface.co/models/{model}/v1/chat/completions').replace('{model}', conn.model || ''), { Authorization: `Bearer ${apiKey}` }),
        ollama:      () => openaiCompat(conn.endpoint_url || 'http://localhost:11434/v1/chat/completions',            {}),
        litellm:     () => openaiCompat(conn.endpoint_url || 'http://localhost:4000/v1/chat/completions',             apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        custom:      () => openaiCompat(conn.endpoint_url,                                                            apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      };

      const caller = PROVIDER_CALLS[providerName];
      if (!caller) return res.status(400).json({ error: `Unsupported provider: ${providerName}` });
      raw = await caller();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) return res.status(401).json({ error: 'Invalid provider API key' });
      if (status === 403) return res.status(403).json({ error: 'Provider access denied — check API key permissions' });
      if (status === 429) return res.status(429).json({ error: 'Provider rate limit reached. Please try again shortly.' });
      const msg = err.response?.data?.error?.message
               || err.response?.data?.message
               || err.response?.data?.error
               || err.message;
      return res.status(502).json({ error: `Provider error: ${msg}` });
    }
  }

  // ── Step 5: Output guardrails ──────────────────────────────────────────────
  const outputFlags = await runGuardrails(req.orgId, raw, 'output', countryCode);
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
      query(
        `SELECT * FROM audit_events WHERE ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      query(`SELECT COUNT(*) FROM audit_events WHERE ${where}`, params),
    ]);
    res.json({ events: rows, total: parseInt(count), page: parseInt(page), limit });
  } catch (err) {
    logger.error('getAuditLog error', { error: err.message, orgId: req.orgId });
    res.status(500).json({ error: 'Failed to load audit log' });
  }
}

// GET /orgs/:orgId/analytics
async function getAnalytics(req, res) {
  try {
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
         COUNT(*) AS total,
         COUNT(*) FILTER(WHERE NOT ae.passed) AS flagged,
         SUM(ae.tokens_used) AS tokens,
         ROUND((SUM(ae.tokens_used) * 0.00001)::numeric, 4) AS est_cost_usd
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.user_id
       WHERE ae.org_id = $1 AND ae.created_at >= $2
       GROUP BY u.id, u.full_name, u.email
       ORDER BY total DESC
       LIMIT 25`,
      [req.orgId, from]
    ),

    // Per-role breakdown (replaces department — memberships has no department column)
    query(
      `SELECT
         COALESCE(m.role, 'api') AS department,
         COUNT(*) AS total,
         COUNT(*) FILTER(WHERE NOT ae.passed) AS flagged,
         SUM(ae.tokens_used) AS tokens,
         ROUND((SUM(ae.tokens_used) * 0.00001)::numeric, 4) AS est_cost_usd
       FROM audit_events ae
       LEFT JOIN memberships m ON m.user_id = ae.user_id AND m.org_id = ae.org_id
       WHERE ae.org_id = $1 AND ae.created_at >= $2
       GROUP BY COALESCE(m.role, 'api')
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
  } catch (err) {
    logger.error('getAnalytics error', { error: err.message, orgId: req.orgId });
    res.status(500).json({ error: 'Failed to load analytics' });
  }
}

module.exports = { proxyPrompt, getAuditLog, getAnalytics };
