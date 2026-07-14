-- lead_stage_history ficou de fora de migration_perf_indexes.sql — a rota
-- GET /api/leads/:id/history (backend/src/routes/leads.js) filtra por
-- lead_id+tenant_id e ordena por changed_at sem nenhum índice de apoio além
-- da PK. Hoje é irrelevante (poucas linhas por lead), mas escala mal
-- conforme a base de leads/tempo de vida das contas cresce.
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead_changed_at
  ON lead_stage_history (lead_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_tenant_changed_at
  ON lead_stage_history (tenant_id, changed_at DESC);

INSERT INTO schema_migrations (filename) VALUES ('migration_lead_stage_history_index.sql')
ON CONFLICT DO NOTHING;
