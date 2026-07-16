-- ════════════════════════════════════════════════════════════════
-- Agenda completa dentro da plataforma (estilo Google Calendar).
--
-- Contexto: appointments hoje só guarda título/horário/status e depende
-- do Google Calendar pra existir (criação sempre chamava a API do
-- Google, falhando se o tenant não tivesse conectado). Esta migration
-- adiciona os campos necessários pra um evento completo (descrição,
-- local, convidados, cor, dia inteiro, recorrência) e uma tabela de
-- lembretes, para que o agendamento funcione local-first, com o Google
-- Calendar como sincronização opcional (ver appointments.js).
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS guests jsonb NOT NULL DEFAULT '[]'::jsonb;
-- descritor simples de recorrência (não RRULE bruto), só preenchido na
-- linha "mestre" de uma série materializada localmente. Ex:
-- {"freq":"weekly","interval":1,"byDay":["MO","WE"],"count":10,"until":null}
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_rule jsonb;
-- aponta pro mestre da série, nas ocorrências filhas materializadas localmente
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid REFERENCES appointments(id) ON DELETE CASCADE;
-- id do evento recorrente mestre no Google (diferente do external_id de
-- cada instância expandida, que é o que listEvents/sync já usa)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_recurring_event_id text;

-- daqui pra frente, um appointment não sincronizado com o Google nasce
-- 'local' por padrão (antes só existia via Google, então o default era 'google')
ALTER TABLE appointments ALTER COLUMN provider SET DEFAULT 'local';

CREATE INDEX IF NOT EXISTS idx_appointments_recurrence_parent ON appointments (recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;

-- Mesma rede de segurança de tenant_id cruzado usada nas outras tabelas
-- (ver migration_tenant_safety_triggers.sql) — garante que recurrence_parent_id
-- sempre aponta pra uma linha do mesmo tenant.
DROP TRIGGER IF EXISTS trg_tenant_check_recurrence_parent_id ON appointments;
CREATE TRIGGER trg_tenant_check_recurrence_parent_id
  BEFORE INSERT OR UPDATE OF recurrence_parent_id, tenant_id ON appointments
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('recurrence_parent_id', 'appointments', 'id');

CREATE TABLE IF NOT EXISTS appointment_reminders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  method text NOT NULL DEFAULT 'popup',
  minutes_before integer NOT NULL,
  fire_at timestamptz NOT NULL,
  fired boolean NOT NULL DEFAULT false,
  notification_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE appointment_reminders ADD CONSTRAINT fk_appointment_reminders_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE appointment_reminders ADD CONSTRAINT fk_appointment_reminders_appointment_id FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;

-- índice pro scheduler (WHERE NOT fired AND fire_at <= now())
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_due ON appointment_reminders (fire_at) WHERE NOT fired;

DROP TRIGGER IF EXISTS trg_tenant_check_appointment_id ON appointment_reminders;
CREATE TRIGGER trg_tenant_check_appointment_id
  BEFORE INSERT OR UPDATE OF appointment_id, tenant_id ON appointment_reminders
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('appointment_id', 'appointments', 'id');

-- Mesmo padrão de RLS de migration_rls.sql — app_rls é NOBYPASSRLS, então
-- toda tabela tenant-scoped nova precisa do seu próprio GRANT + policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_reminders TO app_rls;
ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON appointment_reminders;
CREATE POLICY tenant_isolation ON appointment_reminders FOR ALL TO app_rls
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

INSERT INTO schema_migrations (filename) VALUES ('migration_calendar_events.sql') ON CONFLICT (filename) DO NOTHING;
