-- Migration 002: Add department to memberships
-- Allows per-user department tagging for analytics breakdowns

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS department VARCHAR(100);

-- Index for analytics GROUP BY
CREATE INDEX IF NOT EXISTS idx_memberships_department ON memberships(org_id, department);
