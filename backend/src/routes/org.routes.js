const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/org.controller');
const { authenticate, loadOrg, requireRole, requireTrialAccess, requireSuperuser } = require('../middleware/auth');
const { validateProviderUrl } = require('../middleware/validate');

// All org routes require auth + org membership
router.use(authenticate, loadOrg);

// Members — blocked during free trial
router.get('/members',                                              requireTrialAccess(), ctrl.listMembers);
router.post('/members/invite',        requireRole('administrator'), requireTrialAccess(), ctrl.inviteMember);
router.patch('/members/:memberId/role',       requireRole('administrator'), requireTrialAccess(), ctrl.updateMemberRole);
router.patch('/members/:memberId/department', requireRole('administrator'), requireTrialAccess(), ctrl.updateMemberDepartment);
router.delete('/members/:memberId',           requireRole('administrator'), requireTrialAccess(), ctrl.removeMember);

// Provider connections — allowed during free trial (Integrations page)
router.get('/providers',                          requireTrialAccess({ trial: true }), ctrl.listProviders);
router.put('/providers',        requireRole('developer'), requireTrialAccess({ trial: true }), validateProviderUrl, ctrl.upsertProvider);
router.delete('/providers/:provider', requireRole('developer'), requireTrialAccess({ trial: true }), ctrl.deleteProvider);

// Downstream systems — full CRUD, allowed during free trial
router.get('/downstreams',                              requireTrialAccess({ trial: true }), ctrl.listDownstreams);
router.post('/downstreams',         requireRole('developer'), requireTrialAccess({ trial: true }), ctrl.createDownstream);
router.patch('/downstreams/:id',    requireRole('developer'), requireTrialAccess({ trial: true }), ctrl.updateDownstream);
router.delete('/downstreams/:id',   requireRole('developer'), requireTrialAccess({ trial: true }), ctrl.deleteDownstream);

// API Keys — allowed during free trial (needed to use Playground via SDK)
router.get('/api-keys',                           requireTrialAccess({ trial: true }), ctrl.listApiKeys);
router.post('/api-keys',        requireRole('developer'), requireTrialAccess({ trial: true }), ctrl.createApiKey);
router.delete('/api-keys/:id',  requireRole('developer'), requireTrialAccess({ trial: true }), ctrl.revokeApiKey);
// Hard-delete a revoked key — superusers only
router.delete('/api-keys/:id/delete', requireSuperuser, ctrl.deleteApiKey);

// Activation status
router.get('/activation', ctrl.getActivationStatus);

// Audit export — CSV download (audit_events from tenant DB, user emails from platform DB)
router.get('/audit-export', requireTrialAccess(), async (req, res) => {
  const { query: platformQuery } = require('../db/pool');
  const { from, to, passed } = req.query;

  const conditions = ['org_id = $1'];
  const params = [req.orgId];
  let idx = 2;

  if (from)   { conditions.push(`created_at >= $${idx++}`); params.push(from); }
  if (to)     { conditions.push(`created_at <= $${idx++}`); params.push(to); }
  if (passed !== undefined && passed !== '') {
    conditions.push(`passed = $${idx++}`);
    params.push(passed === 'true');
  }

  const where = conditions.join(' AND ');
  const { rows } = await req.db.query(
    `SELECT id, created_at, user_id, provider, route, passed,
            input_text, output_text, input_flags, output_flags, latency_ms, tokens_used
     FROM audit_events
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT 10000`,
    params
  );

  // Resolve user emails from platform DB
  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  let emailMap = {};
  if (userIds.length > 0) {
    const { rows: users } = await platformQuery(
      `SELECT id, email FROM users WHERE id = ANY($1)`,
      [userIds]
    );
    emailMap = Object.fromEntries(users.map(u => [u.id, u.email]));
  }

  // Build CSV
  const escape = v => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join(';') : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const enriched = rows.map(r => ({ ...r, user_email: emailMap[r.user_id] || '' }));
  const headers = ['id','created_at','user_email','provider','route','passed','latency_ms','tokens_used','input_flags','output_flags','input_text','output_text'];
  const csv = [
    headers.join(','),
    ...enriched.map(r => headers.map(h => escape(r[h])).join(','))
  ].join('\r\n');

  const filename = `promptsense-audit-${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// Compliance report — print-ready HTML (user saves as PDF via browser)
router.get('/audit-report', requireTrialAccess(), async (req, res) => {
  const { query: platformQuery } = require('../db/pool');
  const { from, to } = req.query;

  const conditions = ['org_id = $1'];
  const params = [req.orgId];
  let idx = 2;
  if (from) { conditions.push(`created_at >= $${idx++}`); params.push(from); }
  if (to)   { conditions.push(`created_at <= $${idx++}`); params.push(to); }
  const where = conditions.join(' AND ');

  // Fetch audit data from tenant DB + org name from platform DB
  const [{ rows: rawEvents }, { rows: [stats] }, { rows: topFlags }, { rows: [orgRow] }] = await Promise.all([
    req.db.query(`SELECT id, created_at, user_id, provider, route, passed, input_flags, latency_ms
                  FROM audit_events WHERE ${where} ORDER BY created_at DESC LIMIT 500`, params),
    req.db.query(`SELECT COUNT(*) AS total,
                         SUM(CASE WHEN passed THEN 1 ELSE 0 END) AS passed_count,
                         SUM(CASE WHEN NOT passed THEN 1 ELSE 0 END) AS blocked_count,
                         ROUND(AVG(latency_ms)) AS avg_latency,
                         SUM(tokens_used) AS total_tokens
                  FROM audit_events WHERE ${where}`, params),
    req.db.query(`SELECT unnest(input_flags) AS flag, COUNT(*) AS cnt
                  FROM audit_events WHERE ${where} AND input_flags != '{}'
                  GROUP BY flag ORDER BY cnt DESC LIMIT 10`, params),
    platformQuery(`SELECT name FROM organizations WHERE id=$1`, [req.orgId]),
  ]);

  // Resolve user emails from platform DB
  const userIds = [...new Set(rawEvents.map(e => e.user_id).filter(Boolean))];
  let emailMap = {};
  if (userIds.length > 0) {
    const { rows: users } = await platformQuery('SELECT id, email FROM users WHERE id = ANY($1)', [userIds]);
    emailMap = Object.fromEntries(users.map(u => [u.id, u.email]));
  }
  const events = rawEvents.map(e => ({ ...e, user_email: emailMap[e.user_id] || null }));

  const total = parseInt(stats?.total || 0);
  const passed = parseInt(stats?.passed_count || 0);
  const blocked = parseInt(stats?.blocked_count || 0);
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const orgName = orgRow?.name || 'Organization';
  const dateRange = `${from || 'all time'} — ${to || 'now'}`;
  const generated = new Date().toISOString();

  const rowsHtml = events.slice(0, 200).map(e => `
    <tr>
      <td>${new Date(e.created_at).toLocaleString()}</td>
      <td>${e.user_email || '—'}</td>
      <td>${e.provider || '—'}</td>
      <td><span class="${e.passed ? 'pass' : 'block'}">${e.passed ? 'Pass' : 'Block'}</span></td>
      <td>${(e.input_flags || []).join(', ') || '—'}</td>
      <td>${e.latency_ms ? e.latency_ms + ' ms' : '—'}</td>
    </tr>`).join('');

  const flagsHtml = topFlags.map(f =>
    `<div class="flag-row"><span>${f.flag}</span><strong>${f.cnt}</strong></div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>PromptSense Compliance Report — ${orgName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #fff; font-size: 13px; }
    .page { max-width: 900px; margin: 0 auto; padding: 40px 40px 60px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7c3aed; padding-bottom: 16px; margin-bottom: 28px; }
    .logo { font-size: 20px; font-weight: 800; color: #7c3aed; letter-spacing: -0.02em; }
    .logo span { font-size: 11px; display: block; color: #666; font-weight: 400; margin-top: 2px; letter-spacing: 0; }
    .meta { text-align: right; font-size: 11px; color: #666; line-height: 1.7; }
    h2 { font-size: 15px; font-weight: 700; color: #111; margin: 28px 0 12px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
    .stat { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
    .stat .val { font-size: 28px; font-weight: 800; color: #7c3aed; }
    .stat .lbl { font-size: 11px; color: #666; margin-top: 2px; }
    .flags { display: flex; flex-direction: column; gap: 6px; margin-bottom: 28px; }
    .flag-row { display: flex; justify-content: space-between; padding: 7px 12px; background: #f9fafb; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    th { text-align: left; padding: 8px 10px; background: #f3f4f6; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; }
    td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; color: #374151; }
    tr:hover td { background: #fafafa; }
    .pass { color: #16a34a; font-weight: 600; }
    .block { color: #dc2626; font-weight: 600; }
    footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print {
      body { font-size: 11px; }
      .page { padding: 20px; max-width: 100%; }
      .print-btn { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <div>
        <div class="logo">PromptSense<span>Enterprise AI Guardrails</span></div>
        <div style="font-size:18px;font-weight:700;color:#111;margin-top:8px">Compliance Report</div>
        <div style="font-size:12px;color:#666;margin-top:4px">${orgName}</div>
      </div>
      <div class="meta">
        Period: ${dateRange}<br/>
        Generated: ${new Date(generated).toLocaleString()}<br/>
        Total events shown: ${Math.min(events.length, 200)} of ${total}
      </div>
    </header>

    <button class="print-btn" onclick="window.print()" style="margin-bottom:20px;padding:9px 20px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">
      🖨 Save as PDF (Print)
    </button>

    <h2>Summary</h2>
    <div class="stats">
      <div class="stat"><div class="val">${total.toLocaleString()}</div><div class="lbl">Total requests</div></div>
      <div class="stat"><div class="val">${passRate}%</div><div class="lbl">Pass rate</div></div>
      <div class="stat"><div class="val">${blocked.toLocaleString()}</div><div class="lbl">Blocked</div></div>
      <div class="stat"><div class="val">${stats?.avg_latency || 0} ms</div><div class="lbl">Avg latency</div></div>
    </div>

    ${topFlags.length > 0 ? `<h2>Top guardrail triggers</h2><div class="flags">${flagsHtml}</div>` : ''}

    <h2>Audit log (latest ${Math.min(events.length, 200)} events)</h2>
    <table>
      <thead><tr><th>Timestamp</th><th>User</th><th>Provider</th><th>Result</th><th>Flags</th><th>Latency</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <footer>
      <span>PromptSense — promptsense.io</span>
      <span>This report is generated from immutable audit records and may be used for compliance review.</span>
    </footer>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Slack integration — save config + test webhooks
router.get('/slack', requireRole('administrator'), async (req, res) => {
  const settings = req.org?.settings || {};
  res.json({
    digestUrl:      settings.slack_digest_url || '',
    alertsUrl:      settings.slack_alerts_url || '',
    digestEnabled:  settings.slack_digest_enabled !== false,
    alertsEnabled:  settings.slack_alerts_enabled !== false,
  });
});

router.put('/slack', requireRole('administrator'), requireTrialAccess(), async (req, res) => {
  const { query } = require('../db/pool');
  const { digestUrl, alertsUrl, digestEnabled, alertsEnabled } = req.body;
  await query(
    `UPDATE organizations SET settings = settings ||
       jsonb_build_object(
         'slack_digest_url',     $1::text,
         'slack_alerts_url',     $2::text,
         'slack_digest_enabled', $3::boolean,
         'slack_alerts_enabled', $4::boolean
       )
     WHERE id = $5`,
    [digestUrl || '', alertsUrl || '', digestEnabled !== false, alertsEnabled !== false, req.orgId]
  );
  res.json({ saved: true });
});

router.post('/slack/test-digest', requireRole('administrator'), async (req, res) => {
  const { sendDailyDigest } = require('../utils/slack');
  const settings = req.org?.settings || {};
  const url = settings.slack_digest_url;
  if (!url) return res.status(400).json({ error: 'No digest webhook URL configured' });
  await sendDailyDigest(url, {
    orgName: req.org.org_name,
    stats: { total: 247, passed: 231, blocked: 16, avgLatency: 312 },
    topFlags: [{ flag: 'PII detected', cnt: 9 }, { flag: 'Prompt injection', cnt: 4 }, { flag: 'Toxicity', cnt: 3 }],
    appUrl: process.env.FRONTEND_URL || 'https://app.prompt-sense.net',
  });
  res.json({ sent: true });
});

router.post('/slack/test-alert', requireRole('administrator'), async (req, res) => {
  const { sendBlockAlert } = require('../utils/slack');
  const settings = req.org?.settings || {};
  const url = settings.slack_alerts_url;
  if (!url) return res.status(400).json({ error: 'No alerts webhook URL configured' });
  await sendBlockAlert(url, {
    orgName: req.org.org_name,
    prompt: 'My SSN is 123-45-6789, please store it.',
    flags: ['PII detected'],
    provider: 'anthropic',
    auditId: 'test-00000000',
    appUrl: process.env.FRONTEND_URL || 'https://app.prompt-sense.net',
  });
  res.json({ sent: true });
});

// Org info
router.get('/', async (req, res) => {
  const { query } = require('../db/pool');
  const { rows: [org] } = await query(
    `SELECT o.*, p.name as plan_name, p.display_name, p.price_monthly, p.requests_per_month,
            p.members_limit, p.guardrails_limit, p.webhooks_limit, p.features,
            -- Trial window: 7 days from org creation, only meaningful for starter plan
            (o.created_at + INTERVAL '7 days')                      AS trial_ends_at,
            -- Paid = has an active Stripe subscription on any plan
            COALESCE(o.subscription_status = 'active', false)        AS is_paid
     FROM organizations o JOIN plans p ON p.id=o.plan_id WHERE o.id=$1`,
    [req.orgId]
  );
  res.json(org);
});

router.patch('/', requireRole('administrator'), async (req, res) => {
  const { query } = require('../db/pool');
  const { name, billingEmail } = req.body;
  const { rows: [org] } = await query(
    'UPDATE organizations SET name=COALESCE($1,name), billing_email=COALESCE($2,billing_email) WHERE id=$3 RETURNING *',
    [name, billingEmail, req.orgId]
  );
  res.json(org);
});

// Tenant branding (logo, color, domain)
router.patch('/branding', requireRole('administrator'), ctrl.updateBranding);

// Org privacy / data settings
router.get('/settings',   requireRole('administrator'), ctrl.getSettings);
router.patch('/settings', requireRole('administrator'), ctrl.updateSettings);

// Industry compliance templates (read-only — all authenticated members can browse)
router.get('/settings/compliance-templates', ctrl.getComplianceTemplates);

module.exports = router;
