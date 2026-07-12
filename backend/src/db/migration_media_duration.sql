-- ════════════════════════════════════════════════════════════════
-- Duração (em segundos) de mensagens de áudio.
--
-- Contexto: o navegador não consegue ler de forma confiável a duração de um
-- WebM gerado pelo MediaRecorder (o cabeçalho não guarda a duração até a
-- gravação terminar) — o <audio> nativo mostra valores errados (ex: 10s de
-- gravação aparecendo como 1min+). O frontend agora envia a duração real,
-- contada durante a gravação, e ela é salva aqui para exibição confiável.
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_duration_seconds integer;

INSERT INTO schema_migrations (filename) VALUES ('migration_media_duration.sql') ON CONFLICT (filename) DO NOTHING;
