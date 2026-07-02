-- Índices críticos para performance em produção
-- Execute no SQL Editor do Supabase (Settings → SQL Editor)
-- CONCURRENTLY permite rodar sem bloquear leituras/escritas em tabelas com dados

-- messages: queries mais frequentes do sistema (histórico por lead, listagem por tenant)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_lead_created
  ON messages(lead_id, created_at ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_tenant_lead
  ON messages(tenant_id, lead_id);

-- leads: upsert por telefone, listagem por tenant+status, busca por nome/telefone
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_tenant_phone
  ON leads(tenant_id, phone);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_tenant_status_updated
  ON leads(tenant_id, conversation_status, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_tenant_updated
  ON leads(tenant_id, updated_at DESC);

-- integrations: lookup por tenant+provider (chamado em todo webhook)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_integrations_tenant_provider
  ON integrations(tenant_id, provider);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_integrations_provider_status
  ON integrations(provider, status);

-- channels: lookup por instance_name em todo webhook Evolution
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_channels_tenant_instance
  ON channels(tenant_id, instance_name);

-- users: lookup por e-mail no login e por id no middleware de auth
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
  ON users(email);

-- broadcast: listagem de contatos pendentes por campanha
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_broadcast_contacts_campaign_status
  ON broadcast_contacts(campaign_id, status);

-- appointments: listagem por tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_tenant_start
  ON appointments(tenant_id, start_time DESC);

-- usage_events: queries de dashboard e billing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_tenant_created
  ON usage_events(tenant_id, created_at DESC);
