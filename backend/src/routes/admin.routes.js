const router = require('express').Router();
const { authenticate, requireSuperuser } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

// All admin routes require valid JWT + superuser flag
router.use(authenticate, requireSuperuser);

// Platform stats
router.get('/stats', ctrl.getStats);

// User management
router.get('/users',                       ctrl.listUsers);
router.get('/users/:userId',               ctrl.getUser);
router.delete('/users/:userId',            ctrl.deleteUser);
router.patch('/users/:userId/superuser',   ctrl.toggleSuperuser);
router.post('/users/:userId/reset-password', ctrl.resetUserPassword);

// Organization (tenant) management
router.get('/orgs',                        ctrl.listOrgs);
router.post('/orgs',                       ctrl.createOrg);
router.get('/orgs/:orgId',                 ctrl.getOrgDetail);
router.patch('/orgs/:orgId/plan',          ctrl.updateOrgPlan);
router.post('/orgs/:orgId/suspend',        ctrl.suspendOrg);
router.post('/orgs/:orgId/activate',       ctrl.activateOrg);
router.delete('/orgs/:orgId',              ctrl.deleteOrg);

module.exports = router;
