-- ════════════════════════════════════════════════════════════════
-- Suporte interno: cliente abre um chamado (categoria + descrição) a
-- partir da Central de Ajuda; o dono vê os chamados agrupados por
-- empresa no painel admin, clica em "Iniciar suporte" e conversa com
-- o usuário dentro da própria plataforma (sem WhatsApp/e-mail).
--
-- support_tickets: um chamado por usuário/assunto.
-- support_messages: as mensagens trocadas dentro de um chamado —
-- sender_type distingue quem mandou ('user' = o cliente, 'owner' = o
-- dono da plataforma). sender_id sempre aponta pra users.id; quando é
-- o dono, esse usuário tem tenant_id NULL (ver users role='owner'),
-- o que a trigger de segurança abaixo já trata corretamente (só
-- valida o tenant quando a referência TEM tenant_id).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open', -- open | in_progress | closed
  started_by uuid,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ticket_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  sender_type text NOT NULL, -- 'user' | 'owner'
  sender_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets (tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages (ticket_id, created_at ASC);

-- Referência opcional pra notificação do sino levar direto ao chamado
-- (mesmo padrão de migration_notification_lead_ref.sql).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ticket_id uuid;

-- Rede de segurança contra tenant_id cruzado (ver migration_tenant_safety_triggers.sql).
DROP TRIGGER IF EXISTS trg_tenant_check_user_id ON support_tickets;
CREATE TRIGGER trg_tenant_check_user_id
  BEFORE INSERT OR UPDATE OF user_id, tenant_id ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('user_id', 'users', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_ticket_id ON support_messages;
CREATE TRIGGER trg_tenant_check_ticket_id
  BEFORE INSERT OR UPDATE OF ticket_id, tenant_id ON support_messages
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('ticket_id', 'support_tickets', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_sender_id ON support_messages;
CREATE TRIGGER trg_tenant_check_sender_id
  BEFORE INSERT OR UPDATE OF sender_id, tenant_id ON support_messages
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('sender_id', 'users', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_ticket_id ON notifications;
CREATE TRIGGER trg_tenant_check_ticket_id
  BEFORE INSERT OR UPDATE OF ticket_id, tenant_id ON notifications
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('ticket_id', 'support_tickets', 'id');

-- ─── RLS pro papel restrito app_rls (ver migration_rls.sql) — as rotas do
-- cliente (routes/support.js) usam withTenant(); as rotas do dono
-- (routes/admin-support.js) continuam no client service_role, cross-tenant. ───
GRANT SELECT, INSERT, UPDATE ON support_tickets TO app_rls;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON support_tickets;
CREATE POLICY tenant_isolation ON support_tickets FOR ALL TO app_rls
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT ON support_messages TO app_rls;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON support_messages;
CREATE POLICY tenant_isolation ON support_messages FOR ALL TO app_rls
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

INSERT INTO schema_migrations (filename) VALUES ('migration_support_tickets.sql')
ON CONFLICT DO NOTHING;
