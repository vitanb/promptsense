/**
 * Request validation & security middleware
 *
 * Covers the checks enterprise security teams ask about:
 *  - Input length / character limits (prevents prompt-stuffing DoS)
 *  - Allowed provider enumeration (rejects unknown values early)
 *  - SSRF protection on user-supplied URLs (webhooks, downstream endpoints)
 *  - Null-byte / control-char stripping
 */

const { URL } = require('url');
const logger  = require('../utils/logger');

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_PROMPT_CHARS   = 32_000;   // ~8 K tokens worst case
const MAX_SYSTEM_CHARS   = 8_000;
const MAX_TEMPLATE_CHARS = 16_000;

const ALLOWED_PROVIDERS = new Set([
  'anthropic', 'openai', 'azure', 'gemini', 'mistral', 'cohere',
]);

// RFC-1918 + loopback + link-local + cloud metadata ranges
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // loopback
  /^10\./,                           // RFC-1918
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC-1918
  /^192\.168\./,                     // RFC-1918
  /^169\.254\./,                     // link-local (APIPA / metadata)
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 ULA
  /^fe80:/i,                         // IPv6 link-local
  /^0\./,                            // "this" network
  /^localhost$/i,
  /\.internal$/i,
  /\.local$/i,
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip null bytes and ASCII control chars (except tab/newline/CR) */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * SSRF guard: reject URLs pointing at private / metadata IPs or schemes
 * other than http / https.
 * Returns an error string, or null if the URL is safe.
 */
function checkSsrf(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return 'Invalid URL format';
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return `Disallowed URL scheme: ${parsed.protocol}`;
  }

  const host = parsed.hostname;

  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(host)) {
      return `URL resolves to a private/reserved address (${host}) — not allowed`;
    }
  }

  // Block AWS/GCP/Azure metadata endpoints explicitly
  if (['169.254.169.254', 'metadata.google.internal', 'metadata.azure.com'].includes(host)) {
    return 'URL targets a cloud metadata endpoint — not allowed';
  }

  return null; // safe
}

// ── Middleware ───────────────────────────────────────────────────────────────

/**
 * Validate and sanitize a proxy request body.
 * Attaches `req.safeBody` with cleaned values.
 */
function validateProxy(req, res, next) {
  const { prompt, provider, stream, system } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required and must be a string' });
  }

  const cleanPrompt = sanitizeString(prompt).trim();
  if (!cleanPrompt) {
    return res.status(400).json({ error: 'prompt must not be empty after sanitization' });
  }
  if (cleanPrompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({
      error: `prompt exceeds maximum length of ${MAX_PROMPT_CHARS.toLocaleString()} characters`,
      limit: MAX_PROMPT_CHARS,
      received: cleanPrompt.length,
    });
  }

  if (provider !== undefined) {
    if (typeof provider !== 'string' || !ALLOWED_PROVIDERS.has(provider.toLowerCase())) {
      return res.status(400).json({
        error: `Invalid provider. Allowed values: ${[...ALLOWED_PROVIDERS].join(', ')}`,
      });
    }
  }

  if (system !== undefined) {
    if (typeof system !== 'string') {
      return res.status(400).json({ error: 'system must be a string' });
    }
    if (system.length > MAX_SYSTEM_CHARS) {
      return res.status(400).json({ error: `system prompt exceeds ${MAX_SYSTEM_CHARS.toLocaleString()} character limit` });
    }
  }

  if (stream !== undefined && typeof stream !== 'boolean') {
    return res.status(400).json({ error: 'stream must be a boolean' });
  }

  // Attach sanitised values
  req.safeBody = {
    prompt: cleanPrompt,
    provider: provider ? provider.toLowerCase() : undefined,
    stream: stream || false,
    system: system ? sanitizeString(system) : undefined,
  };

  next();
}

/**
 * Validate webhook URL for SSRF safety.
 * Call before inserting / updating a webhook record.
 */
function validateWebhookUrl(req, res, next) {
  const { url } = req.body || {};
  if (!url) return next(); // missing-url error handled by controller

  const err = checkSsrf(url);
  if (err) {
    logger.warn('SSRF attempt blocked on webhook URL', { url, orgId: req.orgId, userId: req.userId });
    return res.status(400).json({ error: `Webhook URL rejected: ${err}` });
  }
  next();
}

/**
 * Validate downstream endpoint URL for SSRF safety.
 */
function validateDownstreamUrl(req, res, next) {
  const { endpoint_url } = req.body || {};
  if (!endpoint_url) return next();

  const err = checkSsrf(endpoint_url);
  if (err) {
    logger.warn('SSRF attempt blocked on downstream URL', { endpoint_url, orgId: req.orgId });
    return res.status(400).json({ error: `Downstream URL rejected: ${err}` });
  }
  next();
}

/**
 * Per-org sliding-window rate limiter for the proxy endpoint.
 * Limits are based on the org's plan. Stored in-process (replace with
 * Redis for multi-replica deployments).
 *
 * Plan limits (requests per minute):
 *   starter:    30 rpm
 *   pro:       120 rpm
 *   enterprise: 600 rpm  (or unlimited — the monthly quota still applies)
 */
const orgWindows = new Map(); // orgId → { count, windowStart }

const PLAN_RPM = {
  starter:    30,
  pro:        120,
  enterprise: 600,
};
const WINDOW_MS = 60_000;

function perOrgRateLimit(req, res, next) {
  const orgId   = req.orgId;
  const planName = (req.org?.plan_name || 'starter').toLowerCase();
  const limit    = PLAN_RPM[planName] ?? PLAN_RPM.starter;

  const now = Date.now();
  let win   = orgWindows.get(orgId);

  if (!win || now - win.windowStart > WINDOW_MS) {
    win = { count: 0, windowStart: now };
    orgWindows.set(orgId, win);
  }

  win.count++;

  if (win.count > limit) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - win.windowStart)) / 1000);
    res.setHeader('Retry-After', retryAfter);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', Math.ceil((win.windowStart + WINDOW_MS) / 1000));
    return res.status(429).json({
      error: `Rate limit exceeded. Your ${planName} plan allows ${limit} requests/minute.`,
      retryAfter,
    });
  }

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - win.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil((win.windowStart + WINDOW_MS) / 1000));
  next();
}

// Prune stale windows every 5 minutes to avoid unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS * 2;
  for (const [id, win] of orgWindows) {
    if (win.windowStart < cutoff) orgWindows.delete(id);
  }
}, 5 * 60_000);

module.exports = {
  validateProxy,
  validateWebhookUrl,
  validateDownstreamUrl,
  perOrgRateLimit,
  checkSsrf,
  sanitizeString,
};
