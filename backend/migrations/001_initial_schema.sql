-- PromptSense SaaS Database Schema
-- Run: psql $DATABASE_URL -f migrations/001_initial_schema.sql

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── PLANS ────────────────────────────────────────────────────────────────────
CREATE TABLE plans (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(50) NOT NULL UNIQUE,        -- 'starter' | 'pro' | 'enterprise'
  display_name        VARCHAR(100) NOT NULL,
  stripe_price_id     VARCHAR(100),
  price_monthly       INTEGER NOT NULL DEFAULT 0,         -- cents
  price_yearly        INTEGER NOT NULL DEFAULT 0,         -- cents
  requests_per_month  INTEGER NOT NULL DEFAULT 1000,
  members_limit       INTEGER NOT NULL DEFAULT 3,
  guardrails_limit    INTEGER NOT NULL DEFAULT 5,
  webhooks_limit      INTEGER NOT NULL DEFAULT 1,
  features            JSONB NOT NULL DEFAULT '[]',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (name, display_name, stripe_price_id, price_monthly, price_yearly, requests_per_month, members_limit, guardrails_limit, webhooks_limit, features) VALUES
  ('starter',    'Starter',    NULL, 0,      0,       5000,    3,   10,  2,  '["5,000 requests/mo","3 team members","10 guardrails","Email support"]'),
  ('pro',        'Pro',        NULL, 4900,   49000,   50000,   15,  50,  10, '["50,000 requests/mo","15 team members","50 guardrails","Priority support","Analytics export","Custom policies"]'),
  ('enterprise', 'Enterprise', NULL, 19900,  199000,  -1,      -1,  -1,  -1, '["Unlimited requests","Unlimited members","Unlimited guardrails","SLA","SSO/SAML","Dedicated support","Custom contracts"]');

-- ─── ORGANIZATIONS ────────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(255) NOT NULL,
  slug                VARCHAR(100) NOT NULL UNIQUE,
  plan_id             UUID NOT NULL REFERENCES plans(id),
  stripe_customer_id  VARCHAR(100) UNIQUE,
  stripe_subscription_id VARCHAR(100) UNIQUE,
  subscription_status VARCHAR(50) DEFAULT 'trialing',    -- trialing|active|past_due|canceled
  trial_ends_at       TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
  billing_email       VARCHAR(255),
  logo_url            TEXT,
  settings            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email               VARCHAR(255) NOT NULL UNIQUE,
  password_hash       VARCHAR(255),
  full_name           VARCHAR(255),
  avatar_url          TEXT,
  email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  email_verify_token  VARCHAR(255),
  reset_token         VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  oauth_provider      VARCHAR(50),                       -- 'google' | 'github' | null
  oauth_id            VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── MEMBERSHIPS ──────────────────────────────────────────────────────────────
CREATE TABLE memberships (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(50) NOT NULL DEFAULT 'user',   -- user|developer|administrator
  invited_by      UUID REFERENCES users(id),
  invite_token    VARCHAR(255),
  invite_status   VARCHAR(50) DEFAULT 'accepted',        -- pending|accepted
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- ─── REFRESH TOKENS ───────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PROVIDER CONNECTIONS ─────────────────────────────────────────────────────
CREATE TABLE provider_connections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        VARCHAR(50) NOT NULL,                  -- anthropic|openai|azure|gemini|...
  label           VARCHAR(100),
  encrypted_key   TEXT,                                  -- AES-256-GCM encrypted API key
  endpoint_url    TEXT,
  model           VARCHAR(100),
  max_tokens      INTEGER DEFAULT 1000,
  system_prompt   TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, provider)
);

-- ─── GUARDRAILS ───────────────────────────────────────────────────────────────
CREATE TABLE guardrails (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  type        VARCHAR(20) NOT NULL DEFAULT 'both',       -- input|output|both
  severity    VARCHAR(20) NOT NULL DEFAULT 'medium',     -- critical|high|medium|low
  action      VARCHAR(20) NOT NULL DEFAULT 'block',      -- block|warn|log
  pattern     TEXT,                                      -- regex pattern
  color       VARCHAR(20) DEFAULT '#7F77DD',
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,            -- built-in vs custom
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── POLICIES ─────────────────────────────────────────────────────────────────
CREATE TABLE policies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  guardrail_ids   UUID[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PROMPT TEMPLATES ────────────────────────────────────────────────────────
CREATE TABLE prompt_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES users(id),
  name        VARCHAR(100) NOT NULL,
  category    VARCHAR(50),
  prompt      TEXT NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── DOWNSTREAM SYSTEMS ──────────────────────────────────────────────────────
CREATE TABLE downstream_systems (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  VARCHAR(100) NOT NULL DEFAULT 'Default',
  endpoint_url          TEXT NOT NULL,
  encrypted_api_key     TEXT,
  http_method           VARCHAR(10) DEFAULT 'POST',
  extra_headers         JSONB DEFAULT '{}',
  body_template         TEXT DEFAULT '{"prompt":"{{prompt}}"}',
  response_field        VARCHAR(200),
  timeout_ms            INTEGER DEFAULT 10000,
  fallback_to_provider  BOOLEAN DEFAULT TRUE,
  enabled               BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── WEBHOOKS ────────────────────────────────────────────────────────────────
CREATE TABLE webhooks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  url             TEXT NOT NULL,
  secret          VARCHAR(255),                          -- for HMAC signing
  events          TEXT[] NOT NULL DEFAULT '{}',          -- all|block|critical|warn
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  total_deliveries INTEGER NOT NULL DEFAULT 0,
  last_fired_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id      UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type      VARCHAR(50) NOT NULL,
  payload         JSONB NOT NULL,
  status_code     INTEGER,
  success         BOOLEAN,
  attempt         INTEGER DEFAULT 1,
  error           TEXT,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUDIT LOG ───────────────────────────────────────────────────────────────
CREATE TABLE audit_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),
  session_id      UUID,
  provider        VARCHAR(50),
  model           VARCHAR(100),
  route           VARCHAR(50),                           -- provider|downstream|blocked
  input_text      TEXT,
  output_text     TEXT,
  input_flags     TEXT[] DEFAULT '{}',
  output_flags    TEXT[] DEFAULT '{}',
  passed          BOOLEAN NOT NULL DEFAULT TRUE,
  latency_ms      INTEGER,
  tokens_used     INTEGER DEFAULT 0,
  cost_usd        NUMERIC(10,6) DEFAULT 0,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USAGE METERING ──────────────────────────────────────────────────────────
CREATE TABLE usage_records (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period      DATE NOT NULL,                             -- first day of billing period
  requests    INTEGER NOT NULL DEFAULT 0,
  blocked     INTEGER NOT NULL DEFAULT 0,
  tokens      INTEGER NOT NULL DEFAULT 0,
  cost_usd    NUMERIC(10,4) DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, period)
);

-- ─── API KEYS (for SDK proxy) ────────────────────────────────────────────────
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES users(id),
  name        VARCHAR(100) NOT NULL,
  key_hash    VARCHAR(255) NOT NULL UNIQUE,
  key_prefix  VARCHAR(20) NOT NULL,                      -- e.g. "ps_live_abc123"
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_memberships_org     ON memberships(org_id);
CREATE INDEX idx_memberships_user    ON memberships(user_id);
CREATE INDEX idx_audit_org_created   ON audit_events(org_id, created_at DESC);
CREATE INDEX idx_audit_org_passed    ON audit_events(org_id, passed);
CREATE INDEX idx_usage_org_period    ON usage_records(org_id, period);
CREATE INDEX idx_guardrails_org      ON guardrails(org_id);
CREATE INDEX idx_webhooks_org        ON webhooks(org_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id, revoked);
CREATE INDEX idx_api_keys_hash       ON api_keys(key_hash);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orgs_updated    BEFORE UPDATE ON organizations         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated   BEFORE UPDATE ON users                 FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_guard_updated   BEFORE UPDATE ON guardrails            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_policy_updated  BEFORE UPDATE ON policies              FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tmpl_updated    BEFORE UPDATE ON prompt_templates      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_prov_updated    BEFORE UPDATE ON provider_connections  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_down_updated    BEFORE UPDATE ON downstream_systems    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_wh_updated      BEFORE UPDATE ON webhooks              FOR EACH ROW EXECUTE FUNCTION update_updated_at();
