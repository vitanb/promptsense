require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

const authRoutes     = require('./routes/auth.routes');
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
const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: 'Too many auth attempts' } });

app.use('/api', limiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',                      authRoutes);
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

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`🚀 PromptSense API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
