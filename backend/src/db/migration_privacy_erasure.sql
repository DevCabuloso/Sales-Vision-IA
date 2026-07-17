-- ════════════════════════════════════════════════════════════════
-- Export completo e anonimização (LGPD) por lead.
--
-- Contexto: "contatos" e "leads" são a MESMA tabela (`leads`) vista por
-- duas rotas/telas diferentes — não existe uma tabela `contacts` separada.
-- `erased_at` marca que os dados pessoais desse registro foram anonimizados
-- a pedido do titular (nome/telefone/e-mail sobrescritos, mensagens
-- associadas com o texto substituído) — ver routes/privacy.js. As linhas
-- NÃO são deletadas (preserva integridade de relatórios agregados).
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE leads ADD COLUMN IF NOT EXISTS erased_at timestamptz;

INSERT INTO schema_migrations (filename) VALUES ('migration_privacy_erasure.sql') ON CONFLICT (filename) DO NOTHING;
