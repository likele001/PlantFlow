-- 淘宝渠道配置表
CREATE TABLE IF NOT EXISTS taobao_channel_configs (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  app_key TEXT NOT NULL,
  app_secret TEXT NOT NULL,
  session TEXT NOT NULL DEFAULT '',
  seller_nick TEXT NOT NULL DEFAULT '',
  tmc_group TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 确保 channel_configs 表存在（兼容旧表）
CREATE TABLE IF NOT EXISTS channel_configs (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  wecom JSONB,
  feishu JSONB,
  taobao JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
