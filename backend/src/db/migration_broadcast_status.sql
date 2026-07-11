-- ─── ALTER BROADCAST_CONTACTS: rastreamento de status de entrega ───
-- Execute no Supabase SQL Editor ou via psql
-- Sem isso o webhook não consegue casar o evento de status (delivered/read)
-- com o contato certo, então a mensagem fica travada em 'sent' para sempre.
ALTER TABLE broadcast_contacts
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_wa_message_id
  ON broadcast_contacts(wa_message_id) WHERE wa_message_id IS NOT NULL;

INSERT INTO schema_migrations (filename) VALUES ('migration_broadcast_status.sql') ON CONFLICT (filename) DO NOTHING;
