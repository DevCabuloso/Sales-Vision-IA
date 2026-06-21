-- ════════════════════════════════════════════════
-- SDR IA Enterprise — Schema PostgreSQL (completo)
-- Multi-tenant: cada CLIENTE da plataforma é um "tenant".
-- O DONO da plataforma (role=owner) enxerga e gerencia todos.
-- ════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── TENANTS (os clientes da plataforma) ───
CREATE TABLE IF NOT EXISTS tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',  -- active | suspended | trial
  plan          TEXT NOT NULL DEFAULT 'trial',   -- trial | starter | pro | enterprise
  feat_meta_api      BOOLEAN NOT NULL DEFAULT false,
  feat_evolution_api BOOLEAN NOT NULL DEFAULT false,
  feat_hybrid        BOOLEAN NOT NULL DEFAULT false,
  feat_google_cal    BOOLEAN NOT NULL DEFAULT true,
  feat_broadcast     BOOLEAN NOT NULL DEFAULT true,
  max_leads          INTEGER NOT NULL DEFAULT 1000,
  notes              TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── USERS ───
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL para owner
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'agent', -- owner | admin | agent
  active        BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- ─── INTEGRATIONS (credenciais por tenant, criptografadas) ───
-- provider: 'google_calendar' | 'meta_whatsapp' | 'evolution'
CREATE TABLE IF NOT EXISTS integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'disconnected', -- connected | disconnected | error
  credentials   TEXT,   -- AES-256-GCM
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);

-- ─── LEADS ───
CREATE TABLE IF NOT EXISTS leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT,
  phone         TEXT NOT NULL,
  stage         TEXT NOT NULL DEFAULT 'Novo Lead',
  score         INTEGER NOT NULL DEFAULT 0,
  intention     TEXT,
  interests     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);

-- ─── MESSAGES (histórico de conversa por lead, para a IA) ───
CREATE TABLE IF NOT EXISTS messages (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,  -- lead | ai | agent
  text          TEXT NOT NULL,
  provider      TEXT,           -- meta_whatsapp | evolution
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(lead_id, created_at);

-- ─── APPOINTMENTS ───
CREATE TABLE IF NOT EXISTS appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  lead_name       TEXT,
  title           TEXT NOT NULL,
  provider        TEXT NOT NULL DEFAULT 'google',
  external_id     TEXT,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  meeting_link    TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled', -- scheduled|confirmed|completed|cancelled
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appts_tenant ON appointments(tenant_id);

-- ─── USAGE EVENTS ───
CREATE TABLE IF NOT EXISTS usage_events (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_date ON usage_events(tenant_id, created_at);

-- ════════════════════════════════════════════════
-- REALTIME — habilita atualização ao vivo no frontend.
-- Adiciona as tabelas à publicação que o Supabase escuta.
-- ════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE usage_events;

-- Para o Realtime entregar a linha completa em updates/deletes:
ALTER TABLE leads REPLICA IDENTITY FULL;
ALTER TABLE appointments REPLICA IDENTITY FULL;
ALTER TABLE usage_events REPLICA IDENTITY FULL;
