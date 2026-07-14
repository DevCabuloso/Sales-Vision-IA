-- Aviso de vencimento de mensalidade direcionado a um usuário específico do
-- tenant (admin ou atendente), disparado pelo scheduler.js num horário
-- configurável pelo dono. Antes disso não existia notificação persistida —
-- o sino (NotificationBell.vue) só calculava "leads sem resposta" on-the-fly,
-- sem tabela e sem conceito de destinatário. Esta tabela é genérica (campo
-- `type`) pra poder receber outros tipos de aviso no futuro sem migration nova.

CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications (user_id, tenant_id, created_at DESC);

-- Mesma rede de segurança de tenant_id cruzado usada nas outras tabelas
-- (ver migration_tenant_safety_triggers.sql) — garante que user_id sempre
-- pertence ao mesmo tenant_id da notificação.
DROP TRIGGER IF EXISTS trg_tenant_check_user_id ON notifications;
CREATE TRIGGER trg_tenant_check_user_id
  BEFORE INSERT OR UPDATE OF user_id, tenant_id ON notifications
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('user_id', 'users', 'id');

-- Quem recebe o aviso de vencimento daquele tenant (admin ou atendente,
-- escolhido pelo dono na tela de detalhe do cliente). NULL = ninguém
-- designado ainda, scheduler ignora esse tenant.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_notify_user_id uuid;

-- Config global (única linha, id fixo=1) de quantos dias antes do
-- vencimento e em que horário do dia o scheduler dispara o aviso.
CREATE TABLE IF NOT EXISTS platform_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  billing_reminder_days_before integer NOT NULL DEFAULT 3,
  billing_reminder_time text NOT NULL DEFAULT '09:00',
  updated_at timestamptz DEFAULT now() NOT NULL
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (filename) VALUES ('migration_billing_notifications.sql')
ON CONFLICT DO NOTHING;
