-- ════════════════════════════════════════════════════════════════
-- Permissões por operador: de booleano-por-tela para ação-por-tela.
--
-- Contexto: users.permissions era {chat:true, kanban:false, ...} —
-- um booleano único por área, sem distinguir ver/criar/editar/excluir.
-- A partir de agora cada área vira {view, create, edit, delete}. Esta
-- migration converte só as chaves que ainda são booleanas (idempotente:
-- rodar de novo depois de já convertido não faz nada, porque o valor
-- deixou de ser boolean e o WHERE não bate mais).
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rec RECORD;
  area TEXT;
  new_perms JSONB;
  area_value JSONB;
BEGIN
  FOR rec IN SELECT id, permissions FROM users WHERE permissions IS NOT NULL LOOP
    new_perms := rec.permissions;
    FOR area IN SELECT jsonb_object_keys(rec.permissions) LOOP
      area_value := rec.permissions -> area;
      IF jsonb_typeof(area_value) = 'boolean' THEN
        new_perms := jsonb_set(
          new_perms,
          ARRAY[area],
          jsonb_build_object(
            'view', area_value, 'create', area_value,
            'edit', area_value, 'delete', area_value
          )
        );
      END IF;
    END LOOP;
    IF new_perms IS DISTINCT FROM rec.permissions THEN
      UPDATE users SET permissions = new_perms WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (filename) VALUES ('migration_permissions_by_action.sql') ON CONFLICT (filename) DO NOTHING;
