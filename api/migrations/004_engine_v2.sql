-- Engine v2: async queue, webhook/cron triggers, vector embeddings

CREATE TABLE IF NOT EXISTS execution_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  trigger_type  TEXT NOT NULL,
  trigger_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','done','failed')),
  execution_id  UUID REFERENCES executions(id) ON DELETE SET NULL,
  error         TEXT,
  user_id       UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_execution_jobs_pending
  ON execution_jobs(created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS workflow_triggers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_id       TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('webhook','cron')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workflow_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_webhook
  ON workflow_triggers(tenant_id, type) WHERE type = 'webhook' AND enabled = true;

-- pgvector optional; embedding_json fallback when extension unavailable
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available, using JSON embeddings';
END $$;

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_json JSONB;

DO $$ BEGIN
  ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(1536);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
