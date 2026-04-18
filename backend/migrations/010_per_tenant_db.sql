-- Migration 010: Per-tenant database isolation
-- Adds tenant_db_url to organizations so each org can have its own isolated database.
-- Run against the PLATFORM database (DATABASE_URL).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS tenant_db_url TEXT;

-- Index for fast lookups during provisioning checks
CREATE INDEX IF NOT EXISTS idx_orgs_tenant_db_url
  ON organizations(id) WHERE tenant_db_url IS NOT NULL;

COMMENT ON COLUMN organizations.tenant_db_url IS
  'Connection string for this org''s dedicated tenant database. NULL = not yet provisioned.';
