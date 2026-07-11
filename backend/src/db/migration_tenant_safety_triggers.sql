-- ════════════════════════════════════════════════════════════════
-- Rede de segurança no banco contra bugs de tenant_id cruzado.
--
-- Contexto: o backend conecta ao Supabase com a service_role key, que
-- ignora Row Level Security por definição do papel no Postgres — RLS
-- não é capaz de proteger contra um bug de código que grave um
-- tenant_id errado. Triggers, ao contrário de RLS, disparam para
-- QUALQUER papel (inclusive service_role), então são a única forma
-- real de blindar isso no nível do banco.
--
-- O que isso pega: um INSERT/UPDATE que grava tenant_id numa linha
-- filha (ex: messages.tenant_id) diferente do tenant_id da linha pai
-- referenciada (ex: leads.tenant_id do lead_id apontado) — ou seja,
-- escrita cruzada entre clientes por bug de código.
--
-- O que isso NÃO pega: um SELECT que "esqueceu" o filtro .eq('tenant_id', ...)
-- e vazou leitura de outro tenant. Isso é outra categoria de risco —
-- triggers só disparam em escrita, não em leitura. Mitigar isso exige
-- disciplina de código (ex: um helper de query que sempre injeta o
-- filtro) e não tem solução no nível do banco enquanto o backend usar
-- um client único com service_role.
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente — pode
-- rodar de novo sem problema (DROP FUNCTION/TRIGGER IF EXISTS).
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS _assert_same_tenant() CASCADE;
CREATE FUNCTION _assert_same_tenant()
RETURNS trigger AS $$
DECLARE
  fk_column  text := TG_ARGV[0];
  ref_table  text := TG_ARGV[1];
  ref_pk     text := COALESCE(TG_ARGV[2], 'id');
  fk_value   uuid;
  ref_tenant uuid;
BEGIN
  fk_value := (to_jsonb(NEW) ->> fk_column)::uuid;
  IF fk_value IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT tenant_id FROM %I WHERE %I = $1', ref_table, ref_pk)
    INTO ref_tenant USING fk_value;

  IF ref_tenant IS NOT NULL AND ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION
      'tenant_id mismatch em %.%: % referencia % de outro tenant (linha tenant_id=%, referência tenant_id=%)',
      TG_TABLE_NAME, fk_column, fk_value, ref_table, NEW.tenant_id, ref_tenant;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── messages ───
DROP TRIGGER IF EXISTS trg_tenant_check_lead_id ON messages;
CREATE TRIGGER trg_tenant_check_lead_id
  BEFORE INSERT OR UPDATE OF lead_id, tenant_id ON messages
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('lead_id', 'leads', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_reply_to_id ON messages;
CREATE TRIGGER trg_tenant_check_reply_to_id
  BEFORE INSERT OR UPDATE OF reply_to_id, tenant_id ON messages
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('reply_to_id', 'messages', 'id');

-- ─── appointments ───
DROP TRIGGER IF EXISTS trg_tenant_check_lead_id ON appointments;
CREATE TRIGGER trg_tenant_check_lead_id
  BEFORE INSERT OR UPDATE OF lead_id, tenant_id ON appointments
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('lead_id', 'leads', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_assignee_id ON appointments;
CREATE TRIGGER trg_tenant_check_assignee_id
  BEFORE INSERT OR UPDATE OF assignee_id, tenant_id ON appointments
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('assignee_id', 'users', 'id');

-- ─── usage_events ───
DROP TRIGGER IF EXISTS trg_tenant_check_user_id ON usage_events;
CREATE TRIGGER trg_tenant_check_user_id
  BEFORE INSERT OR UPDATE OF user_id, tenant_id ON usage_events
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('user_id', 'users', 'id');

-- ─── lead_stage_history ───
DROP TRIGGER IF EXISTS trg_tenant_check_lead_id ON lead_stage_history;
CREATE TRIGGER trg_tenant_check_lead_id
  BEFORE INSERT OR UPDATE OF lead_id, tenant_id ON lead_stage_history
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('lead_id', 'leads', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_changed_by ON lead_stage_history;
CREATE TRIGGER trg_tenant_check_changed_by
  BEFORE INSERT OR UPDATE OF changed_by, tenant_id ON lead_stage_history
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('changed_by', 'users', 'id');

-- ─── broadcast_contacts / broadcast_campaigns ───
DROP TRIGGER IF EXISTS trg_tenant_check_campaign_id ON broadcast_contacts;
CREATE TRIGGER trg_tenant_check_campaign_id
  BEFORE INSERT OR UPDATE OF campaign_id, tenant_id ON broadcast_contacts
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('campaign_id', 'broadcast_campaigns', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_template_id ON broadcast_campaigns;
CREATE TRIGGER trg_tenant_check_template_id
  BEFORE INSERT OR UPDATE OF template_id, tenant_id ON broadcast_campaigns
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('template_id', 'templates', 'id');

-- ─── scheduled_messages ───
DROP TRIGGER IF EXISTS trg_tenant_check_lead_id ON scheduled_messages;
CREATE TRIGGER trg_tenant_check_lead_id
  BEFORE INSERT OR UPDATE OF lead_id, tenant_id ON scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('lead_id', 'leads', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_created_by ON scheduled_messages;
CREATE TRIGGER trg_tenant_check_created_by
  BEFORE INSERT OR UPDATE OF created_by, tenant_id ON scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('created_by', 'users', 'id');

-- ─── followup_steps ───
DROP TRIGGER IF EXISTS trg_tenant_check_sequence_id ON followup_steps;
CREATE TRIGGER trg_tenant_check_sequence_id
  BEFORE INSERT OR UPDATE OF sequence_id, tenant_id ON followup_steps
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('sequence_id', 'followup_sequences', 'id');

-- ─── followup_enrollments ───
DROP TRIGGER IF EXISTS trg_tenant_check_sequence_id ON followup_enrollments;
CREATE TRIGGER trg_tenant_check_sequence_id
  BEFORE INSERT OR UPDATE OF sequence_id, tenant_id ON followup_enrollments
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('sequence_id', 'followup_sequences', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_lead_id ON followup_enrollments;
CREATE TRIGGER trg_tenant_check_lead_id
  BEFORE INSERT OR UPDATE OF lead_id, tenant_id ON followup_enrollments
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('lead_id', 'leads', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_created_by ON followup_enrollments;
CREATE TRIGGER trg_tenant_check_created_by
  BEFORE INSERT OR UPDATE OF created_by, tenant_id ON followup_enrollments
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('created_by', 'users', 'id');

-- ─── followup_enrollment_messages ───
DROP TRIGGER IF EXISTS trg_tenant_check_enrollment_id ON followup_enrollment_messages;
CREATE TRIGGER trg_tenant_check_enrollment_id
  BEFORE INSERT OR UPDATE OF enrollment_id, tenant_id ON followup_enrollment_messages
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('enrollment_id', 'followup_enrollments', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_lead_id ON followup_enrollment_messages;
CREATE TRIGGER trg_tenant_check_lead_id
  BEFORE INSERT OR UPDATE OF lead_id, tenant_id ON followup_enrollment_messages
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('lead_id', 'leads', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_step_id ON followup_enrollment_messages;
CREATE TRIGGER trg_tenant_check_step_id
  BEFORE INSERT OR UPDATE OF step_id, tenant_id ON followup_enrollment_messages
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('step_id', 'followup_steps', 'id');

-- ════════════════════════════════════════════════════════════════
-- NÃO cobertas aqui: tabelas queues/queue_operators, internal_groups/
-- internal_group_members e labels existem no backend (rotas queues.js,
-- internal-groups.js, labels.js) mas o schema delas não estava nos
-- arquivos .sql recuperados do histórico do git (provavelmente
-- adicionadas depois, direto no Supabase). Antes de estender este
-- padrão pra elas, confirme os nomes exatos de coluna no Supabase.
-- ════════════════════════════════════════════════════════════════

INSERT INTO schema_migrations (filename) VALUES ('migration_tenant_safety_triggers.sql') ON CONFLICT (filename) DO NOTHING;
