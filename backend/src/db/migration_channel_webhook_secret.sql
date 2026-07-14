-- Segredo de webhook próprio por canal — antes, TODOS os tenants validavam o
-- webhook da Evolution contra o mesmo EVOLUTION_WEBHOOK_SECRET global, então
-- quem detivesse essa secret conseguia forjar eventos pra qualquer tenant só
-- trocando o :tenantId da URL. Gerado sob demanda (getOrCreateChannelWebhookSecret,
-- backend/src/utils/channelWebhookSecret.js) quando um canal passa por
-- POST /:id/revalidate-webhook; até lá, a validação continua caindo no
-- segredo global (retrocompatível, sem quebrar canais já configurados).
ALTER TABLE channels ADD COLUMN IF NOT EXISTS webhook_secret text;

INSERT INTO schema_migrations (filename) VALUES ('migration_channel_webhook_secret.sql')
ON CONFLICT DO NOTHING;
