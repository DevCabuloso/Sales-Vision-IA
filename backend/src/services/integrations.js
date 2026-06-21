import { supabase, unwrap } from '../db/supabase.js'
import { encrypt, decryptJSON } from './crypto.js'

/** Lê e descriptografa as credenciais de um provider para um tenant. */
export async function getCredentials(tenantId, provider) {
  const rows = unwrap(
    await supabase.from('integrations')
      .select('credentials, meta, status')
      .eq('tenant_id', tenantId).eq('provider', provider).limit(1)
  )
  const row = rows?.[0]
  if (!row || row.status !== 'connected') return null
  return { credentials: decryptJSON(row.credentials), meta: row.meta || {} }
}

/** Upsert de credenciais criptografadas + meta. */
export async function saveCredentials(tenantId, provider, credentials, meta = {}) {
  unwrap(
    await supabase.from('integrations').upsert({
      tenant_id: tenantId,
      provider,
      status: 'connected',
      credentials: encrypt(credentials),
      meta,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,provider' })
  )
  return { connected: true }
}

export async function disconnectProvider(tenantId, provider) {
  unwrap(
    await supabase.from('integrations')
      .update({ status: 'disconnected', credentials: null, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId).eq('provider', provider)
  )
  return { disconnected: true }
}
