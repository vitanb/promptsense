-- Migration 004: Super user flag + org soft-delete
-- Run: psql $DATABASE_URL -f migrations/004_superuser.sql

-- Add superuser flag to platform-level admins
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN NOT NULL DEFAULT false;

-- Fast lookup for superuser checks
CREATE INDEX IF NOT EXISTS idx_users_superuser ON users(is_superuser) WHERE is_superuser = true;

-- Add soft-delete support to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Ensure all relevant queries filter out deleted orgs
CREATE INDEX IF NOT EXISTS idx_orgs_active ON organizations(id) WHERE deleted_at IS NULL;
