const router = require('express').Router();
const Joi = require('joi');
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });
  next();
};

const schemas = {
  register: Joi.object({ email: Joi.string().email().required(), password: Joi.string().min(8).required(), fullName: Joi.string().min(2).required(), orgName: Joi.string().min(2).required() }),
  login:    Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() }),
  reset:    Joi.object({ token: Joi.string().required(), password: Joi.string().min(8).required() }),
  forgot:   Joi.object({ email: Joi.string().email().required() }),
  verify:   Joi.object({ token: Joi.string().required() }),
};

router.post('/register',         validate(schemas.register), ctrl.register);
router.post('/login',            validate(schemas.login),    ctrl.login);
router.post('/refresh',          ctrl.refresh);
router.post('/logout',           ctrl.logout);
router.post('/verify-email',     validate(schemas.verify),   ctrl.verifyEmail);
router.post('/forgot-password',  validate(schemas.forgot),   ctrl.forgotPassword);
router.post('/reset-password',   validate(schemas.reset),    ctrl.resetPassword);
router.get('/me',                authenticate,               ctrl.me);
router.delete('/account',        authenticate,               ctrl.deleteAccount);

module.exports = router;
