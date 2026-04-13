const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/gauntlet.controller');
const { authenticate, loadOrg, requireRole, requireTrialAccess } = require('../middleware/auth');

// All gauntlet routes require auth + org membership; blocked during free trial
router.use(authenticate, loadOrg, requireTrialAccess());

// Available probe categories (public within org)
router.get('/categories', ctrl.listCategories);

// Run management
router.get('/runs',                                        ctrl.listRuns);
router.post('/runs',          requireRole('developer'),    ctrl.createRun);
router.get('/runs/:runId',                                 ctrl.getRun);
router.get('/runs/:runId/results',                         ctrl.getResults);
router.delete('/runs/:runId', requireRole('developer'),    ctrl.deleteRun);

module.exports = router;
