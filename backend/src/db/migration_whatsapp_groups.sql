-- ─── Suporte a grupos do WhatsApp no Chat ───
-- Execute no SQL Editor do Supabase.
-- Grupo é tratado como um `lead` normal (is_group=true) pra reaproveitar
-- 100% do Chat/Kanban/histórico existente. sender_jid/sender_name em
-- `messages` guardam quem dentro do grupo mandou cada mensagem, já que
-- várias pessoas escrevem no mesmo "lead" (o grupo).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_subject TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_jid TEXT,
  ADD COLUMN IF NOT EXISTS sender_name TEXT;

CREATE TABLE IF NOT EXISTS whatsapp_group_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id   UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_group_access_lead ON whatsapp_group_access(lead_id);

-- Rede de segurança de tenant_id (mesma função _assert_same_tenant criada em
-- migration_tenant_safety_triggers.sql — precisa rodar aquele arquivo antes
-- deste, ou a função não vai existir ainda).
DROP TRIGGER IF EXISTS trg_tenant_check_lead_id ON whatsapp_group_access;
CREATE TRIGGER trg_tenant_check_lead_id
  BEFORE INSERT OR UPDATE OF lead_id, tenant_id ON whatsapp_group_access
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('lead_id', 'leads', 'id');

DROP TRIGGER IF EXISTS trg_tenant_check_user_id ON whatsapp_group_access;
CREATE TRIGGER trg_tenant_check_user_id
  BEFORE INSERT OR UPDATE OF user_id, tenant_id ON whatsapp_group_access
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('user_id', 'users', 'id');

INSERT INTO schema_migrations (filename) VALUES ('migration_whatsapp_groups.sql') ON CONFLICT (filename) DO NOTHING;
