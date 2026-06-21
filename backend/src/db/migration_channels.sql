-- Tabela de canais WhatsApp (Evolution API)
CREATE TABLE IF NOT EXISTS channels (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  instance_name TEXT        UNIQUE,
  status        TEXT        NOT NULL DEFAULT 'disconnected',
  phone         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels(tenant_id);
