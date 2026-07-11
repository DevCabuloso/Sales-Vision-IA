-- ════════════════════════════════════════════════════════════════
-- Token de validação do webhook da InfinitePay.
--
-- Contexto: order_nsu é devolvido ao cliente em POST /api/billing/trial-signup
-- (necessário para o polling de status em /pagamento/retorno), então não é
-- segredo. Sem mais nada, qualquer um poderia chamar POST /api/billing/webhook
-- direto com esse order_nsu + o valor certo e "confirmar" um pagamento que
-- nunca aconteceu — a InfinitePay não documenta assinatura de webhook pra
-- evitar isso. webhook_token é gerado no signup, nunca devolvido ao cliente,
-- e vai embutido na webhook_url que registramos na InfinitePay — só ela (e o
-- backend) sabem esse valor.
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS webhook_token text;

INSERT INTO schema_migrations (filename) VALUES ('migration_billing_webhook_token.sql') ON CONFLICT (filename) DO NOTHING;
