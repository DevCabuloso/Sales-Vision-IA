-- ════════════════════════════════════════════════
-- Funções RPC usadas pelo painel do dono (chamadas via supabase.rpc()).
-- Rode este arquivo no SQL Editor do Supabase DEPOIS do schema.sql.
-- ════════════════════════════════════════════════

-- ─── admin_clients_overview() ───
-- Lista todos os clientes + métricas de uso (substitui o SELECT com subqueries).
CREATE OR REPLACE FUNCTION admin_clients_overview()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  status text,
  plan text,
  feat_meta_api boolean,
  feat_evolution_api boolean,
  feat_hybrid boolean,
  feat_google_cal boolean,
  feat_broadcast boolean,
  max_leads integer,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  users_count bigint,
  leads_count bigint,
  appts_count bigint,
  last_activity timestamptz,
  events_30d bigint,
  integrations json
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    t.id, t.name, t.slug, t.status, t.plan,
    t.feat_meta_api, t.feat_evolution_api, t.feat_hybrid, t.feat_google_cal, t.feat_broadcast,
    t.max_leads, t.notes, t.created_at, t.updated_at,
    (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS users_count,
    (SELECT COUNT(*) FROM leads l WHERE l.tenant_id = t.id) AS leads_count,
    (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = t.id) AS appts_count,
    (SELECT MAX(ue.created_at) FROM usage_events ue WHERE ue.tenant_id = t.id) AS last_activity,
    (SELECT COUNT(*) FROM usage_events ue
       WHERE ue.tenant_id = t.id AND ue.created_at > now() - interval '30 days') AS events_30d,
    (SELECT json_agg(json_build_object('provider', i.provider, 'status', i.status))
       FROM integrations i WHERE i.tenant_id = t.id) AS integrations
  FROM tenants t
  ORDER BY t.created_at DESC;
$$;

-- ─── admin_overview() ───
-- Números agregados do topo do painel do dono.
CREATE OR REPLACE FUNCTION admin_overview()
RETURNS TABLE (
  total_clients bigint,
  active_clients bigint,
  suspended_clients bigint,
  using_meta bigint,
  using_evolution bigint,
  total_users bigint,
  events_24h bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    (SELECT COUNT(*) FROM tenants) AS total_clients,
    (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS active_clients,
    (SELECT COUNT(*) FROM tenants WHERE status = 'suspended') AS suspended_clients,
    (SELECT COUNT(*) FROM tenants WHERE feat_meta_api) AS using_meta,
    (SELECT COUNT(*) FROM tenants WHERE feat_evolution_api) AS using_evolution,
    (SELECT COUNT(*) FROM users WHERE role <> 'owner') AS total_users,
    (SELECT COUNT(*) FROM usage_events WHERE created_at > now() - interval '24 hours') AS events_24h;
$$;
