-- ════════════════════════════════════════════════════════════════
-- Índices de performance para as consultas mais frequentes do dia a
-- dia (tela de chat, contatos, relatórios). O schema.sql do projeto
-- é gerado por introspecção do PostgREST e não lista índices não-PK,
-- então não dá pra saber por aqui se algum destes já existe — todos
-- usam IF NOT EXISTS, então rodar de novo não tem efeito colateral.
-- Execute no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- leads: toda listagem (chat, contatos, leads) filtra por tenant_id e
-- ordena por updated_at ou created_at.
CREATE INDEX IF NOT EXISTS idx_leads_tenant_updated_at
  ON leads(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_created_at
  ON leads(tenant_id, created_at DESC);

-- messages: montagem da última mensagem por lead (chat.js) e histórico
-- de uma conversa (chat.js, leads.js) filtram por tenant_id (+ lead_id)
-- e ordenam por created_at.
CREATE INDEX IF NOT EXISTS idx_messages_tenant_created_at
  ON messages(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_lead_created_at
  ON messages(lead_id, created_at DESC);

-- usage_events: relatório diário (reports.js) filtra por tenant_id e
-- por intervalo de created_at.
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_created_at
  ON usage_events(tenant_id, created_at DESC);

-- ticket_logs: relatório diário e histórico por lead (chat.js) filtram
-- por tenant_id (+ lead_id) e ordenam por created_at.
CREATE INDEX IF NOT EXISTS idx_ticket_logs_tenant_created_at
  ON ticket_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_logs_lead_id
  ON ticket_logs(lead_id);

INSERT INTO schema_migrations (filename) VALUES ('migration_perf_indexes.sql') ON CONFLICT (filename) DO NOTHING;
