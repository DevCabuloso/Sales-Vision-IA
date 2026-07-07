-- ─── ALTER MESSAGES: suporte a responder mensagem específica (reply/quote) ───
-- Execute no Supabase SQL Editor ou via psql
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id ON messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;
