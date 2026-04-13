'use strict';
/**
 * SSO Controller — OIDC (OpenID Connect) + SAML 2.0
 *
 * Both openid-client and @node-saml/node-saml are OPTIONAL dependencies.
 * The app starts and runs normally without them; SSO endpoints return a
 * clear error message instead of crashing.
 *
 * API_URL is also optional at startup. A warning is logged when it is missing,
 * and any SSO start/callback request that needs it will return a descriptive
 * error rather than throwing.
 *
 * Required env vars (only when SSO is actually used):
 *   API_URL      — public backend URL  e.g. https://api.promptsense.io
 *   FRONTEND_URL — public frontend URL e.g. https://app.promptsense.io
 */

const crypto = require('crypto');
const { query } = require('../db/pool');
const { encrypt, decrypt } = require('../utils/encryption');
const { generateTokens, storeRefreshToken } = require('./auth.controller');
const logger = require('../utils/logger');

// ── Optional deps — NEVER throw at module load time ───────────────────────────
let Issuer = null;
let generators = null;
try {
  const oidcPkg = require('openid-client');
  Issuer     = oidcPkg.Issuer     || null;
  generators = oidcPkg.generators || null;
  if (Issuer) logger.info('[SSO] openid-client loaded — OIDC SSO available');
} catch (_) {
  logger.warn('[SSO] openid-client not installed — OIDC SSO unavailable. Run: npm install openid-client@5');
}

let NodeSaml = null;
try {
  const samlPkg = require('@node-saml/node-saml');
  NodeSaml = samlPkg.SAML || null;
  if (NodeSaml) logger.info('[SSO] @node-saml/node-saml loaded — SAML SSO available');
} catch (_) {
  logger.warn('[SSO] @node-saml/node-saml not installed — SAML SSO unavailable. Run: npm install @node-saml/node-saml');
}

// ── URL helpers — safe even when env vars are absent ─────────────────────────
function getApiUrl() {
  const url = process.env.API_URL;
  if (!url || url.trim() === '') {
    // Warn once per process, not once per request
    if (!getApiUrl._warned) {
      logger.warn('[SSO] API_URL environment variable is not set. SSO redirect URIs will be incorrect in production. Set API_URL to your backend public URL (e.g. https://api.promptsense.io).');
      getApiUrl._warned = true;
    }
    return null;   // callers must handle null
  }
  return url.trim().replace(/\/$/, '');
}
getApiUrl._warned = false;

function getFrontendUrl() {
  const url = process.env.FRONTEND_URL;
  if (!url || url.trim() === '') return 'http://localhost:3000';
  return url.trim().replace(/\/$/, '');
}

// Safe URL builders — return null when API_URL is missing
function getOidcCallbackUrl() {
  const base = getApiUrl();
  return base ? `${base}/api/auth/sso/oidc/callback` : null;
}
function getSamlCallbackUrl() {
  const base = getApiUrl();
  return base ? `${base}/api/auth/sso/saml/callback` : null;
}

// ── In-memory state stores (cleared on restart — acceptable for stateless deploys) ──
// OIDC: state -> { nonce, orgSlug, expiresAt }
const oidcStateStore = new Map();
// OIDC client cache: orgId -> { client, expiresAt }
const oidcClientCache = new Map();

// Sweep expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of oidcStateStore) if (v.expiresAt < now) oidcStateStore.delete(k);
  for (const [k, v] of oidcClientCache) if (v.expiresAt < now) oidcClientCache.delete(k);
}, 5 * 60 * 1000).unref(); // .unref() so this timer doesn't prevent clean shutdown

// ── Error redirect helper ─────────────────────────────────────────────────────
function ssoError(res, message) {
  const dest = `${getFrontendUrl()}/auth/login?sso_error=${encodeURIComponent(message)}`;
  // Guard: avoid double-redirect if headers already sent
  if (!res.headersSent) res.redirect(dest);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/** Load SSO config row for an org slug. Returns null if missing or (when requireEnabled) disabled. */
async function loadSsoConfig(orgSlug, { requireEnabled = true } = {}) {
  try {
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
  } catch (err) {
    logger.error('[SSO] loadSsoConfig DB error', { error: err.message, orgSlug });
    return null;
  }
}

/** JIT-provision (create or find) a user from IdP claims, and ensure org membership. */
async function provisionUser(cfg, email, name, ssoSub) {
  if (!email) throw new Error('Identity provider did not return an email address');

  const providerKey = `${cfg.org_id}:${cfg.provider_type}`;
  let user;

  // 1. Look up by SSO subject (most stable across email changes)
  if (ssoSub) {
    const { rows: [bySub] } = await query(
      'SELECT * FROM users WHERE sso_provider=$1 AND sso_sub=$2',
      [providerKey, String(ssoSub)]
    );
    user = bySub || null;
  }

  // 2. Fall back to email match and link
  if (!user) {
    const { rows: [byEmail] } = await query(
      'SELECT * FROM users WHERE email=$1',
      [email.toLowerCase()]
    );
    if (byEmail) {
      user = byEmail;
      await query(
        'UPDATE users SET sso_provider=$1, sso_sub=$2 WHERE id=$3',
        [providerKey, String(ssoSub || email), user.id]
      ).catch(e => logger.warn('[SSO] could not link SSO sub to existing user', { error: e.message }));
    }
  }

  // 3. JIT-create new user (if provisioning is on)
  if (!user) {
    if (!cfg.auto_provision) {
      throw new Error('Your account does not exist in PromptSense. Contact your administrator to be invited.');
    }
    const { rows: [newUser] } = await query(
      `INSERT INTO users (email, full_name, email_verified, sso_provider, sso_sub)
       VALUES ($1,$2,true,$3,$4) RETURNING *`,
      [
        email.toLowerCase(),
        name || email.split('@')[0],
        providerKey,
        String(ssoSub || email),
      ]
    );
    user = newUser;
    logger.info('[SSO] JIT-provisioned new user', { userId: user.id, email, orgId: cfg.org_id });
  }

  // 4. Ensure the user has an active membership in this org
  const { rows: [existing] } = await query(
    'SELECT id FROM memberships WHERE org_id=$1 AND user_id=$2 AND active=true',
    [cfg.org_id, user.id]
  );
  if (!existing) {
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
    `SELECT m.role, o.id as org_id, o.name as org_name, o.slug,
            COALESCE(p.name,'starter') as plan_name
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

  const params = new URLSearchParams({
    at:       accessToken,
    rt:       refreshToken,
    orgId:    orgId || '',
    orgName:  org?.org_name  || '',
    orgSlug:  org?.slug      || '',
    role:     org?.role      || 'user',
    planName: org?.plan_name || 'starter',
  });

  if (!res.headersSent) {
    res.redirect(`${getFrontendUrl()}/auth/sso/callback?${params.toString()}`);
  }
}

// ── Public route handlers ─────────────────────────────────────────────────────

/**
 * GET /api/auth/sso/check?email=user@company.com
 * Called by the login page to auto-detect SSO for an email domain.
 * Never throws — returns { hasSso: false } on any error.
 */
async function checkEmail(req, res) {
  try {
    const { email } = req.query;
    if (!email || !email.includes('@')) return res.json({ hasSso: false });

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
  } catch (err) {
    logger.warn('[SSO] checkEmail error (non-fatal)', { error: err.message });
    res.json({ hasSso: false });
  }
}

/**
 * GET /api/auth/sso/start?org=acme
 * Initiates the SSO flow — redirects to the identity provider.
 */
async function start(req, res) {
  try {
    const { org } = req.query;
    if (!org) return res.status(400).json({ error: 'Missing org parameter' });

    // Check API_URL early so the user gets a clear message instead of an IdP mismatch error
    if (!getApiUrl()) {
      return res.status(503).json({
        error: 'SSO is not fully configured on this server. The API_URL environment variable is missing. Contact your administrator.',
      });
    }

    const cfg = await loadSsoConfig(org);
    if (!cfg) {
      return res.status(404).json({ error: 'SSO is not configured or not enabled for this organization.' });
    }

    if (cfg.provider_type === 'oidc') return startOidc(req, res, cfg);
    if (cfg.provider_type === 'saml') return startSaml(req, res, cfg);

    res.status(400).json({ error: `Unknown SSO provider type: ${cfg.provider_type}` });
  } catch (err) {
    logger.error('[SSO] start error', { error: err.message });
    ssoError(res, 'An unexpected error occurred while initiating SSO. Please try again.');
  }
}

// ── OIDC ───────────────────────────────────────────────────────────────────────

async function getOidcClient(cfg) {
  if (!Issuer || !generators) {
    throw new Error(
      'OIDC support requires the openid-client package. Run: npm install openid-client@5 in the backend directory.'
    );
  }

  if (!cfg.discovery_url) {
    throw new Error('OIDC Discovery URL is not configured. Go to Dashboard → SSO and add your provider\'s discovery URL.');
  }
  if (!cfg.client_id) {
    throw new Error('OIDC Client ID is not configured. Go to Dashboard → SSO and add your Client ID.');
  }

  const callbackUrl = getOidcCallbackUrl();
  if (!callbackUrl) {
    throw new Error('API_URL is not set on this server. Contact your administrator to configure the SSO callback URL.');
  }

  // Return cached client if still fresh (1 hour TTL)
  const cached = oidcClientCache.get(cfg.org_id);
  if (cached && cached.expiresAt > Date.now()) return cached.client;

  const clientSecret = decrypt(cfg.encrypted_client_secret);
  const issuer = await Issuer.discover(cfg.discovery_url);
  const client = new issuer.Client({
    client_id:    cfg.client_id,
    client_secret: clientSecret || undefined,
    redirect_uris: [callbackUrl],
    response_types: ['code'],
  });

  oidcClientCache.set(cfg.org_id, { client, expiresAt: Date.now() + 60 * 60 * 1000 });
  return client;
}

async function startOidc(req, res, cfg) {
  try {
    const client = await getOidcClient(cfg);  // throws with a friendly message if misconfigured

    const state = `${cfg.slug}.${generators.state()}`;
    const nonce = generators.nonce();
    oidcStateStore.set(state, {
      nonce,
      orgSlug: cfg.slug,
      expiresAt: Date.now() + 10 * 60 * 1000,  // 10-minute window
    });

    const url = client.authorizationUrl({ scope: 'openid email profile', state, nonce });
    res.redirect(url);
  } catch (err) {
    logger.error('[SSO OIDC] start error', { error: err.message, org: cfg.slug });
    ssoError(res, err.message);
  }
}

/**
 * GET /api/auth/sso/oidc/callback
 */
async function oidcCallback(req, res) {
  const state = req.query.state;

  // Validate state exists in our store
  const stored = state ? oidcStateStore.get(state) : null;
  if (!stored) {
    return ssoError(res, 'SSO session expired or invalid. Please start the sign-in process again.');
  }
  oidcStateStore.delete(state);

  try {
    const cfg = await loadSsoConfig(stored.orgSlug);
    if (!cfg) throw new Error('SSO configuration not found or has been disabled.');

    const callbackUrl = getOidcCallbackUrl();
    if (!callbackUrl) throw new Error('API_URL is not configured on this server.');

    const client = await getOidcClient(cfg);
    const params  = client.callbackParams(req);
    const tokenSet = await client.callback(callbackUrl, params, {
      state,
      nonce: stored.nonce,
    });

    const claims = tokenSet.claims();
    const email  = claims[cfg.attr_email] || claims.email;
    const name   = claims[cfg.attr_name]  || claims.name || claims.given_name;
    const sub    = claims.sub;

    const user = await provisionUser(cfg, email, name, sub);
    await completeLogin(res, user, cfg.org_id);
  } catch (err) {
    logger.error('[SSO OIDC] callback error', { error: err.message });
    ssoError(res, err.message);
  }
}

// ── SAML ───────────────────────────────────────────────────────────────────────

function buildSamlInstance(cfg) {
  if (!NodeSaml) {
    throw new Error(
      'SAML support requires the @node-saml/node-saml package. Run: npm install @node-saml/node-saml in the backend directory.'
    );
  }
  if (!cfg.idp_sso_url) {
    throw new Error('SAML IdP SSO URL is not configured. Go to Dashboard → SSO and add your IdP SSO URL.');
  }
  if (!cfg.idp_certificate) {
    throw new Error('SAML IdP certificate is not configured. Go to Dashboard → SSO and paste your IdP signing certificate.');
  }

  const callbackUrl = getSamlCallbackUrl();
  if (!callbackUrl) {
    throw new Error('API_URL is not set on this server. Contact your administrator to configure the SAML ACS URL.');
  }

  // Normalize cert — strip PEM headers/footers and whitespace, then let node-saml handle formatting
  const cert = (cfg.idp_certificate || '')
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  return new NodeSaml({
    callbackUrl,
    entryPoint:           cfg.idp_sso_url,
    issuer:               cfg.sp_entity_id || `promptsense-${cfg.slug}`,
    idpIssuer:            cfg.idp_entity_id || undefined,
    cert,
    wantAssertionsSigned: false,
    signatureAlgorithm:   'sha256',
  });
}

async function startSaml(req, res, cfg) {
  try {
    const saml = buildSamlInstance(cfg);
    const url  = await saml.getAuthorizeUrlAsync(cfg.slug, req.hostname, {});
    res.redirect(url);
  } catch (err) {
    logger.error('[SSO SAML] start error', { error: err.message, org: cfg.slug });
    ssoError(res, err.message);
  }
}

/**
 * POST /api/auth/sso/saml/callback — SAML Assertion Consumer Service (ACS)
 */
async function samlCallback(req, res) {
  const orgSlug = req.body?.RelayState;
  if (!orgSlug) {
    return ssoError(res, 'SAML response is missing RelayState. Please start the sign-in process again.');
  }

  try {
    const cfg = await loadSsoConfig(orgSlug);
    if (!cfg) throw new Error('SSO configuration not found or has been disabled for this organization.');

    const saml = buildSamlInstance(cfg);
    const { profile } = await saml.validatePostResponseAsync(req.body);

    const email = profile[cfg.attr_email] || profile.email || profile.nameID;
    const name  = profile[cfg.attr_name]  || profile.displayName || profile.cn;
    const sub   = profile.nameID || email;

    const user = await provisionUser(cfg, email, name, sub);
    await completeLogin(res, user, cfg.org_id);
  } catch (err) {
    logger.error('[SSO SAML] callback error', { error: err.message });
    ssoError(res, err.message);
  }
}

/**
 * GET /api/auth/sso/saml/metadata?org=acme
 * Returns SP metadata XML for pasting into your IdP configuration.
 */
async function samlMetadata(req, res) {
  try {
    const { org } = req.query;
    if (!org) return res.status(400).send('Missing org parameter');

    if (!NodeSaml) {
      return res.status(503).send('SAML support is not installed on this server.');
    }

    const cfg = await loadSsoConfig(org, { requireEnabled: false });
    if (!cfg || cfg.provider_type !== 'saml') {
      return res.status(404).send('SAML SSO is not configured for this organization.');
    }

    // Metadata can be generated even without a full cert (useful for initial setup)
    const saml = buildSamlInstance(cfg);
    const xml  = saml.generateServiceProviderMetadata(null, null);
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    logger.error('[SSO SAML] metadata error', { error: err.message });
    res.status(500).send(`Error generating SP metadata: ${err.message}`);
  }
}

// ── Org-scoped SSO config CRUD (called from config.routes.js) ─────────────────

async function getSsoConfig(req, res) {
  try {
    const { rows: [cfg] } = await query(
      `SELECT id, provider_type, enabled, email_domain,
              discovery_url, client_id,
              idp_sso_url, idp_entity_id, idp_certificate, sp_entity_id,
              attr_email, attr_name, auto_provision, default_role,
              (encrypted_client_secret IS NOT NULL) as has_client_secret
       FROM sso_configs WHERE org_id=$1`,
      [req.orgId]
    );
    res.json(cfg || null);
  } catch (err) {
    logger.error('[SSO] getSsoConfig error', { error: err.message });
    res.status(500).json({ error: 'Failed to load SSO configuration' });
  }
}

async function upsertSsoConfig(req, res) {
  try {
    const {
      providerType, enabled, emailDomain,
      discoveryUrl, clientId, clientSecret,
      idpSsoUrl, idpEntityId, idpCertificate, spEntityId,
      attrEmail, attrName, autoProvision, defaultRole,
    } = req.body;

    const { rows: [existing] } = await query(
      'SELECT id, encrypted_client_secret FROM sso_configs WHERE org_id=$1',
      [req.orgId]
    );

    // Re-encrypt only if a new secret was provided; keep old one otherwise
    const encSecret = clientSecret
      ? encrypt(clientSecret)
      : (existing?.encrypted_client_secret || null);

    const values = [
      providerType || 'oidc',
      enabled ?? false,
      emailDomain?.toLowerCase() || null,
      discoveryUrl || null,
      clientId || null,
      encSecret,
      idpSsoUrl || null,
      idpEntityId || null,
      idpCertificate || null,
      spEntityId || null,
      attrEmail || 'email',
      attrName  || 'name',
      autoProvision ?? true,
      defaultRole || 'user',
    ];

    let cfg;
    if (existing) {
      const { rows: [updated] } = await query(
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
        [...values, req.orgId]
      );
      cfg = updated;
      // Bust cached OIDC client so new credentials take effect immediately
      oidcClientCache.delete(req.orgId);
    } else {
      const { rows: [inserted] } = await query(
        `INSERT INTO sso_configs
           (org_id, provider_type, enabled, email_domain,
            discovery_url, client_id, encrypted_client_secret,
            idp_sso_url, idp_entity_id, idp_certificate, sp_entity_id,
            attr_email, attr_name, auto_provision, default_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id, provider_type, enabled, email_domain, discovery_url, client_id,
                   idp_sso_url, idp_entity_id, idp_certificate, sp_entity_id,
                   attr_email, attr_name, auto_provision, default_role`,
        [req.orgId, ...values]
      );
      cfg = inserted;
    }

    res.json(cfg);
  } catch (err) {
    logger.error('[SSO] upsertSsoConfig error', { error: err.message });
    res.status(500).json({ error: 'Failed to save SSO configuration' });
  }
}

module.exports = {
  checkEmail,
  start,
  oidcCallback,
  samlCallback,
  samlMetadata,
  getSsoConfig,
  upsertSsoConfig,
};
