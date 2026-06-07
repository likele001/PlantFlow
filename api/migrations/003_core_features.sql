-- Workflow definitions, executions, knowledge base, connectors, audit logs

ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS definition JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb;

CREATE TABLE IF NOT EXISTS executions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('running','success','failed','cancelled')),
  trigger_type  TEXT NOT NULL,
  trigger_data  JSONB,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_executions_tenant ON executions(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions(workflow_id, started_at DESC);

CREATE TABLE IF NOT EXISTS execution_steps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id  UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  node_id       TEXT NOT NULL,
  node_type     TEXT NOT NULL,
  node_label    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('running','success','failed','skipped')),
  input         JSONB,
  output        JSONB,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_execution_steps_exec ON execution_steps(execution_id, started_at);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_tenant ON knowledge_bases(tenant_id);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kbase_id      UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  source_type   TEXT NOT NULL DEFAULT 'text',
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_kbase ON knowledge_documents(kbase_id);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  kbase_id      UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idx           INT NOT NULL,
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_kbase ON knowledge_chunks(kbase_id);

CREATE TABLE IF NOT EXISTS connectors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('http','database','wecom','feishu','custom')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connectors_tenant ON connectors(tenant_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
