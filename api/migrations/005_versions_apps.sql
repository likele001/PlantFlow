-- Workflow version history + published chat apps

CREATE TABLE IF NOT EXISTS workflow_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version       INT NOT NULL,
  definition    JSONB NOT NULL,
  note          TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version)
);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_wf ON workflow_versions(workflow_id, version DESC);

CREATE TABLE IF NOT EXISTS chat_apps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  api_key       TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_apps_tenant ON chat_apps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_apps_key ON chat_apps(api_key) WHERE status = 'published';
