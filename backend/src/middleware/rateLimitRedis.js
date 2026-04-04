/**
 * Redis-backed sliding-window rate limiter for multi-replica production.
 *
 * Replaces the in-memory Map-based limiter in validate.js, which only works
 * correctly on a single Node.js process. In ECS Fargate with multiple replicas,
 * each task has its own memory — use this file instead.
 *
 * Usage: set REDIS_URL in the environment. If REDIS_URL is absent, the module
 * falls back to the in-memory limiter so local dev still works without Redis.
 */

const { query } = require('../db/pool');
const logger    = require('../utils/logger');

// ── Plan → requests-per-minute limits (mirrors validate.js) ──────────────────
const PLAN_RPM = {
  starter:    30,
  pro:        120,
  enterprise: 600,
};

// ── Lazy-init Redis client ────────────────────────────────────────────────────
let redisClient = null;
let useRedis    = false;

async function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('REDIS_URL not set — using in-memory rate limiter (not suitable for multi-replica)');
    return null;
  }

  try {
    // ioredis is already a common dep — add it: npm install ioredis
    const Redis = require('ioredis');
    redisClient = new Redis(url, {
      tls:             url.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: 3,
      enableReadyCheck:     true,
      lazyConnect:          true,
    });
    await redisClient.connect();
    useRedis = true;
    logger.info('Redis rate limiter connected');
    return redisClient;
  } catch (err) {
    logger.error('Redis connection failed — falling back to in-memory limiter', { error: err.message });
    redisClient = null;
    return null;
  }
}

// ── In-memory fallback (single-process only) ──────────────────────────────────
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

// ── Redis sliding-window check (Lua script for atomicity) ────────────────────
const SLIDING_WINDOW_SCRIPT = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])   -- milliseconds
local limit  = tonumber(ARGV[3])

-- Remove entries older than the window
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

local count = redis.call('ZCARD', key)
if count >= limit then
  return 0
end

-- Add this request; use unique member to avoid score collisions
redis.call('ZADD', key, now, now .. '-' .. math.random(1, 1000000))
redis.call('PEXPIRE', key, window)

return 1
`;

async function redisCheck(client, orgId, limit) {
  try {
    const result = await client.eval(
      SLIDING_WINDOW_SCRIPT,
      1,                         // number of KEYS
      `rl:${orgId}`,             // KEYS[1]
      Date.now().toString(),     // ARGV[1] = now (ms)
      '60000',                   // ARGV[2] = 60-second window
      limit.toString()           // ARGV[3] = limit
    );
    return result === 1;
  } catch (err) {
    logger.error('Redis rate-limit check failed — allowing request', { error: err.message });
    return true; // fail open rather than blocking all traffic on Redis hiccup
  }
}

// ── Exported middleware factory ───────────────────────────────────────────────
async function perOrgRateLimit(req, res, next) {
  try {
    const orgId = req.orgId;
    const plan  = req.org?.plan_name || 'starter';
    const limit = PLAN_RPM[plan] ?? PLAN_RPM.starter;

    const client  = await getRedis();
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
