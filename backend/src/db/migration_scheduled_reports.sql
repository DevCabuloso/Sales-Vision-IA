-- ════════════════════════════════════════════════════════════════
-- Relatório semanal por e-mail (agendado).
--
-- Contexto: reports.js só tinha relatório diário sob demanda (GET /daily).
-- Esta tabela guarda a configuração de envio periódico por e-mail — uma
-- linha por tenant (singleton via UNIQUE em tenant_id). O envio de verdade
-- depende de SMTP configurado no .env (ver services/email.js); sem isso o
-- job do scheduler só loga aviso e não envia nada.
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_schedules (
  tenant_id       uuid NOT NULL,
  active          boolean NOT NULL DEFAULT false,
  recipients      text[] NOT NULL DEFAULT '{}',
  day_of_week     integer NOT NULL DEFAULT 1, -- 0=domingo .. 6=sábado (padrão: segunda)
  hour            integer NOT NULL DEFAULT 8,
  minute          integer NOT NULL DEFAULT 0,
  timezone        text NOT NULL DEFAULT 'America/Sao_Paulo',
  last_sent_at    timestamptz,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (tenant_id)
);
ALTER TABLE report_schedules ADD CONSTRAINT fk_report_schedules_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- Mesmo padrão de RLS de migration_rls.sql — app_rls é NOBYPASSRLS, então
-- toda tabela tenant-scoped nova precisa do seu próprio GRANT + policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON report_schedules TO app_rls;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON report_schedules;
CREATE POLICY tenant_isolation ON report_schedules FOR ALL TO app_rls
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

INSERT INTO schema_migrations (filename) VALUES ('migration_scheduled_reports.sql') ON CONFLICT (filename) DO NOTHING;
