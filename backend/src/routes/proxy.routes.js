const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/proxy.controller');
const { authenticate, loadOrg, authenticateApiKey, requireTrialAccess } = require('../middleware/auth');
const { validateProxy } = require('../middleware/validate');
// Use Redis-backed rate limiter in production (falls back to in-memory if REDIS_URL not set)
const { perOrgRateLimit } = require('../middleware/rateLimitRedis');

// Proxy — allowed during free trial (Playground feature)
router.post('/proxy', authenticateApiKey, authenticate, loadOrg, requireTrialAccess({ trial: true }), perOrgRateLimit, validateProxy, ctrl.proxyPrompt);

// Analytics + Audit — blocked during free trial
router.get('/analytics', authenticate, loadOrg, requireTrialAccess(), ctrl.getAnalytics);
router.get('/audit',     authenticate, loadOrg, requireTrialAccess(), ctrl.getAuditLog);

// CSV export — blocked during free trial
router.get('/audit/export', authenticate, loadOrg, requireTrialAccess(), async (req, res) => {
  const { query } = require('../db/pool');
  const { rows } = await query(
    'SELECT * FROM audit_events WHERE org_id=$1 ORDER BY created_at DESC LIMIT 10000',
    [req.orgId]
  );
  const header = ['id','created_at','provider','model','route','passed','latency_ms','tokens_used','input_flags','output_flags','input_text','output_text'];
  const csv = [
    header.join(','),
    ...rows.map(r => header.map(k => {
      const v = Array.isArray(r[k]) ? r[k].join('|') : String(r[k]??'');
      return `"${v.replace(/"/g,'""')}"`;
    }).join(','))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="promptsense_audit.csv"');
  res.send(csv);
});

module.exports = router;
