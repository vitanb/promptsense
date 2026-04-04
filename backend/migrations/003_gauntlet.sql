-- Migration 003: Gauntlet — adversarial probe testing

CREATE TABLE gauntlet_runs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by     UUID REFERENCES users(id),
  name           VARCHAR(200) NOT NULL,
  provider       VARCHAR(50) NOT NULL,
  model          VARCHAR(100),
  categories     TEXT[] NOT NULL DEFAULT '{}',
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|running|completed|failed
  total_probes   INTEGER NOT NULL DEFAULT 0,
  blocked        INTEGER NOT NULL DEFAULT 0,  -- caught by guardrails (good)
  escaped        INTEGER NOT NULL DEFAULT 0,  -- slipped through (bad)
  errored        INTEGER NOT NULL DEFAULT 0,  -- provider errors
  error          TEXT,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gauntlet_results (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id         UUID NOT NULL REFERENCES gauntlet_runs(id) ON DELETE CASCADE,
  category       VARCHAR(100) NOT NULL,
  attack_name    VARCHAR(200) NOT NULL,
  severity       VARCHAR(20) NOT NULL DEFAULT 'medium',   -- critical|high|medium|low
  probe_prompt   TEXT NOT NULL,
  response       TEXT,
  escaped        BOOLEAN NOT NULL DEFAULT FALSE,
  blocked        BOOLEAN NOT NULL DEFAULT FALSE,
  flags          TEXT[] DEFAULT '{}',
  latency_ms     INTEGER,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gauntlet_runs_org ON gauntlet_runs(org_id, created_at DESC);
CREATE INDEX idx_gauntlet_results_run ON gauntlet_results(run_id);
