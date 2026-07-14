-- ════════════════════════════════════════════════════════════════
-- Estende a rede de segurança de tenant_id cruzado (ver
-- migration_tenant_safety_triggers.sql) para as 5 tabelas que ficaram de
-- fora daquele primeiro lote: queues, queue_operators, internal_groups,
-- internal_group_members e labels — confirmadas agora via schema.sql
-- (introspecção real do Supabase).
--
-- queue_operators e internal_group_members são tabelas de junção SEM
-- coluna tenant_id própria (só as duas FKs) — por isso usam uma função de
-- trigger diferente (_assert_related_same_tenant), que compara o tenant_id
-- dos DOIS lados da relação entre si, em vez de comparar contra um
-- NEW.tenant_id que não existe nessas tabelas. Sem isso, um user_id de
-- outro tenant podia ser inserido como operador de uma fila ou membro de um
-- grupo interno sem nenhuma validação no banco (a validação em
-- backend/src/routes/queues.js e internal-groups.js já foi corrigida no
-- código da aplicação — isto aqui é a rede de segurança equivalente do lado
-- do banco, defesa em profundidade).
--
-- Idempotente — pode rodar de novo sem problema.
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS _assert_related_same_tenant() CASCADE;
CREATE FUNCTION _assert_related_same_tenant()
RETURNS trigger AS $$
DECLARE
  fk1_col    text := TG_ARGV[0];
  ref1_table text := TG_ARGV[1];
  fk2_col    text := TG_ARGV[2];
  ref2_table text := TG_ARGV[3];
  fk1_value  uuid;
  fk2_value  uuid;
  tenant1    uuid;
  tenant2    uuid;
BEGIN
  fk1_value := (to_jsonb(NEW) ->> fk1_col)::uuid;
  fk2_value := (to_jsonb(NEW) ->> fk2_col)::uuid;
  IF fk1_value IS NULL OR fk2_value IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT tenant_id FROM %I WHERE id = $1', ref1_table) INTO tenant1 USING fk1_value;
  EXECUTE format('SELECT tenant_id FROM %I WHERE id = $1', ref2_table) INTO tenant2 USING fk2_value;

  IF tenant1 IS NOT NULL AND tenant2 IS NOT NULL AND tenant1 IS DISTINCT FROM tenant2 THEN
    RAISE EXCEPTION
      'tenant_id mismatch em %: %=% (tenant=%) e %=% (tenant=%) pertencem a tenants diferentes',
      TG_TABLE_NAME, fk1_col, fk1_value, tenant1, fk2_col, fk2_value, tenant2;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── queue_operators (sem tenant_id próprio) ───
DROP TRIGGER IF EXISTS trg_tenant_check_queue_user ON queue_operators;
CREATE TRIGGER trg_tenant_check_queue_user
  BEFORE INSERT OR UPDATE ON queue_operators
  FOR EACH ROW EXECUTE FUNCTION _assert_related_same_tenant('queue_id', 'queues', 'user_id', 'users');

-- ─── internal_group_members (sem tenant_id próprio) ───
DROP TRIGGER IF EXISTS trg_tenant_check_group_user ON internal_group_members;
CREATE TRIGGER trg_tenant_check_group_user
  BEFORE INSERT OR UPDATE ON internal_group_members
  FOR EACH ROW EXECUTE FUNCTION _assert_related_same_tenant('group_id', 'internal_groups', 'user_id', 'users');

-- ─── internal_groups (tem tenant_id — reusa _assert_same_tenant) ───
DROP TRIGGER IF EXISTS trg_tenant_check_created_by ON internal_groups;
CREATE TRIGGER trg_tenant_check_created_by
  BEFORE INSERT OR UPDATE OF created_by, tenant_id ON internal_groups
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('created_by', 'users', 'id');

-- queues e labels não têm nenhuma FK além de tenant_id (nome/cor/descrição
-- só) — nada a proteger além do que a aplicação já filtra em toda query.

INSERT INTO schema_migrations (filename) VALUES ('migration_tenant_safety_triggers_queues_groups.sql')
ON CONFLICT DO NOTHING;
