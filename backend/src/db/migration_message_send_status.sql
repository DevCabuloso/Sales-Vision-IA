-- "Mensagens fantasma": antes, uma mensagem enviada manualmente pelo atendente
-- (chat.js) ou por uma automação (flowEngine.js) era gravada em `messages`
-- (e aparecia como enviada no Chat) mesmo quando o envio real ao WhatsApp
-- falhava — a falha só virava um `console.warn`, sem nenhum sinal na
-- plataforma. Essas duas colunas permitem persistir a mensagem sempre (o
-- atendente não perde o que digitou) mas com um status explícito, e o
-- frontend passa a poder mostrar um indicador de falha em vez de "enviada".
ALTER TABLE messages ADD COLUMN IF NOT EXISTS send_status text DEFAULT 'sent' NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS send_error text;

INSERT INTO schema_migrations (filename) VALUES ('migration_message_send_status.sql')
ON CONFLICT DO NOTHING;
