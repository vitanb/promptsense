const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/org.controller');
const { authenticate, loadOrg, requireRole } = require('../middleware/auth');

// All org routes require auth + org membership
router.use(authenticate, loadOrg);

// Members
router.get('/members',                                              ctrl.listMembers);
router.post('/members/invite',        requireRole('administrator'), ctrl.inviteMember);
router.patch('/members/:memberId/role',       requireRole('administrator'), ctrl.updateMemberRole);
router.patch('/members/:memberId/department', requireRole('administrator'), ctrl.updateMemberDepartment);
router.delete('/members/:memberId',           requireRole('administrator'), ctrl.removeMember);

// Provider connections
router.get('/providers',                          ctrl.listProviders);
router.put('/providers',        requireRole('developer'), ctrl.upsertProvider);
router.delete('/providers/:provider', requireRole('developer'), ctrl.deleteProvider);

// API Keys
router.get('/api-keys',                           ctrl.listApiKeys);
router.post('/api-keys',        requireRole('developer'), ctrl.createApiKey);
router.delete('/api-keys/:id',  requireRole('developer'), ctrl.revokeApiKey);

// Org info
router.get('/', async (req, res) => {
  const { query } = require('../db/pool');
  const { rows: [org] } = await query(
    `SELECT o.*, p.name as plan_name, p.display_name, p.price_monthly, p.requests_per_month,
            p.members_limit, p.guardrails_limit, p.webhooks_limit, p.features
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

module.exports = router;
