-- ────────────────────────────────────────────────────────────────────────────
-- 008_security_hardening.sql
-- Run in Neon SQL editor.
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. Account lockout columns on users ──────────────────────────────────────
-- login_attempts: incremented on each failed password check, reset on success
-- locked_until:   set to NOW() + 15 min after 10 consecutive failures
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until   TIMESTAMPTZ;

-- ── 2. SSO state persistence ─────────────────────────────────────────────────
-- Replaces the in-memory Map in sso.controller.js so OIDC flows survive
-- multi-instance (Render scaling) and process restarts.
CREATE TABLE IF NOT EXISTS sso_states (
  state      TEXT        PRIMARY KEY,
  org_slug   TEXT        NOT NULL,
  nonce      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup index — used by the periodic purge query
CREATE INDEX IF NOT EXISTS idx_sso_states_created ON sso_states (created_at);

-- ── 3. Token revocation table ─────────────────────────────────────────────────
-- Stores JTI (JWT ID) of explicitly revoked access tokens.
-- Only populated on logout and on org-membership removal — not on every token.
-- Rows auto-expire (expires_at = token's exp) so the table stays small.
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti        TEXT        PRIMARY KEY,
  user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens (expires_at);

-- Convenience: delete rows whose token would have expired anyway
-- (Run periodically — see proxy.controller.js or a cron job)
-- DELETE FROM revoked_tokens WHERE expires_at < NOW();
