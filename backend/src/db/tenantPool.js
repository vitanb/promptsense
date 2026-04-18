/**
 * Tenant connection pool manager.
 *
 * Each org gets its own isolated PostgreSQL database. This module maintains
 * a map of orgId → Pool so connections are reused across requests without
 * opening a new pool on every request.
 *
 * Usage:
 *   const { getTenantDb } = require('./tenantPool');
 *   const db = getTenantDb(orgId, tenantDbUrl);
 *   const { rows } = await db.query('SELECT * FROM audit_events ORDER BY created_at DESC');
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// orgId (string) → Pool
const pools = new Map();

/**
 * Get or create a connection pool for a tenant database.
 * @param {string} orgId - Used as the pool cache key and for log context.
 * @param {string} dbUrl - Full postgres connection string for this tenant's DB.
 * @returns {Pool}
 */
function getTenantPool(orgId, dbUrl) {
  if (pools.has(orgId)) return pools.get(orgId);

  const pool = new Pool({
    connectionString: dbUrl,
    max: 5,                       // smaller per-tenant pool — most orgs are low-traffic
    idleTimeoutMillis: 60_000,    // close idle connections after 1 minute
    connectionTimeoutMillis: 3_000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    logger.error('Tenant pool error', { orgId, error: err.message });
  });

  pools.set(orgId, pool);
  logger.debug('Tenant pool created', { orgId });
  return pool;
}

/**
 * Returns a db interface (query + getClient) scoped to a tenant's database.
 * This is what gets attached to req.db in the loadOrg middleware.
 *
 * @param {string} orgId
 * @param {string} dbUrl
 * @returns {{ query: Function, getClient: Function }}
 */
function getTenantDb(orgId, dbUrl) {
  const pool = getTenantPool(orgId, dbUrl);

  return {
    query: async (text, params) => {
      const start = Date.now();
      try {
        const res = await pool.query(text, params);
        logger.debug('Tenant DB query', {
          orgId,
          query: text.substring(0, 80),
          duration: Date.now() - start,
          rows: res.rowCount,
        });
        return res;
      } catch (err) {
        logger.error('Tenant DB query error', {
          orgId,
          query: text.substring(0, 80),
          error: err.message,
        });
        throw err;
      }
    },
    getClient: () => pool.connect(),
  };
}

/**
 * Gracefully end all tenant pools — called on process shutdown.
 */
async function closeAllTenantPools() {
  const promises = [];
  for (const [orgId, pool] of pools.entries()) {
    promises.push(pool.end().catch(err => logger.warn('Error closing tenant pool', { orgId, error: err.message })));
  }
  await Promise.all(promises);
  pools.clear();
}

module.exports = { getTenantDb, getTenantPool, closeAllTenantPools };
