-- Chat app session history + conversation status

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','pending','resolved'));

CREATE TABLE IF NOT EXISTS chat_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id        UUID NOT NULL REFERENCES chat_apps(id) ON DELETE CASCADE,
  external_user TEXT,
  title         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_app ON chat_sessions(app_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content       TEXT NOT NULL,
  execution_id  UUID REFERENCES executions(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
