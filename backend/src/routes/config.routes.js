const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/config.controller');
const ssoCtrl = require('../controllers/sso.controller');
const { authenticate, loadOrg, requireRole, requireTrialAccess } = require('../middleware/auth');
const { validateWebhookUrl, validateDownstreamUrl } = require('../middleware/validate');

router.use(authenticate, loadOrg);

// Guardrails — blocked during free trial
router.get('/guardrails',                                requireTrialAccess(), ctrl.listGuardrails);
router.post('/guardrails',        requireRole('developer'), requireTrialAccess(), ctrl.createGuardrail);
router.patch('/guardrails/:id',   requireRole('developer'), requireTrialAccess(), ctrl.updateGuardrail);
router.delete('/guardrails/:id',  requireRole('developer'), requireTrialAccess(), ctrl.deleteGuardrail);

// Policies — blocked during free trial
router.get('/policies',                                  requireTrialAccess(), ctrl.listPolicies);
router.post('/policies',          requireRole('developer'), requireTrialAccess(), ctrl.createPolicy);
router.patch('/policies/:id',     requireRole('developer'), requireTrialAccess(), ctrl.updatePolicy);
router.delete('/policies/:id',    requireRole('developer'), requireTrialAccess(), ctrl.deletePolicy);

// Templates — blocked during free trial
router.get('/templates',                                 requireTrialAccess(), ctrl.listTemplates);
router.post('/templates',         requireRole('developer'), requireTrialAccess(), ctrl.createTemplate);
router.patch('/templates/:id',    requireRole('developer'), requireTrialAccess(), ctrl.updateTemplate);
router.delete('/templates/:id',   requireRole('developer'), requireTrialAccess(), ctrl.deleteTemplate);

// Webhooks — blocked during free trial
router.get('/webhooks',                                                                             requireTrialAccess(), ctrl.listWebhooks);
router.post('/webhooks',          requireRole('developer'), validateWebhookUrl,  requireTrialAccess(), ctrl.createWebhook);
router.patch('/webhooks/:id',     requireRole('developer'), validateWebhookUrl,  requireTrialAccess(), ctrl.updateWebhook);
router.delete('/webhooks/:id',    requireRole('developer'),                      requireTrialAccess(), ctrl.deleteWebhook);

// Downstream system — blocked during free trial
router.get('/downstream', async (req, res) => {
  const { query } = require('../db/pool');
  const { rows } = await query('SELECT id,name,endpoint_url,http_method,body_template,response_field,timeout_ms,fallback_to_provider,enabled FROM downstream_systems WHERE org_id=$1', [req.orgId]);
  res.json(rows[0] || null);
});

router.put('/downstream', requireRole('developer'), requireTrialAccess(), validateDownstreamUrl, async (req, res) => {
  const { query } = require('../db/pool');
  const { encrypt } = require('../utils/encryption');
  const { name, endpointUrl, apiKey, httpMethod, extraHeaders, bodyTemplate, responseField, timeoutMs, fallbackToProvider, enabled } = req.body;
  const { rows: [existing] } = await query('SELECT id FROM downstream_systems WHERE org_id=$1', [req.orgId]);
  const encKey = apiKey ? encrypt(apiKey) : undefined;

  if (existing) {
    const { rows: [ds] } = await query(
      `UPDATE downstream_systems SET name=COALESCE($1,name), endpoint_url=COALESCE($2,endpoint_url),
       http_method=COALESCE($3,http_method), extra_headers=COALESCE($4,extra_headers),
       body_template=COALESCE($5,body_template), response_field=COALESCE($6,response_field),
       timeout_ms=COALESCE($7,timeout_ms), fallback_to_provider=COALESCE($8,fallback_to_provider), enabled=COALESCE($9,enabled)
       ${encKey ? ', encrypted_api_key=$11' : ''}
       WHERE id=$10 AND org_id=${ encKey ? '12' : '11'}
       RETURNING id,name,endpoint_url,http_method,body_template,response_field,timeout_ms,fallback_to_provider,enabled`,
      encKey
        ? [name,endpointUrl,httpMethod,extraHeaders,bodyTemplate,responseField,timeoutMs,fallbackToProvider,enabled,existing.id,encKey,req.orgId]
        : [name,endpointUrl,httpMethod,extraHeaders,bodyTemplate,responseField,timeoutMs,fallbackToProvider,enabled,existing.id,req.orgId]
    );
    return res.json(ds);
  }

  const { rows: [ds] } = await query(
    `INSERT INTO downstream_systems (org_id,name,endpoint_url,encrypted_api_key,http_method,extra_headers,body_template,response_field,timeout_ms,fallback_to_provider,enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,name,endpoint_url,http_method,body_template,response_field,timeout_ms,fallback_to_provider,enabled`,
    [req.orgId, name||'Default', endpointUrl, encKey||null, httpMethod||'POST', extraHeaders||{}, bodyTemplate||'{"prompt":"{{prompt}}"}', responseField||'', timeoutMs||10000, fallbackToProvider??true, enabled??false]
  );
  res.status(201).json(ds);
});

// SSO configuration — blocked during free trial
router.get('/sso',  requireRole('administrator'), requireTrialAccess(), ssoCtrl.getSsoConfig);
router.put('/sso',  requireRole('administrator'), requireTrialAccess(), ssoCtrl.upsertSsoConfig);

module.exports = router;
