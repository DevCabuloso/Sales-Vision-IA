-- ─── ALTER FOLLOWUP: horário geral ou individual de envio de cada mensagem ───
-- Execute no Supabase SQL Editor ou via psql
ALTER TABLE followup_sequences
  ADD COLUMN IF NOT EXISTS time_mode TEXT NOT NULL DEFAULT 'general' CHECK (time_mode IN ('general', 'individual')),
  ADD COLUMN IF NOT EXISTS default_send_time TEXT NOT NULL DEFAULT '09:00';

ALTER TABLE followup_steps
  ADD COLUMN IF NOT EXISTS send_time TEXT;

INSERT INTO schema_migrations (filename) VALUES ('migration_followup_send_time.sql') ON CONFLICT (filename) DO NOTHING;
