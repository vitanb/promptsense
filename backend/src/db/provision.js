/**
 * Tenant database provisioner.
 *
 * When a new org is created, provisionTenantDb() is called to:
 *   1. Create a dedicated PostgreSQL database for the org.
 *   2. Apply the tenant schema migration to that database.
 *   3. Seed default guardrails + default policy.
 *   4. Store the tenant DB connection string in the platform organizations table.
 *
 * The tenant database name is derived from the org UUID so it's globally unique
 * and never conflicts with other org databases.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { query: platformQuery } = require('./pool');
const logger = require('../utils/logger');

const TENANT_MIGRATION_PATH = path.join(__dirname, '../../../migrations/tenant/001_tenant_schema.sql');

const SYSTEM_GUARDRAILS = [
  { name: 'PII detection',       description: 'Block emails, SSNs, phone numbers, credit cards',     type: 'input',  severity: 'critical', action: 'block', pattern: String.raw`\d{3}-\d{2}-\d{4}|[\w.]+@[\w]+\.\w+|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b`, color: '#D85A30', enabled: true  },
  { name: 'Prompt injection',    description: 'Detect jailbreak and instruction override attempts',   type: 'input',  severity: 'critical', action: 'block', pattern: 'ignore.*instructions|system prompt|jailbreak|bypass|pretend you|disregard',                      color: '#7F77DD', enabled: true  },
  { name: 'Toxicity filter',     description: 'Flag hate speech and harmful content',                type: 'both',   severity: 'high',     action: 'block', pattern: String.raw`\b(hate|violence|kill|toxic|harmful|abuse)\b`,                                          color: '#E24B4A', enabled: true  },
  { name: 'Secrets detection',   description: 'Block API keys, passwords, tokens in output',        type: 'output', severity: 'critical', action: 'block', pattern: String.raw`(sk-|api[_-]?key|password|bearer)[a-zA-Z0-9_\-]{8,}`,                                  color: '#4285F4', enabled: true  },
  { name: 'Hallucination check', description: 'Flag low-confidence factual claims',                 type: 'output', severity: 'medium',   action: 'warn',  pattern: '',                                                                                                 color: '#1D9E75', enabled: true  },
  { name: 'Output length cap',   description: 'Enforce max token limits on responses',              type: 'output', severity: 'low',      action: 'warn',  pattern: '',                                                                                                 color: '#378ADD', enabled: true  },
  { name: 'Copyright guard',     description: 'Detect verbatim copyrighted content',               type: 'output', severity: 'high',     action: 'block', pattern: '',                                                                                                 color: '#D4537E', enabled: false },
  { name: 'Sentiment check',     description: 'Flag overly negative or positive bias',             type: 'output', severity: 'low',      action: 'log',   pattern: '',                                                                                                 color: '#639922', enabled: false },
];

/**
 * Build the tenant DB name from org UUID.
 * e.g. "ps_t_550e8400e29b41d4a716446655440000"
 */
function tenantDbName(orgId) {
  return `ps_t_${orgId.replace(/-/g, '')}`;
}

/**
 * Build the tenant DB connection URL by swapping the database name in the
 * platform DATABASE_URL.
 */
function tenantDbUrl(dbName) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

/**
 * Provision a new isolated database for an org.
 *
 * @param {string} orgId  - UUID of the org
 * @param {string} userId - UUID of the founding admin user (for seeding created_by)
 * @returns {string} tenantDbUrl - connection string for the new tenant DB
 */
async function provisionTenantDb(orgId, userId) {
  const dbName = tenantDbName(orgId);
  const connStr = tenantDbUrl(dbName);

  logger.info('Provisioning tenant database', { orgId, dbName });

  // ── Step 1: Create the database ─────────────────────────────────────────────
  // Connect to the default/platform database with the same credentials
  // and issue CREATE DATABASE (cannot be run inside a transaction).
  const adminClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  await adminClient.connect();
  try {
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
    logger.info('Tenant database created', { orgId, dbName });
  } finally {
    await adminClient.end();
  }

  // ── Step 2: Apply tenant schema ──────────────────────────────────────────────
  const tenantClient = new Client({
    connectionString: connStr,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  await tenantClient.connect();

  try {
    const schemaSql = fs.readFileSync(TENANT_MIGRATION_PATH, 'utf8');
    await tenantClient.query(schemaSql);
    logger.info('Tenant schema applied', { orgId, dbName });

    // ── Step 3: Seed default guardrails ──────────────────────────────────────
    for (let i = 0; i < SYSTEM_GUARDRAILS.length; i++) {
      const g = SYSTEM_GUARDRAILS[i];
      await tenantClient.query(
        `INSERT INTO guardrails
           (org_id, name, description, type, severity, action, pattern, color, enabled, is_system, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)`,
        [orgId, g.name, g.description, g.type, g.severity, g.action, g.pattern, g.color, g.enabled, i]
      );
    }

    // ── Step 4: Seed default policy (first 6 guardrails) ────────────────────
    const { rows: gRows } = await tenantClient.query(
      `SELECT id FROM guardrails WHERE org_id=$1
       AND name IN ('PII detection','Prompt injection','Toxicity filter','Secrets detection','Hallucination check','Output length cap')`,
      [orgId]
    );
    const gids = gRows.map(r => r.id);
    await tenantClient.query(
      `INSERT INTO policies (org_id, name, description, guardrail_ids, is_active, created_by)
       VALUES ($1,'Default policy','Standard guardrails for all traffic',$2,true,$3)`,
      [orgId, gids, userId]
    );

    logger.info('Tenant seed data inserted', { orgId, guardrails: SYSTEM_GUARDRAILS.length });
  } finally {
    await tenantClient.end();
  }

  // ── Step 5: Store connection string in platform DB ───────────────────────────
  await platformQuery(
    'UPDATE organizations SET tenant_db_url = $1 WHERE id = $2',
    [connStr, orgId]
  );

  logger.info('Tenant provisioning complete', { orgId, dbName });
  return connStr;
}

/**
 * Run a tenant migration SQL file against every provisioned tenant DB.
 * Call this when rolling out new tenant schema changes.
 *
 * @param {string} sqlPath - Absolute path to the migration file
 */
async function migrateAllTenants(sqlPath) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const { rows: orgs } = await platformQuery(
    'SELECT id, name, tenant_db_url FROM organizations WHERE tenant_db_url IS NOT NULL AND deleted_at IS NULL'
  );

  logger.info(`Running tenant migration on ${orgs.length} org(s)`, { file: sqlPath });

  for (const org of orgs) {
    const client = new Client({
      connectionString: org.tenant_db_url,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    try {
      await client.connect();
      await client.query(sql);
      logger.info('Tenant migration applied', { orgId: org.id, name: org.name });
    } catch (err) {
      logger.error('Tenant migration failed', { orgId: org.id, name: org.name, error: err.message });
    } finally {
      await client.end();
    }
  }
}

module.exports = { provisionTenantDb, migrateAllTenants, tenantDbName, tenantDbUrl };
