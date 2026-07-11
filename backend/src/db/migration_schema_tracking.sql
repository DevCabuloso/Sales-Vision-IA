-- ════════════════════════════════════════════════════════════════
-- Controle de migrations aplicadas.
--
-- Contexto: não existe schema.sql consolidado neste projeto — só
-- arquivos migration_*.sql soltos, aplicados manualmente no SQL
-- Editor do Supabase, sem nenhum registro de quais já rodaram em
-- produção. Isso torna fácil esquecer de aplicar uma migration nova
-- (o código já assume a coluna e falha em runtime) ou perder o
-- controle de quais tenants/ambientes estão desatualizados.
--
-- RODE ESTE ARQUIVO PRIMEIRO, antes de qualquer outro migration_*.sql.
-- Depois, rode (ou re-rode) todos os outros migration_*.sql — todos
-- são idempotentes (IF NOT EXISTS / ON CONFLICT DO NOTHING em tudo),
-- então rodar de novo um que já foi aplicado antes não faz nada além
-- de registrar ele aqui. Isso resolve o "não sei o que já rodou":
-- depois de rodar tudo uma vez, esta tabela reflete a realidade.
--
-- A partir de agora, todo novo migration_*.sql deve terminar com:
--   INSERT INTO schema_migrations (filename) VALUES ('nome_do_arquivo.sql')
--     ON CONFLICT (filename) DO NOTHING;
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
