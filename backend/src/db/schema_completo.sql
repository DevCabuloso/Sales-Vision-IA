-- ════════════════════════════════════════════════════════════════
-- SDR IA Enterprise — Schema PostgreSQL COMPLETO (v2)
-- Multi-tenant SaaS: cada cliente da plataforma é um "tenant".
-- O dono da plataforma (role=owner) enxerga e gerencia todos.
--
-- Execute este arquivo inteiro no Supabase SQL Editor.
-- Seguro para rodar em banco existente: usa IF NOT EXISTS em tudo.
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════════════
-- TABELAS BASE
-- ════════════════════════════════════════════════════════════════

-- ─── TENANTS (clientes da plataforma) ───────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  slug               TEXT        UNIQUE NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'active',   -- active | suspended | trial
  plan               TEXT        NOT NULL DEFAULT 'trial',    -- trial | starter | pro | enterprise
  feat_meta_api      BOOLEAN     NOT NULL DEFAULT false,
  feat_evolution_api BOOLEAN     NOT NULL DEFAULT false,
  feat_hybrid        BOOLEAN     NOT NULL DEFAULT false,
  feat_google_cal    BOOLEAN     NOT NULL DEFAULT true,
  feat_broadcast     BOOLEAN     NOT NULL DEFAULT true,
  max_leads          INTEGER     NOT NULL DEFAULT 1000,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── USERS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL para owner
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  name          TEXT,
  role          TEXT        NOT NULL DEFAULT 'agent',  -- owner | admin | agent
  active        BOOLEAN     NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- ─── INTEGRATIONS (credenciais por tenant, criptografadas) ──────
-- provider: 'google_calendar' | 'meta_whatsapp' | 'evolution'
CREATE TABLE IF NOT EXISTS integrations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider     TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'disconnected',  -- connected | disconnected | error
  credentials  TEXT,       -- AES-256-GCM encrypted JSON
  meta         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);

-- ─── LEADS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT,
  phone          TEXT        NOT NULL,
  stage          TEXT        NOT NULL DEFAULT 'Novo Lead',
  score          INTEGER     NOT NULL DEFAULT 0,
  intention      TEXT,
  interests      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  human_takeover BOOLEAN     NOT NULL DEFAULT false,  -- true = IA desativada, atendimento humano
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);

-- ─── MESSAGES (histórico de conversa por lead) ──────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                 BIGSERIAL   PRIMARY KEY,
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id            UUID        NOT NULL REFERENCES leads(id)   ON DELETE CASCADE,
  role               TEXT        NOT NULL,   -- lead | ai | agent
  text               TEXT        NOT NULL,
  provider           TEXT,                  -- meta_whatsapp | evolution
  is_human_takeover  BOOLEAN     NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(lead_id, created_at);

-- ─── APPOINTMENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id      UUID        REFERENCES leads(id) ON DELETE SET NULL,
  lead_name    TEXT,
  title        TEXT        NOT NULL,
  provider     TEXT        NOT NULL DEFAULT 'google',
  external_id  TEXT,
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  meeting_link TEXT,
  status       TEXT        NOT NULL DEFAULT 'scheduled',  -- scheduled | confirmed | completed | cancelled
  assignee_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appts_tenant ON appointments(tenant_id);

-- ─── USAGE EVENTS (log de uso para analytics) ───────────────────
CREATE TABLE IF NOT EXISTS usage_events (
  id         BIGSERIAL   PRIMARY KEY,
  tenant_id  UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES users(id)   ON DELETE SET NULL,
  event_type TEXT        NOT NULL,
  meta       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_date ON usage_events(tenant_id, created_at);

-- ════════════════════════════════════════════════════════════════
-- TABELAS V2 (novos módulos)
-- ════════════════════════════════════════════════════════════════

-- ─── AI CONFIGS (configuração de IA por tenant) ─────────────────
CREATE TABLE IF NOT EXISTS ai_configs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT         NOT NULL DEFAULT 'SDR IA',
  model         TEXT         NOT NULL DEFAULT 'gpt-4o-mini',
  system_prompt TEXT,
  main_prompt   TEXT,
  temperature   NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  max_tokens    INTEGER      NOT NULL DEFAULT 1000,
  active        BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- ─── TEMPLATES (mensagens prontas) ──────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  category   TEXT        NOT NULL DEFAULT 'geral',
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id);

-- ─── LEAD STAGE HISTORY (histórico do Kanban) ───────────────────
CREATE TABLE IF NOT EXISTS lead_stage_history (
  id         BIGSERIAL   PRIMARY KEY,
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id    UUID        NOT NULL REFERENCES leads(id)   ON DELETE CASCADE,
  from_stage TEXT,
  to_stage   TEXT        NOT NULL,
  changed_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  notes      TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_history_lead ON lead_stage_history(lead_id, changed_at);

-- ─── CUSTOM APIS (provedores externos de IA) ────────────────────
-- provider: 'openai' | 'claude' | 'gemini' | 'deepseek' | 'custom'
CREATE TABLE IF NOT EXISTS custom_apis (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  base_url   TEXT        NOT NULL,
  api_key    TEXT,       -- AES-256-GCM encrypted
  model      TEXT,
  headers    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  provider   TEXT        NOT NULL DEFAULT 'custom',
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_apis_tenant ON custom_apis(tenant_id);

-- ─── BROADCAST CAMPAIGNS (campanhas de disparo em massa) ────────
-- status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled'
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'draft',
  content         TEXT        NOT NULL,
  template_id     UUID        REFERENCES templates(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ,
  sent_count      INTEGER     NOT NULL DEFAULT 0,
  delivered_count INTEGER     NOT NULL DEFAULT 0,
  read_count      INTEGER     NOT NULL DEFAULT 0,
  replied_count   INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broadcast_tenant ON broadcast_campaigns(tenant_id);

-- ─── BROADCAST CONTACTS (contatos de cada campanha) ─────────────
-- status: 'pending' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed'
CREATE TABLE IF NOT EXISTS broadcast_contacts (
  id          BIGSERIAL   PRIMARY KEY,
  campaign_id UUID        NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id)             ON DELETE CASCADE,
  name        TEXT,
  phone       TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending',
  sent_at     TIMESTAMPTZ,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_campaign ON broadcast_contacts(campaign_id);

-- ════════════════════════════════════════════════════════════════
-- REALTIME (Supabase Realtime — atualizações ao vivo no frontend)
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- adiciona cada tabela ao Realtime ignorando se já estiver publicada
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE leads;        EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE appointments; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE usage_events; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE messages;     EXCEPTION WHEN others THEN NULL; END;
END
$$;

ALTER TABLE leads        REPLICA IDENTITY FULL;
ALTER TABLE appointments REPLICA IDENTITY FULL;
ALTER TABLE usage_events REPLICA IDENTITY FULL;
ALTER TABLE messages     REPLICA IDENTITY FULL;

-- ════════════════════════════════════════════════════════════════
-- FUNÇÕES RPC (chamadas pelo painel do dono)
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS admin_overview();

CREATE FUNCTION admin_overview()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total_clients',   (SELECT COUNT(*)                FROM tenants),
    'active_clients',  (SELECT COUNT(*) FROM tenants   WHERE status = 'active'),
    'trial_clients',   (SELECT COUNT(*) FROM tenants   WHERE status = 'trial'),
    'suspended_clients',(SELECT COUNT(*) FROM tenants  WHERE status = 'suspended'),
    'total_users',     (SELECT COUNT(*) FROM users      WHERE role <> 'owner'),
    'total_leads',     (SELECT COUNT(*) FROM leads),
    'total_messages',  (SELECT COUNT(*) FROM messages),
    'total_appointments',(SELECT COUNT(*) FROM appointments),
    'events_24h',      (SELECT COUNT(*) FROM usage_events WHERE created_at >= now() - interval '24h'),
    'messages_24h',    (SELECT COUNT(*) FROM messages     WHERE created_at >= now() - interval '24h')
  );
$$;

DROP FUNCTION IF EXISTS admin_clients_overview();

CREATE FUNCTION admin_clients_overview()
RETURNS TABLE (
  id             UUID,
  name           TEXT,
  slug           TEXT,
  status         TEXT,
  plan           TEXT,
  max_leads      INTEGER,
  created_at     TIMESTAMPTZ,
  users_count    BIGINT,
  leads_count    BIGINT,
  messages_count BIGINT,
  appts_count    BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.status,
    t.plan,
    t.max_leads,
    t.created_at,
    (SELECT COUNT(*) FROM users         u WHERE u.tenant_id = t.id)::BIGINT,
    (SELECT COUNT(*) FROM leads         l WHERE l.tenant_id = t.id)::BIGINT,
    (SELECT COUNT(*) FROM messages      m WHERE m.tenant_id = t.id)::BIGINT,
    (SELECT COUNT(*) FROM appointments  a WHERE a.tenant_id = t.id)::BIGINT
  FROM tenants t
  ORDER BY t.created_at DESC;
$$;
