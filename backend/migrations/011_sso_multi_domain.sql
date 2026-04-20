-- Migration 011: Support multiple email domains per SSO config
-- Converts email_domain TEXT to email_domains TEXT[]

ALTER TABLE sso_configs
  ADD COLUMN IF NOT EXISTS email_domains TEXT[] NOT NULL DEFAULT '{}';

-- Migrate existing single domain into the array
UPDATE sso_configs
  SET email_domains = ARRAY[email_domain]
  WHERE email_domain IS NOT NULL AND email_domain != '';

-- Keep email_domain for now as a fallback (drop in a future migration)
