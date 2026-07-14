-- Referência opcional a um lead numa notificação — usada pelos novos alertas
-- de falha de envio/IA (services/opsAlerts.js) pra deduplicar por lead e,
-- futuramente, permitir que o frontend leve o usuário direto pro atendimento
-- a partir do sino.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS lead_id uuid;

DROP TRIGGER IF EXISTS trg_tenant_check_lead_id ON notifications;
CREATE TRIGGER trg_tenant_check_lead_id
  BEFORE INSERT OR UPDATE OF lead_id, tenant_id ON notifications
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('lead_id', 'leads', 'id');

INSERT INTO schema_migrations (filename) VALUES ('migration_notification_lead_ref.sql')
ON CONFLICT DO NOTHING;
