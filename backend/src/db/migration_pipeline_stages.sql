-- ════════════════════════════════════════════════════════════════
-- Estágios de pipeline importados de um CRM externo (Pipeline CRM).
--
-- Contexto: o Kanban hoje tem um funil FIXO, igual pra todo tenant
-- (hardcoded em frontend/src/views/app/KanbanView.vue). Pra não quebrar
-- esse funil existente (leads já usam esses nomes de estágio via
-- leads.stage), o funil importado do CRM vive em paralelo: uma tabela
-- própria de estágios por tenant + uma coluna nova em leads
-- (crm_stage_id) que só é usada quando o lead está sendo visto pela
-- aba "Pipeline CRM" do Kanban. leads.stage (funil local) continua
-- intocado.
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  external_id text NOT NULL,           -- id do estágio na conta do Pipeline CRM
  name text NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  probability integer,
  pipeline_external_id text,           -- id da pipeline dona do estágio (contas podem ter mais de uma)
  pipeline_name text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (tenant_id, external_id)
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL;

-- Mesmo padrão de RLS de migration_rls.sql — app_rls é NOBYPASSRLS, então
-- toda tabela tenant-scoped nova precisa do seu próprio GRANT + policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON pipeline_stages TO app_rls;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pipeline_stages;
CREATE POLICY tenant_isolation ON pipeline_stages FOR ALL TO app_rls
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

INSERT INTO schema_migrations (filename) VALUES ('migration_pipeline_stages.sql') ON CONFLICT (filename) DO NOTHING;
