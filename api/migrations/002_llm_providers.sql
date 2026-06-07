-- AI model providers (OpenAI-compatible)
-- apiKey is stored as AES-256-GCM ciphertext; never logged or returned to the client.
-- A masked preview (e.g., "sk-...1234") is kept for display purposes only.

CREATE TABLE IF NOT EXISTS llm_providers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  base_url                 TEXT NOT NULL,
  api_key_iv               BYTEA NOT NULL,
  api_key_tag              BYTEA NOT NULL,
  api_key_ciphertext       BYTEA NOT NULL,
  api_key_masked           TEXT NOT NULL,
  default_chat_model       TEXT NOT NULL,
  default_embedding_model  TEXT,
  is_default               BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_llm_providers_tenant ON llm_providers(tenant_id);

-- Enforce: at most one default provider per tenant.
-- Implemented via a partial unique index; flipping is_default needs an UPDATE
-- in a single transaction (route handler does it).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_llm_providers_default_per_tenant
  ON llm_providers(tenant_id) WHERE is_default = true;
