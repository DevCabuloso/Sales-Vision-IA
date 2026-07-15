-- ════════════════════════════════════════════════════════════════
-- Row Level Security real, aplicada por um papel novo e restrito.
--
-- Contexto: o backend hoje conecta ao Postgres com a service_role key
-- do Supabase (via supabase-js/PostgREST), que ignora RLS por
-- definição do papel — então RLS sozinha não protegia nada até agora
-- (ver migration_tenant_safety_triggers.sql, que cobre o caso de
-- escrita cruzada; RLS aqui cobre leitura, que triggers não cobrem).
--
-- Esta migration cria um papel Postgres novo (app_rls), SEM
-- BYPASSRLS e SEM superuser, que vai ser usado por uma conexão
-- direta (pg, não PostgREST) nas rotas tenant-scoped. Cada
-- transação faz `SET LOCAL app.tenant_id = '<uuid>'` logo no início,
-- e as policies abaixo restringem toda leitura/escrita a esse tenant.
--
-- Rotas do "owner" (admin.js, cross-tenant por natureza) e rotas
-- pré-auth/webhooks continuam no client service_role existente —
-- não faz sentido nem é seguro RLS-scopá-las a um único tenant.
--
-- Idempotente — pode rodar de novo sem problema.
-- ════════════════════════════════════════════════════════════════

-- A senha real do papel NUNCA vai em arquivo versionado. Este bloco só
-- garante que o papel existe, com uma senha placeholder — rode, logo em
-- seguida, um `ALTER ROLE app_rls PASSWORD '<senha forte gerada>';` avulso
-- (fora de qualquer arquivo commitado) e guarde a senha real só no .env
-- do backend (DATABASE_RLS_URL). Reaplicar esta migration NÃO reseta a
-- senha de um papel já existente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    CREATE ROLE app_rls LOGIN PASSWORD 'changeme_rotate_immediately_after_running_this'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;

GRANT CONNECT ON DATABASE postgres TO app_rls;
GRANT USAGE ON SCHEMA public TO app_rls;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_rls;

-- ─── Tabelas tenant-scoped diretas (têm coluna tenant_id) ───
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'ai_configs', 'appointments', 'broadcast_campaigns', 'broadcast_contacts',
    'business_hours', 'channels', 'checkout_orders', 'custom_apis',
    'flow_sessions', 'flows', 'followup_enrollment_messages', 'followup_enrollments',
    'followup_sequences', 'followup_steps', 'integrations', 'internal_groups',
    'internal_messages', 'labels', 'lead_stage_history', 'leads', 'messages',
    'notifications', 'queues', 'scheduled_messages', 'template_categories',
    'templates', 'ticket_logs', 'usage_events', 'users', 'whatsapp_group_access'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_rls', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO app_rls ' ||
      'USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) ' ||
      'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

-- ─── tenants: cada tenant só enxerga a própria linha ───
GRANT SELECT, UPDATE ON tenants TO app_rls;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants FOR ALL TO app_rls
  USING (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);

-- ─── internal_group_members: sem tenant_id próprio, herda de internal_groups ───
GRANT SELECT, INSERT, UPDATE, DELETE ON internal_group_members TO app_rls;
ALTER TABLE internal_group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON internal_group_members;
CREATE POLICY tenant_isolation ON internal_group_members FOR ALL TO app_rls
  USING (EXISTS (
    SELECT 1 FROM internal_groups g WHERE g.id = internal_group_members.group_id
      AND g.tenant_id = current_setting('app.tenant_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM internal_groups g WHERE g.id = internal_group_members.group_id
      AND g.tenant_id = current_setting('app.tenant_id', true)::uuid
  ));

-- ─── queue_operators: sem tenant_id próprio, herda de queues ───
GRANT SELECT, INSERT, UPDATE, DELETE ON queue_operators TO app_rls;
ALTER TABLE queue_operators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON queue_operators;
CREATE POLICY tenant_isolation ON queue_operators FOR ALL TO app_rls
  USING (EXISTS (
    SELECT 1 FROM queues q WHERE q.id = queue_operators.queue_id
      AND q.tenant_id = current_setting('app.tenant_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM queues q WHERE q.id = queue_operators.queue_id
      AND q.tenant_id = current_setting('app.tenant_id', true)::uuid
  ));

-- RPCs chamadas via client RLS (routes que migraram pra withTenant e usam
-- funções SECURITY DEFINER existentes em functions.sql).
GRANT EXECUTE ON FUNCTION leads_stage_counts(uuid) TO app_rls;

-- platform_settings e schema_migrations: NENHUM grant para app_rls de
-- propósito — são bookkeeping interno/owner-only, nunca deveriam ser
-- alcançadas por uma conexão tenant-scoped. Falha explícita (permission
-- denied) é melhor que RLS silenciosa aqui.

INSERT INTO schema_migrations (filename) VALUES ('migration_rls.sql') ON CONFLICT (filename) DO NOTHING;
