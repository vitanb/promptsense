'use strict';
/**
 * SSO Controller — OIDC (OpenID Connect) + SAML 2.0
 *
 * Supported IdPs via OIDC:  Okta, Azure AD, Google Workspace, Auth0, OneLogin, PingFederate
 * Supported IdPs via SAML:  Okta, Azure AD, ADFS, and any SAML 2.0 compliant IdP
 *
 * Environment variables needed:
 *   API_URL          — public backend URL  e.g. https://api.promptsense.io
 *   FRONTEND_URL     — public frontend URL e.g. https://app.promptsense.io
 *   ENCRYPTION_KEY   — already used by encryption.js
 */

const crypto = require('crypto');
const { query } = require('../db/pool');
const { encrypt, decrypt } = require('../utils/encryption');
const { generateTokens, storeRefreshToken } = require('./auth.controller');
const logger = require('../utils/logger');

// ── Optional deps (graceful degradation if not yet installed) ─────────────────
let Issuer, generators;
try {
  ({ Issuer, generators } = require('openid-client'));
} catch (_) {
  logger.warn('[SSO] openid-client not installed — OIDC SSO unavailable');
}

let NodeSaml;
try {
  ({ SAML: NodeSaml } = require('@node-saml/node-saml'));
} catch (_) {
  logger.warn('[SSO] @node-saml/node-saml not installed — SAML SSO unavailable');
}

// ── State stores ──────────────────────────────────────────────────────────────
// OIDC: state -> { nonce, orgSlug, expiresAt }
const oidcStateStore = new Map();
// OIDC client cache: orgId -> { client, expiresAt }
const oidcClientCache = new Map();

// Sweep every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of oidcStateStore) if (v.expiresAt < now) oidcStateStore.delete(k);
  for (const [k, v] of oidcClientCache) if (v.expiresAt < now) oidcClientCache.delete(k);
}, 5 * 60 * 1000);

// ── Helpers ───────────────────────────────────────────────────────────────────
const apiUrl      = () => (process.env.API_URL      || 'http://localhost:4000').replace(/\/$/, '');
const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

const oidcCallbackUrl = () => `${apiUrl()}/api/auth/sso/oidc/callback`;
const samlCallbackUrl = () => `${apiUrl()}/api/auth/sso/saml/callback`;

/** Load SSO config for an org slug. Returns null if not found / not enabled. */
async function loadSsoConfig(orgSlug, { requireEnabled = true } = {}) {
  const { rows: [cfg] } = await query(
    `SELECT sc.*, o.id as org_id, o.name as org_name, o.slug
     FROM sso_configs sc
     JOIN organizations o ON o.id = sc.org_id
     WHERE o.slug = $1 AND o.deleted_at IS NULL`,
    [orgSlug]
  );
  if (!cfg) return null;
  if (requireEnabled && !cfg.enabled) return null;
  return cfg;
}

/** JIT-provision (create or find) a user from SSO claims, add membership if needed. */
async function provisionUser(cfg, email, name, ssoSub) {
  if (!email) throw new Error('IdP did not return an email address');

  const providerKey = `${cfg.org_id}:${cfg.provider_type}`;

  // 1. Try by SSO sub (most reliable)
  let user;
  const { rows: [bySub] } = await query(
    'SELECT * FROM users WHERE sso_provider=$1 AND sso_sub=$2',
    [providerKey, ssoSub]
  );
  user = bySub;

  // 2. Fall back to email match
  if (!user) {
    const { rows: [byEmail] } = await query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    user = byEmail;
    if (user) {
      // Link this user to SSO
      await query('UPDATE users SET sso_provider=$1, sso_sub=$2 WHERE id=$3', [providerKey, ssoSub, user.id]);
    }
  }

  // 3. JIT-create new user
  if (!user && cfg.auto_provision) {
    const { rows: [newUser] } = await query(
      `INSERT INTO users (email, full_name, email_verified, sso_provider, sso_sub)
       VALUES ($1,$2,true,$3,$4) RETURNING *`,
      [email.toLowerCase(), name || email.split('@')[0], providerKey, ssoSub]
    );
    user = newUser;
    logger.info('[SSO] JIT-provisioned new user', { userId: user.id, email, orgId: cfg.org_id });
  }

  if (!user) throw new Error('User does not exist and auto-provisioning is disabled');

  // 4. Ensure org membership exists
  const { rows: [membership] } = await query(
    'SELECT id FROM memberships WHERE org_id=$1 AND user_id=$2 AND active=true',
    [cfg.org_id, user.id]
  );
  if (!membership) {
    await query(
      'INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [cfg.org_id, user.id, cfg.default_role || 'user']
    );
    logger.info('[SSO] Added SSO user to org', { userId: user.id, orgId: cfg.org_id, role: cfg.default_role });
  }

  return user;
}

/** Issue PromptSense JWT tokens and redirect to frontend callback page. */
async function completeLogin(res, user, orgId) {
  const { rows: [org] } = await query(
    `SELECT m.role, o.id as org_id, o.name as org_name, o.slug, COALESCE(p.name,'starter') as plan_name
     FROM memberships m
     JOIN organizations o ON o.id=m.org_id
     LEFT JOIN plans p ON p.id=o.plan_id
     WHERE m.user_id=$1 AND m.org_id=$2 AND m.active=true`,
    [user.id, orgId]
  );

  const extra = {
    email: user.email,
    fullName: user.full_name,
    emailVerified: user.email_verified,
    isSuperuser: !!user.is_superuser,
  };

  const { accessToken, refreshToken } = generateTokens(user.id, extra);
  await Promise.all([
    storeRefreshToken(user.id, refreshToken),
    query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]),
  ]);

  // Pass tokens to frontend via query params on the SSO callback page
  const params = new URLSearchParams({
    at: accessToken,
    rt: refreshToken,
    orgId,
    orgName: org?.org_name || '',
    orgSlug: org?.slug || '',
    role: org?.role || 'user',
    planName: org?.plan_name || 'starter',
  });

  res.redirect(`${frontendUrl()}/auth/sso/callback?${params.toString()}`);
}

// ── Route handlers ─────────────────────────────────────────────────────────────

/**
 * GET /api/auth/sso/check?email=user@company.com
 * Returns whether the email's domain has SSO configured, so the login page
 * can show the "Continue with SSO" button automatically.
 */
async function checkEmail(req, res) {
  const { email } = req.query;
  if (!email) return res.json({ hasSso: false });

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return res.json({ hasSso: false });

  const { rows: [cfg] } = await query(
    `SELECT sc.provider_type, o.slug
     FROM sso_configs sc
     JOIN organizations o ON o.id = sc.org_id
     WHERE sc.email_domain = $1 AND sc.enabled = true AND o.deleted_at IS NULL`,
    [domain]
  );

  if (!cfg) return res.json({ hasSso: false });
  res.json({ hasSso: true, orgSlug: cfg.slug, provider: cfg.provider_type });
}

/**
 * GET /api/auth/sso/start?org=acme
 * Initiates the SSO flow for the given org slug.
 */
async function start(req, res) {
  const { org } = req.query;
  if (!org) return res.status(400).json({ error: 'Missing org parameter' });

  const cfg = await loadSsoConfig(org);
  if (!cfg) return res.status(404).json({ error: 'SSO not configured or not enabled for this organization' });

  if (cfg.provider_type === 'oidc') return startOidc(req, res, cfg);
  if (cfg.provider_type === 'saml') return startSaml(req, res, cfg);
  res.status(400).json({ error: `Unknown provider type: ${cfg.provider_type}` });
}

// ── OIDC ───────────────────────────────────────────────────────────────────────

async function getOidcClient(cfg) {
  if (!Issuer) throw new Error('openid-client is not installed on this server');

  const cached = oidcClientCache.get(cfg.org_id);
  if (cached && cached.expiresAt > Date.now()) return cached.client;

  const issuer = await Issuer.discover(cfg.discovery_url);
  const client = new issuer.Client({
    client_id: cfg.client_id,
    client_secret: decrypt(cfg.encrypted_client_secret),
    redirect_uris: [oidcCallbackUrl()],
    response_types: ['code'],
  });

  oidcClientCache.set(cfg.org_id, { client, expiresAt: Date.now() + 60 * 60 * 1000 });
  return client;
}

async function startOidc(req, res, cfg) {
  try {
    const client = await getOidcClient(cfg);

    const state = `${cfg.slug}.${generators.state()}`;
    const nonce = generators.nonce();
    oidcStateStore.set(state, { nonce, orgSlug: cfg.slug, expiresAt: Date.now() + 10 * 60 * 1000 });

    const url = client.authorizationUrl({ scope: 'openid email profile', state, nonce });
    res.redirect(url);
  } catch (err) {
    logger.error('[SSO OIDC] start error', { error: err.message, org: cfg.slug });
    res.redirect(`${frontendUrl()}/auth/login?sso_error=${encodeURIComponent('SSO configuration error: ' + err.message)}`);
  }
}

/**
 * GET /api/auth/sso/oidc/callback
 */
async function oidcCallback(req, res) {
  const state = req.query.state;
  const storeEntry = oidcStateStore.get(state);

  if (!storeEntry) {
    return res.redirect(`${frontendUrl()}/auth/login?sso_error=${encodeURIComponent('SSO session expired or invalid state')}`);
  }
  oidcStateStore.delete(state);

  try {
    const cfg = await loadSsoConfig(storeEntry.orgSlug);
    if (!cfg) throw new Error('SSO config not found');

    const client = await getOidcClient(cfg);
    const params = client.callbackParams(req);
    const tokenSet = await client.callback(oidcCallbackUrl(), params, {
      state,
      nonce: storeEntry.nonce,
    });

    const claims = tokenSet.claims();
    const email = claims[cfg.attr_email] || claims.email;
    const name  = claims[cfg.attr_name]  || claims.name || claims.given_name;
    const sub   = claims.sub;

    const user = await provisionUser(cfg, email, name, sub);
    await completeLogin(res, user, cfg.org_id);
  } catch (err) {
    logger.error('[SSO OIDC] callback error', { error: err.message });
    res.redirect(`${frontendUrl()}/auth/login?sso_error=${encodeURIComponent(err.message)}`);
  }
}

// ── SAML ───────────────────────────────────────────────────────────────────────

function buildSamlInstance(cfg) {
  if (!NodeSaml) throw new Error('@node-saml/node-saml is not installed on this server');

  // Normalize cert: strip PEM headers if present, then re-wrap
  let cert = (cfg.idp_certificate || '').trim()
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  return new NodeSaml({
    callbackUrl:          samlCallbackUrl(),
    entryPoint:           cfg.idp_sso_url,
    issuer:               cfg.sp_entity_id || `promptsense-${cfg.slug}`,
    idpIssuer:            cfg.idp_entity_id || undefined,
    cert,
    wantAssertionsSigned: false,   // set to true once IdP is confirmed working
    signatureAlgorithm:   'sha256',
  });
}

async function startSaml(req, res, cfg) {
  try {
    const saml = buildSamlInstance(cfg);
    // RelayState carries the org slug through the IdP round-trip
    const url = await saml.getAuthorizeUrlAsync(cfg.slug, req.hostname, {});
    res.redirect(url);
  } catch (err) {
    logger.error('[SSO SAML] start error', { error: err.message, org: cfg.slug });
    res.redirect(`${frontendUrl()}/auth/login?sso_error=${encodeURIComponent('SAML configuration error: ' + err.message)}`);
  }
}

/**
 * POST /api/auth/sso/saml/callback
 * Assertion Consumer Service (ACS) endpoint.
 */
async function samlCallback(req, res) {
  const orgSlug = req.body.RelayState;
  if (!orgSlug) {
    return res.redirect(`${frontendUrl()}/auth/login?sso_error=${encodeURIComponent('Missing RelayState in SAML response')}`);
  }

  try {
    const cfg = await loadSsoConfig(orgSlug);
    if (!cfg) throw new Error('SSO config not found for this organization');

    const saml = buildSamlInstance(cfg);
    const { profile } = await saml.validatePostResponseAsync(req.body);

    // Map attributes — SAML profile may use nameID or attribute statements
    const email = profile[cfg.attr_email] || profile.email || profile.nameID;
    const name  = profile[cfg.attr_name]  || profile.displayName || profile.cn;
    const sub   = profile.nameID || email;

    const user = await provisionUser(cfg, email, name, sub);
    await completeLogin(res, user, cfg.org_id);
  } catch (err) {
    logger.error('[SSO SAML] callback error', { error: err.message });
    res.redirect(`${frontendUrl()}/auth/login?sso_error=${encodeURIComponent(err.message)}`);
  }
}

/**
 * GET /api/auth/sso/saml/metadata?org=acme
 * Returns the SP (Service Provider) metadata XML that admins paste into their IdP.
 */
async function samlMetadata(req, res) {
  const { org } = req.query;
  if (!org) return res.status(400).send('Missing org parameter');

  const cfg = await loadSsoConfig(org, { requireEnabled: false });
  if (!cfg || cfg.provider_type !== 'saml') return res.status(404).send('SAML not configured for this organization');

  try {
    const saml = buildSamlInstance(cfg);
    const metadata = saml.generateServiceProviderMetadata(null, null);
    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  } catch (err) {
    res.status(500).send(`Error generating metadata: ${err.message}`);
  }
}

// ── SSO Config CRUD (org-scoped, called from config.routes.js) ─────────────────

async function getSsoConfig(req, res) {
  const { rows: [cfg] } = await query(
    `SELECT id, provider_type, enabled, email_domain,
            discovery_url, client_id,
            idp_sso_url, idp_entity_id, idp_certificate, sp_entity_id,
            attr_email, attr_name, auto_provision, default_role,
            -- never return the encrypted secret
            CASE WHEN encrypted_client_secret IS NOT NULL THEN true ELSE false END as has_client_secret
     FROM sso_configs WHERE org_id=$1`,
    [req.orgId]
  );
  res.json(cfg || null);
}

async function upsertSsoConfig(req, res) {
  const {
    providerType, enabled, emailDomain,
    // OIDC
    discoveryUrl, clientId, clientSecret,
    // SAML
    idpSsoUrl, idpEntityId, idpCertificate, spEntityId,
    // Mapping + provisioning
    attrEmail, attrName, autoProvision, defaultRole,
  } = req.body;

  const { rows: [existing] } = await query('SELECT id, encrypted_client_secret FROM sso_configs WHERE org_id=$1', [req.orgId]);

  // Only re-encrypt if a new secret was provided
  const encSecret = clientSecret
    ? encrypt(clientSecret)
    : (existing?.encrypted_client_secret || null);

  if (existing) {
    const { rows: [cfg] } = await query(
      `UPDATE sso_configs SET
        provider_type=$1, enabled=$2, email_domain=$3,
        discovery_url=$4, client_id=$5, encrypted_client_secret=$6,
        idp_sso_url=$7, idp_entity_id=$8, idp_certificate=$9, sp_entity_id=$10,
        attr_email=$11, attr_name=$12, auto_provision=$13, default_role=$14,
        updated_at=now()
       WHERE org_id=$15
       RETURNING id, provider_type, enabled, email_domain, discovery_url, client_id,
                 idp_sso_url, idp_entity_id, idp_certificate, sp_entity_id,
                 attr_email, attr_name, auto_provision, default_role`,
      [
        providerType||'oidc', enabled??false, emailDomain||null,
        discoveryUrl||null, clientId||null, encSecret,
        idpSsoUrl||null, idpEntityId||null, idpCertificate||null, spEntityId||null,
        attrEmail||'email', attrName||'name', autoProvision??true, defaultRole||'user',
        req.orgId,
      ]
    );
    // Bust OIDC client cache on config change
    oidcClientCache.delete(req.orgId);
    return res.json(cfg);
  }

  const { rows: [cfg] } = await query(
    `INSERT INTO sso_configs
       (org_id, provider_type, enabled, email_domain,
        discovery_url, client_id, encrypted_client_secret,
        idp_sso_url, idp_entity_id, idp_certificate, sp_entity_id,
        attr_email, attr_name, auto_provision, default_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id, provider_type, enabled, email_domain, discovery_url, client_id,
               idp_sso_url, idp_entity_id, idp_certificate, sp_entity_id,
               attr_email, attr_name, auto_provision, default_role`,
    [
      req.orgId,
      providerType||'oidc', enabled??false, emailDomain||null,
      discoveryUrl||null, clientId||null, encSecret,
      idpSsoUrl||null, idpEntityId||null, idpCertificate||null, spEntityId||null,
      attrEmail||'email', attrName||'name', autoProvision??true, defaultRole||'user',
    ]
  );
  res.status(201).json(cfg);
}

module.exports = { checkEmail, start, oidcCallback, samlCallback, samlMetadata, getSsoConfig, upsertSsoConfig };
