-- 012_embedding_provider.sql
-- Allow separate provider for embeddings vs chat

ALTER TABLE llm_providers ADD COLUMN IF NOT EXISTS is_default_embedding BOOLEAN DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_providers_default_embedding
  ON llm_providers (tenant_id) WHERE is_default_embedding = true;
