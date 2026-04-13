-- PromptSense Migration 007: SSO (Single Sign-On)
-- Supports OIDC (Okta, Azure AD, Google Workspace, Auth0) and SAML 2.0

CREATE TABLE IF NOT EXISTS sso_configs (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_type           TEXT        NOT NULL CHECK (provider_type IN ('saml', 'oidc')),
  enabled                 BOOLEAN     NOT NULL DEFAULT false,
  email_domain            TEXT,                        -- e.g. "acme.com" — for auto-SSO redirect on login

  -- OIDC fields (Okta, Azure AD, Google Workspace, Auth0, etc.)
  discovery_url           TEXT,                        -- e.g. https://your-domain.okta.com/oauth2/default
  client_id               TEXT,
  encrypted_client_secret TEXT,

  -- SAML 2.0 fields
  idp_sso_url             TEXT,                        -- IdP Single Sign-On URL
  idp_entity_id           TEXT,                        -- IdP Entity ID / Issuer
  idp_certificate         TEXT,                        -- IdP signing certificate (PEM)
  sp_entity_id            TEXT,                        -- SP Entity ID (set by admin or auto)

  -- Attribute mapping (dot-path into IdP claims/attributes)
  attr_email              TEXT        NOT NULL DEFAULT 'email',
  attr_name               TEXT        NOT NULL DEFAULT 'name',

  -- JIT (Just-In-Time) provisioning
  auto_provision          BOOLEAN     NOT NULL DEFAULT true,  -- create user on first SSO login
  default_role            TEXT        NOT NULL DEFAULT 'user', -- role assigned to JIT-provisioned users

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id)
);

-- Allow linking existing users to their IdP subjects
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sso_provider TEXT,
  ADD COLUMN IF NOT EXISTS sso_sub      TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sso_sub
  ON users(sso_provider, sso_sub)
  WHERE sso_provider IS NOT NULL AND sso_sub IS NOT NULL;
