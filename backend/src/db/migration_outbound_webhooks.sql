-- ════════════════════════════════════════════════════════════════
-- Webhooks de saída (outbound): a plataforma passa a poder notificar
-- sistemas de terceiros quando eventos importantes acontecem (novo lead,
-- mudança de estágio, agendamento criado, mensagem recebida). Antes disso
-- routes/webhooks.js só RECEBIA eventos (Meta/Evolution/Pipeline CRM) —
-- não existia nenhum mecanismo de a plataforma emitir eventos pra fora.
--
-- `webhook_endpoints`: URL + segredo (HMAC) cadastrados pelo tenant, com a
-- lista de eventos que quer receber.
-- `webhook_deliveries`: fila de entregas (uma linha por evento x endpoint),
-- processada pelo scheduler.js com retry/backoff — mesmo padrão de fila
-- "claim otimista" já usado pra broadcast/scheduled_messages/followups.
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE webhook_endpoints ADD CONSTRAINT fk_webhook_endpoints_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  endpoint_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT now(),
  last_error text,
  created_at timestamptz DEFAULT now() NOT NULL,
  delivered_at timestamptz,
  PRIMARY KEY (id)
);
ALTER TABLE webhook_deliveries ADD CONSTRAINT fk_webhook_deliveries_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE webhook_deliveries ADD CONSTRAINT fk_webhook_deliveries_endpoint_id FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE;

-- índice pro scheduler (WHERE status IN ('pending','failed') AND next_attempt_at <= now())
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
  ON webhook_deliveries (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- Mesma rede de segurança de tenant_id cruzado usada nas outras tabelas
-- (ver migration_tenant_safety_triggers.sql) — garante que endpoint_id
-- sempre pertence ao mesmo tenant_id da entrega.
DROP TRIGGER IF EXISTS trg_tenant_check_webhook_endpoint_id ON webhook_deliveries;
CREATE TRIGGER trg_tenant_check_webhook_endpoint_id
  BEFORE INSERT OR UPDATE OF endpoint_id, tenant_id ON webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION _assert_same_tenant('endpoint_id', 'webhook_endpoints', 'id');

-- Mesmo padrão de RLS de migration_rls.sql — app_rls é NOBYPASSRLS, então
-- toda tabela tenant-scoped nova precisa do seu próprio GRANT + policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_endpoints TO app_rls;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON webhook_endpoints;
CREATE POLICY tenant_isolation ON webhook_endpoints FOR ALL TO app_rls
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_deliveries TO app_rls;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON webhook_deliveries;
CREATE POLICY tenant_isolation ON webhook_deliveries FOR ALL TO app_rls
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

INSERT INTO schema_migrations (filename) VALUES ('migration_outbound_webhooks.sql') ON CONFLICT (filename) DO NOTHING;
