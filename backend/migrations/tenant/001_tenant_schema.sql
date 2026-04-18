-- PromptSense Tenant Database Schema
-- Applied to each org's dedicated database on provisioning.
-- NOTE: org_id columns are kept as plain UUIDs for audit/debugging but have
--       NO foreign key constraints (the organizations table lives in the platform DB).
--       user_id columns are also plain UUIDs for the same reason.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── PROVIDER CONNECTIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_connections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL,                            -- platform DB reference (no FK)
  provider        VARCHAR(50) NOT NULL,
  label           VARCHAR(100),
  encrypted_key   TEXT,                                     -- AES-256-GCM encrypted API key
  endpoint_url    TEXT,
  model           VARCHAR(100),
  max_tokens      INTEGER DEFAULT 1000,
  system_prompt   TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, provider)
);

-- ─── GUARDRAILS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guardrails (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  type        VARCHAR(20) NOT NULL DEFAULT 'both',          -- input|output|both
  severity    VARCHAR(20) NOT NULL DEFAULT 'medium',        -- critical|high|medium|low
  action      VARCHAR(20) NOT NULL DEFAULT 'block',         -- block|warn|log
  pattern     TEXT,
  color       VARCHAR(20) DEFAULT '#7F77DD',
  countries   TEXT[] DEFAULT '{}',
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── POLICIES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  guardrail_ids   UUID[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID,                                     -- user_id (no FK — platform DB)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PROMPT TEMPLATES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL,
  created_by  UUID,                                         -- user_id (no FK — platform DB)
  name        VARCHAR(100) NOT NULL,
  category    VARCHAR(50),
  prompt      TEXT NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── DOWNSTREAM SYSTEMS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS downstream_systems (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                UUID NOT NULL,
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
CREATE TABLE IF NOT EXISTS webhooks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL,
  name             VARCHAR(100) NOT NULL,
  url              TEXT NOT NULL,
  secret           VARCHAR(255),
  events           TEXT[] NOT NULL DEFAULT '{}',
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  total_deliveries INTEGER NOT NULL DEFAULT 0,
  last_fired_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id  UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type  VARCHAR(50) NOT NULL,
  payload     JSONB NOT NULL,
  status_code INTEGER,
  success     BOOLEAN,
  attempt     INTEGER DEFAULT 1,
  error       TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUDIT LOG ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL,
  user_id      UUID,                                        -- no FK — platform DB
  session_id   UUID,
  provider     VARCHAR(50),
  model        VARCHAR(100),
  route        VARCHAR(50),
  input_text   TEXT,
  output_text  TEXT,
  input_flags  TEXT[] DEFAULT '{}',
  output_flags TEXT[] DEFAULT '{}',
  passed       BOOLEAN NOT NULL DEFAULT TRUE,
  latency_ms   INTEGER,
  tokens_used  INTEGER DEFAULT 0,
  cost_usd     NUMERIC(10,6) DEFAULT 0,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USAGE METERING ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_records (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL,
  period     DATE NOT NULL,
  requests   INTEGER NOT NULL DEFAULT 0,
  blocked    INTEGER NOT NULL DEFAULT 0,
  tokens     INTEGER NOT NULL DEFAULT 0,
  cost_usd   NUMERIC(10,4) DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, period)
);

-- ─── GAUNTLET ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gauntlet_runs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL,
  created_by   UUID,
  name         VARCHAR(200) NOT NULL,
  provider     VARCHAR(50) NOT NULL DEFAULT '',
  model        VARCHAR(100),
  categories   TEXT[] NOT NULL DEFAULT '{}',
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',      -- pending|running|completed|failed
  total_probes INTEGER NOT NULL DEFAULT 0,
  blocked      INTEGER NOT NULL DEFAULT 0,
  escaped      INTEGER NOT NULL DEFAULT 0,
  errored      INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gauntlet_results (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id       UUID NOT NULL REFERENCES gauntlet_runs(id) ON DELETE CASCADE,
  category     VARCHAR(100) NOT NULL,
  attack_name  VARCHAR(200) NOT NULL,
  severity     VARCHAR(20) NOT NULL DEFAULT 'medium',
  probe_prompt TEXT NOT NULL,
  response     TEXT,
  escaped      BOOLEAN NOT NULL DEFAULT FALSE,
  blocked      BOOLEAN NOT NULL DEFAULT FALSE,
  flags        TEXT[] DEFAULT '{}',
  latency_ms   INTEGER,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_org_created   ON audit_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org_passed    ON audit_events(org_id, passed);
CREATE INDEX IF NOT EXISTS idx_guardrails_org      ON guardrails(org_id);
CREATE INDEX IF NOT EXISTS idx_policies_org        ON policies(org_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_org        ON webhooks(org_id);
CREATE INDEX IF NOT EXISTS idx_usage_org_period    ON usage_records(org_id, period);
CREATE INDEX IF NOT EXISTS idx_gauntlet_runs_org     ON gauntlet_runs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gauntlet_results_run  ON gauntlet_results(run_id);
CREATE INDEX IF NOT EXISTS idx_provider_conns_org  ON provider_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_downstream_org      ON downstream_systems(org_id);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_updated  BEFORE UPDATE ON guardrails           FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_policy_updated BEFORE UPDATE ON policies             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tmpl_updated   BEFORE UPDATE ON prompt_templates     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_prov_updated   BEFORE UPDATE ON provider_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_down_updated   BEFORE UPDATE ON downstream_systems   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_wh_updated     BEFORE UPDATE ON webhooks             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
