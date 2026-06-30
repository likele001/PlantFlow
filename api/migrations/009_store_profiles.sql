-- 门店信息配置表
CREATE TABLE IF NOT EXISTS store_profiles (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  industry TEXT NOT NULL DEFAULT 'catering', -- catering, medical_beauty, hair_salon, fitness, etc.
  name TEXT NOT NULL DEFAULT '',
  slogan TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  landmark TEXT NOT NULL DEFAULT '',
  parking TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  wechat TEXT NOT NULL DEFAULT '',
  hours_lunch TEXT NOT NULL DEFAULT '',
  hours_dinner TEXT NOT NULL DEFAULT '',
  hours_weekend TEXT NOT NULL DEFAULT '',
  holiday_note TEXT NOT NULL DEFAULT '',
  avg_price TEXT NOT NULL DEFAULT '',
  current_promotions JSONB NOT NULL DEFAULT '[]',
  features JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
