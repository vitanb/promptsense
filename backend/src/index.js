require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

const authRoutes     = require('./routes/auth.routes');
const ssoRoutes      = require('./routes/sso.routes');
const orgRoutes      = require('./routes/org.routes');
const configRoutes   = require('./routes/config.routes');
const proxyRoutes    = require('./routes/proxy.routes');
const billingRoutes  = require('./routes/billing.routes');
const gauntletRoutes = require('./routes/gauntlet.routes');
const adminRoutes    = require('./routes/admin.routes');
const { stripeWebhook } = require('./controllers/billing.controller');

const app = express();

// Trust the first proxy (Render, AWS ALB, Cloudflare, etc.)
// Required for express-rate-limit to correctly read client IPs from X-Forwarded-For
app.set('trust proxy', 1);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Stripe webhooks need raw body BEFORE json parser
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Global API limiter
const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

// Strict limiter for all sensitive auth flows — brute-force & enumeration protection
const authLimiter = rateLimit({
  windowMs: 15 * 60_000, max: 15,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts — please wait 15 minutes before trying again.' },
});

// Moderate limiter for SSO lookups and starts — prevents email enumeration
const ssoLimiter = rateLimit({
  windowMs: 60_000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});

// Limiter for destructive operations — prevents bulk-delete attacks
const destructiveLimiter = rateLimit({
  windowMs: 60_000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many delete operations — please slow down.' },
});

app.use('/api', limiter);

// Tighten all auth-related endpoints (not just login/register)
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/register',        authLimiter);
app.use('/api/auth/refresh',         authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password',  authLimiter);
app.use('/api/auth/sso/check',       ssoLimiter);
app.use('/api/auth/sso/start',       ssoLimiter);

// Export destructiveLimiter for use in route files
app.locals.destructiveLimiter = destructiveLimiter;

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',                      authRoutes);
app.use('/api/auth/sso',                  ssoRoutes);
app.use('/api/orgs/:orgId',               orgRoutes);
app.use('/api/orgs/:orgId',               configRoutes);
app.use('/api/orgs/:orgId',               proxyRoutes);
app.use('/api/orgs/:orgId/billing',       billingRoutes);
app.use('/api/orgs/:orgId/gauntlet',     gauntletRoutes);
app.use('/api/admin',                    adminRoutes);

// Plans (public)
app.get('/api/plans', async (req, res) => {
  const { query } = require('./db/pool');
  const { rows } = await query('SELECT * FROM plans ORDER BY price_monthly');
  res.json(rows);
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await require('./db/pool').query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: process.env.npm_package_version || '1.0.0' });
  } catch (e) {
    res.status(503).json({ status: 'error', error: 'Database unreachable' });
  }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });
  if (err.type === 'StripeSignatureVerificationError') return res.status(400).json({ error: 'Invalid Stripe signature' });
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

// 404
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

// ── Scheduled jobs ────────────────────────────────────────────────────────────
const cron = require('node-cron');
const { query: dbQuery } = require('./db/pool');
const { getTenantDb } = require('./db/tenantPool');
const { sendActivationNudgeEmail } = require('./utils/email');
const { sendDailyDigest } = require('./utils/slack');

// Activation nudge — runs daily at 10:00 AM UTC.
// Emails users whose org was created 48–72 hours ago and hasn't fully activated.
// Tenant-specific data (providers, audit_events) is queried from each org's tenant DB.
cron.schedule('0 10 * * *', async () => {
  logger.info('⏰ Running activation nudge cron');
  try {
    // Find orgs created 48–72 hours ago (platform DB)
    const { rows: orgs } = await dbQuery(`
      SELECT o.id, o.name, o.tenant_db_url,
             u.email, u.full_name
      FROM organizations o
      JOIN memberships m ON m.org_id=o.id AND m.role='administrator'
      JOIN users u ON u.id=m.user_id
      WHERE o.created_at BETWEEN NOW() - INTERVAL '72 hours' AND NOW() - INTERVAL '48 hours'
        AND o.deleted_at IS NULL
    `);

    for (const org of orgs) {
      try {
        // Query activation milestones from tenant DB
        const db = getTenantDb(org.id, org.tenant_db_url);
        const [providers, requests, flags] = await Promise.all([
          db.query('SELECT 1 FROM provider_connections WHERE org_id=$1 AND enabled=true LIMIT 1', [org.id]),
          db.query('SELECT 1 FROM audit_events WHERE org_id=$1 LIMIT 1', [org.id]),
          db.query('SELECT 1 FROM audit_events WHERE org_id=$1 AND passed=false LIMIT 1', [org.id]),
        ]);

        const completed = {
          providerConnected: providers.rows.length > 0,
          firstRequestSent:  requests.rows.length > 0,
          guardrailFired:    flags.rows.length > 0,
        };
        const allDone = Object.values(completed).every(Boolean);
        if (!allDone) {
          await sendActivationNudgeEmail({ email: org.email, full_name: org.full_name }, org.name, completed);
          logger.info('📧 Activation nudge sent', { org: org.name, email: org.email });
        }
      } catch (err) {
        logger.error('Activation nudge failed for org', { org: org.name, error: err.message });
      }
    }
  } catch (err) {
    logger.error('Activation nudge cron failed', { error: err.message });
  }
});

// Slack daily digest — runs every day at 9:00 AM UTC.
// Sends yesterday's stats to any org that has slack_digest_url configured.
// Stats are queried from each org's isolated tenant DB.
cron.schedule('0 9 * * *', async () => {
  logger.info('⏰ Running Slack daily digest cron');
  try {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const dayStart  = new Date(yesterday); dayStart.setHours(0,0,0,0);
    const dayEnd    = new Date(yesterday); dayEnd.setHours(23,59,59,999);

    // Find all orgs with Slack digest enabled (platform DB)
    const { rows: orgs } = await dbQuery(`
      SELECT id, name, tenant_db_url,
             settings->>'slack_digest_url' AS digest_url
      FROM organizations
      WHERE settings->>'slack_digest_url' IS NOT NULL
        AND settings->>'slack_digest_url' != ''
        AND (settings->>'slack_digest_enabled')::boolean IS NOT FALSE
        AND deleted_at IS NULL
    `);

    const APP_URL = process.env.FRONTEND_URL || 'https://app.prompt-sense.net';

    for (const org of orgs) {
      try {
        // Query stats from tenant DB
        const db = getTenantDb(org.id, org.tenant_db_url);
        const [{ rows: [stats] }, { rows: topFlags }] = await Promise.all([
          db.query(`SELECT COUNT(*) AS total,
                           SUM(CASE WHEN passed THEN 1 ELSE 0 END) AS passed,
                           SUM(CASE WHEN NOT passed THEN 1 ELSE 0 END) AS blocked,
                           ROUND(AVG(latency_ms)) AS avg_latency
                    FROM audit_events
                    WHERE org_id=$1 AND created_at BETWEEN $2 AND $3`,
            [org.id, dayStart, dayEnd]),
          db.query(`SELECT unnest(input_flags) AS flag, COUNT(*) AS cnt
                    FROM audit_events
                    WHERE org_id=$1 AND created_at BETWEEN $2 AND $3 AND input_flags != '{}'
                    GROUP BY flag ORDER BY cnt DESC LIMIT 5`,
            [org.id, dayStart, dayEnd]),
        ]);

        await sendDailyDigest(org.digest_url, {
          orgName: org.name,
          stats: {
            total:      parseInt(stats?.total || 0),
            passed:     parseInt(stats?.passed || 0),
            blocked:    parseInt(stats?.blocked || 0),
            avgLatency: parseInt(stats?.avg_latency || 0),
          },
          topFlags,
          appUrl: APP_URL,
        });
        logger.info('📨 Slack digest sent', { org: org.name });
      } catch (err) {
        logger.error('Slack digest failed for org', { org: org.name, error: err.message });
      }
    }
  } catch (err) {
    logger.error('Slack daily digest cron failed', { error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`🚀 PromptSense API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
