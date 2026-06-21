-- ═══════════════════════════════════════════════════════
-- SDR IA Enterprise — Migration v2
-- Módulos: IA Config, Templates, Kanban, Custom APIs,
--           Broadcast, Chat (human takeover)
-- Execute no Supabase SQL Editor ou via psql.
-- ═══════════════════════════════════════════════════════

-- ─── AI CONFIGS (configuração da IA por tenant) ───
CREATE TABLE IF NOT EXISTS ai_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'SDR IA',
  model         TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  system_prompt TEXT,
  main_prompt   TEXT,
  temperature   NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  max_tokens    INTEGER NOT NULL DEFAULT 1000,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- ─── TEMPLATES ───
CREATE TABLE IF NOT EXISTS templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'geral',
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id);

-- ─── LEAD STAGE HISTORY (histórico do Kanban) ───
CREATE TABLE IF NOT EXISTS lead_stage_history (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage  TEXT,
  to_stage    TEXT NOT NULL,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  notes       TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_history_lead ON lead_stage_history(lead_id, changed_at);

-- ─── CUSTOM APIS (provedores externos de IA) ───
CREATE TABLE IF NOT EXISTS custom_apis (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  base_url   TEXT NOT NULL,
  api_key    TEXT,
  model      TEXT,
  headers    JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider   TEXT NOT NULL DEFAULT 'custom',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_apis_tenant ON custom_apis(tenant_id);

-- ─── BROADCAST CAMPAIGNS ───
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  content         TEXT NOT NULL,
  template_id     UUID REFERENCES templates(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count      INTEGER NOT NULL DEFAULT 0,
  replied_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broadcast_tenant ON broadcast_campaigns(tenant_id);

-- ─── BROADCAST CONTACTS ───
CREATE TABLE IF NOT EXISTS broadcast_contacts (
  id           BIGSERIAL PRIMARY KEY,
  campaign_id  UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT,
  phone        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  sent_at      TIMESTAMPTZ,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_campaign ON broadcast_contacts(campaign_id);

-- ─── ALTER APPOINTMENTS ───
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── ALTER MESSAGES: suporte a transferência para humano ───
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_human_takeover BOOLEAN NOT NULL DEFAULT false;

-- ─── ALTER LEADS: flag de atendimento humano ───
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN NOT NULL DEFAULT false;

-- ─── REALTIME para messages ───
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER TABLE messages REPLICA IDENTITY FULL;
