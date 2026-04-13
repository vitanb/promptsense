'use strict';
/**
 * SSO public routes — mounted at /api/auth/sso
 * These are NOT authenticated (they're part of the login flow).
 */
const router = require('express').Router();
const ctrl   = require('../controllers/sso.controller');

// Email domain check (login page calls this to detect SSO)
router.get('/check', ctrl.checkEmail);

// Initiate SSO — redirects to IdP
router.get('/start', ctrl.start);

// OIDC callback (IdP redirects back here with ?code=...&state=...)
router.get('/oidc/callback', ctrl.oidcCallback);

// SAML ACS — IdP POSTs the SAML response here
router.post('/saml/callback', ctrl.samlCallback);

// SP Metadata — paste this URL into your IdP's SAML configuration
router.get('/saml/metadata', ctrl.samlMetadata);

module.exports = router;
