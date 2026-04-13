/**
 * Sliding-window rate limiter — Redis-backed in production, in-memory fallback
 * for local dev or when REDIS_URL is not set.
 *
 * Set REDIS_URL in your environment to enable the Redis-backed limiter.
 * If REDIS_URL is absent the module falls back to an in-memory Map so the
 * app still works without Redis.
 */

const logger = require('../utils/logger');

// ── Plan → requests-per-minute caps ──────────────────────────────────────────
const PLAN_RPM = {
  starter:    30,
  pro:        120,
  enterprise: 600,
};

// ── Redis client (lazy-init) ──────────────────────────────────────────────────
let redisClient = null;
let useRedis    = false;

async function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info('REDIS_URL not set — using in-memory rate limiter');
    return null;
  }

  try {
    const Redis = require('ioredis');
    const client = new Redis(url, {
      tls:                  url.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: 0,    // fail fast — no retry loops
      enableReadyCheck:     false,
      lazyConnect:          true,
      retryStrategy:        () => null, // don't auto-reconnect; fall back to memory
    });

    // Attach error handler BEFORE connect() to prevent unhandled 'error' events
    // which would crash the Node process.
    client.on('error', (err) => {
      logger.warn('Redis error — falling back to in-memory rate limiter', { error: err.message });
      useRedis   = false;
      redisClient = null;
      try { client.disconnect(); } catch (_) {}
    });

    await client.connect();
    redisClient = client;
    useRedis    = true;
    logger.info('Redis rate limiter connected');
    return redisClient;
  } catch (err) {
    logger.warn('Redis connection failed — using in-memory rate limiter', { error: err.message });
    redisClient = null;
    useRedis    = false;
    return null;
  }
}

// ── In-memory fallback ────────────────────────────────────────────────────────
const MEM_WINDOWS = new Map(); // orgId → [timestamp, ...]

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, arr] of MEM_WINDOWS.entries()) {
    const trimmed = arr.filter(t => t > cutoff);
    if (trimmed.length === 0) MEM_WINDOWS.delete(key);
    else MEM_WINDOWS.set(key, trimmed);
  }
}, 30_000).unref();

function memCheck(orgId, limit) {
  const now    = Date.now();
  const cutoff = now - 60_000;
  const hits   = (MEM_WINDOWS.get(orgId) || []).filter(t => t > cutoff);
  if (hits.length >= limit) return false;
  hits.push(now);
  MEM_WINDOWS.set(orgId, hits);
  return true;
}

// ── Redis sliding-window check (Lua for atomicity) ────────────────────────────
const SLIDING_WINDOW_SCRIPT = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= limit then return 0 end
redis.call('ZADD', key, now, now .. '-' .. math.random(1, 1000000))
redis.call('PEXPIRE', key, window)
return 1
`;

async function redisCheck(client, orgId, limit) {
  try {
    const result = await client.eval(
      SLIDING_WINDOW_SCRIPT, 1,
      `rl:${orgId}`,
      Date.now().toString(),
      '60000',
      limit.toString()
    );
    return result === 1;
  } catch (err) {
    logger.error('Redis rate-limit check failed — allowing request', { error: err.message });
    return true; // fail open
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
async function perOrgRateLimit(req, res, next) {
  try {
    const orgId  = req.orgId;
    const plan   = req.org?.plan_name || 'starter';
    const limit  = PLAN_RPM[plan] ?? PLAN_RPM.starter;
    const client = await getRedis();

    const allowed = client
      ? await redisCheck(client, orgId, limit)
      : memCheck(orgId, limit);

    if (!allowed) {
      return res.status(429).json({
        error: `Rate limit exceeded. ${limit} requests/minute allowed on the ${plan} plan.`,
        retryAfter: 60,
      });
    }

    next();
  } catch (err) {
    logger.error('Rate limiter error', { error: err.message });
    next(); // fail open
  }
}

module.exports = { perOrgRateLimit };
