-- PlantFlow 业务助手核心表

-- 行业场景模板（系统预置 + 用户自定义）
CREATE TABLE IF NOT EXISTS bot_scenarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  industry      TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  icon          TEXT NOT NULL DEFAULT '📋',
  steps         JSONB NOT NULL DEFAULT '[]',
  workflow_id   UUID REFERENCES workflows(id),
  is_builtin    BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 租户机器人配置
CREATE TABLE IF NOT EXISTS bot_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT '智能助手',
  greeting      TEXT NOT NULL DEFAULT '您好，有什么可以帮您？',
  active_scenarios TEXT[] NOT NULL DEFAULT '{}',
  notify_admins TEXT[] NOT NULL DEFAULT '{}',
  auto_reply    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 机器人会话
CREATE TABLE IF NOT EXISTS bot_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('wecom','feishu')),
  external_id   TEXT NOT NULL,
  step          INTEGER NOT NULL DEFAULT 0,
  scenario_id   UUID REFERENCES bot_scenarios(id),
  params        JSONB NOT NULL DEFAULT '{}',
  state         TEXT NOT NULL DEFAULT 'idle',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, channel, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_scenarios_tenant ON bot_scenarios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bot_scenarios_industry ON bot_scenarios(industry);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_tenant ON bot_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_channel ON bot_sessions(channel, external_id);

CREATE TABLE IF NOT EXISTS bot_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES bot_sessions(id) ON DELETE CASCADE,
  direction     TEXT NOT NULL CHECK (direction IN ('in','out')),
  sender_id     TEXT NOT NULL,
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bot_messages_session ON bot_messages(session_id, created_at);
