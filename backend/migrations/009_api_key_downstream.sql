-- Link each API key to a specific downstream system.
-- NULL = key is not bound to any downstream (uses org-level fallback).
ALTER TABLE api_keys
  ADD COLUMN downstream_system_id UUID REFERENCES downstream_systems(id) ON DELETE SET NULL;

CREATE INDEX idx_api_keys_downstream ON api_keys(downstream_system_id);
