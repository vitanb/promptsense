-- Migration 006: Add country-based guardrail filtering
-- Adds a `countries` text[] column to guardrails.
-- Empty array (default) means the guardrail applies globally (all countries).
-- A non-empty array restricts the guardrail to only those ISO 3166-1 alpha-2 country codes.

ALTER TABLE guardrails
  ADD COLUMN IF NOT EXISTS countries TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_guardrails_countries ON guardrails USING GIN (countries);

COMMENT ON COLUMN guardrails.countries IS
  'ISO 3166-1 alpha-2 country codes this guardrail applies to. Empty = all countries.';
