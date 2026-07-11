-- ════════════════════════════════════════════════════════════════
-- Editar, apagar, encaminhar mensagem e localização — chat externo
-- (messages) e interno (internal_messages).
--
-- Tipos de id confirmados via information_schema (schema public):
-- messages.id = bigint, internal_messages.id = uuid.
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_id bigint REFERENCES messages(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_lat double precision;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_lng double precision;
-- remoteJid real da conversa no WhatsApp (Baileys), capturado no momento do envio.
-- Necessário pra editar/apagar funcionar em conversas no modo LID (@lid) — reconstruir
-- esse valor a partir do telefone (ex: "5511999999999@s.whatsapp.net") só funciona pro
-- modo de endereçamento tradicional, e falha com "RemoteJid does not match" em contas LID.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_remote_jid text;

-- O remoteJid capturado no ENVIO (acima) não é confiável em conversas no modo LID —
-- a Evolution aceita o pedido de apagar/editar sem erro, mas não localiza a mensagem de
-- verdade e nada muda no WhatsApp. O remoteJid confiável é o que vem nas mensagens
-- RECEBIDAS do lead (Baileys sempre reporta o JID real nesse caso). Guardamos por lead
-- (não por mensagem) e passamos a preferir esse valor ao editar/apagar.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS wa_remote_jid text;

ALTER TABLE internal_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE internal_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE internal_messages ADD COLUMN IF NOT EXISTS forwarded_from_id uuid REFERENCES internal_messages(id);
ALTER TABLE internal_messages ADD COLUMN IF NOT EXISTS location_lat double precision;
ALTER TABLE internal_messages ADD COLUMN IF NOT EXISTS location_lng double precision;

INSERT INTO schema_migrations (filename) VALUES ('migration_chat_actions.sql') ON CONFLICT (filename) DO NOTHING;
