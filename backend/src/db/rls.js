import pg from 'pg'
import { config } from '../config/index.js'

if (!config.db.rlsUrl) {
  console.warn('[rls] DATABASE_RLS_URL ausente no .env — rotas que usam withTenant() vão falhar.')
}

// Papel Postgres restrito (NOBYPASSRLS, sem service_role) — RLS de verdade,
// diferente do client em db/supabase.js (service_role, ignora RLS por design).
// Ver backend/src/db/migration_rls.sql.
const pool = new pg.Pool({
  connectionString: config.db.rlsUrl,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: 10,
})

pool.on('error', (err) => {
  console.error('[rls] erro em conexão ociosa do pool:', err.message)
})

// Roda `fn(client)` dentro de uma transação com app.tenant_id fixado via
// set_config (parametrizado — nunca interpolar tenantId direto em SQL).
// RLS nas tabelas tenant-scoped filtra automaticamente por esse valor;
// os filtros .eq('tenant_id', ...) explícitos nas queries continuam
// necessários (defesa em profundidade), RLS é uma camada A MAIS, não
// substituição do filtro no código.
export async function withTenant(tenantId, fn) {
  if (!tenantId) throw new Error('withTenant: tenantId ausente.')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', String(tenantId)])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function closeRlsPool() {
  await pool.end()
}
