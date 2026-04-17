const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/org.controller');
const { authenticate, loadOrg, requireRole, requireTrialAccess } = require('../middleware/auth');
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

// API Keys — allowed during free trial (needed to use Playground via SDK)
router.get('/api-keys',                           requireTrialAccess({ trial: true }), ctrl.listApiKeys);
router.post('/api-keys',        requireRole('developer'), requireTrialAccess({ trial: true }), ctrl.createApiKey);
router.delete('/api-keys/:id',  requireRole('developer'), requireTrialAccess({ trial: true }), ctrl.revokeApiKey);

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
