-- Migration 005: Full multi-tenancy support
-- Adds tenant lifecycle, suspension, branding, and isolation controls

-- ── Tenant status & lifecycle ──────────────────────────────────────────────────
-- tenant_status drives access control at the org level:
--   active    → normal operation
--   suspended → all API access blocked (402 error); admin can unsuspend
--   trial     → legacy: use subscription_status + trial_ends_at instead

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS tenant_status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (tenant_status IN ('active', 'suspended', 'trial')),
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id);

-- Index for fast tenant status lookups
CREATE INDEX IF NOT EXISTS idx_orgs_tenant_status ON organizations(tenant_status);

-- ── Tenant branding ────────────────────────────────────────────────────────────
-- Org admins can white-label the dashboard with their own colors and logo
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#7F77DD',
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(253);

-- Custom domains must be unique across all tenants
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_custom_domain
  ON organizations(custom_domain) WHERE custom_domain IS NOT NULL AND deleted_at IS NULL;

-- ── Tenant configuration ───────────────────────────────────────────────────────
-- Org-level timezone and locale for audit logs and scheduling
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS locale VARCHAR(10) NOT NULL DEFAULT 'en-US';

-- ── Tenant isolation: soft-delete users ───────────────────────────────────────
-- Allow soft-delete on users so we can deactivate without losing audit history
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_active ON users(id) WHERE deleted_at IS NULL;

-- ── Audit trail: tenant events ────────────────────────────────────────────────
-- Track tenant lifecycle events for compliance
CREATE TABLE IF NOT EXISTS tenant_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type  VARCHAR(50) NOT NULL,   -- 'created'|'suspended'|'activated'|'plan_changed'|'deleted'
  actor_id    UUID REFERENCES users(id),
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_events_org ON tenant_events(org_id, created_at DESC);

-- ── Back-fill: mark existing orgs as active ───────────────────────────────────
UPDATE organizations SET tenant_status = 'active' WHERE tenant_status IS NULL;
