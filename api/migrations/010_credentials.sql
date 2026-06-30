-- 010_credentials.sql
-- Unified credential / secret management with encryption-at-rest

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('api_key', 'oauth2', 'basic_auth', 'bearer_token', 'custom')),
  data JSONB NOT NULL DEFAULT '{}',
  masked_preview VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credentials_tenant ON credentials(tenant_id);

CREATE TABLE IF NOT EXISTS credential_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID REFERENCES credentials(id) ON DELETE CASCADE,
  state VARCHAR(128) NOT NULL UNIQUE,
  redirect_uri VARCHAR(1024),
  extra JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add credential_id to connectors table
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS credential_id UUID REFERENCES credentials(id) ON DELETE SET NULL;
