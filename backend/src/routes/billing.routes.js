const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/billing.controller');
const { authenticate, loadOrg, requireRole } = require('../middleware/auth');

router.get('/',         authenticate, loadOrg,                              ctrl.getBilling);
router.post('/checkout',authenticate, loadOrg, requireRole('administrator'), ctrl.createCheckout);
router.post('/portal',  authenticate, loadOrg, requireRole('administrator'), ctrl.createPortal);

module.exports = router;
