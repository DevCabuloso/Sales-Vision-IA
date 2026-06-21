import { supabase, unwrap } from '../../db/supabase.js'
import * as meta from './meta.js'
import * as evolution from './evolution.js'

async function getTenantFlags(tenantId) {
  const rows = unwrap(
    await supabase.from('tenants')
      .select('feat_meta_api, feat_evolution_api, feat_hybrid')
      .eq('id', tenantId).limit(1)
  )
  return rows?.[0] || {}
}

async function hasConnectedChannel(tenantId) {
  try {
    const rows = unwrap(
      await supabase.from('channels').select('id')
        .eq('tenant_id', tenantId).eq('status', 'connected').limit(1)
    )
    return rows?.length > 0
  } catch {
    return false
  }
}

export async function sendMedia(tenantId, to, opts) {
  const f = await getTenantFlags(tenantId)
  if (f.feat_evolution_api || f.feat_hybrid || (!f.feat_meta_api && await hasConnectedChannel(tenantId))) {
    return evolution.sendMedia(tenantId, to, opts)
  }
  throw new Error('Envio de mídia disponível apenas via Evolution API.')
}

export async function sendText(tenantId, to, body) {
  const f = await getTenantFlags(tenantId)

  if (f.feat_hybrid) {
    try {
      return await meta.sendText(tenantId, to, body)
    } catch (e) {
      console.warn(`[whatsapp] híbrido: Meta falhou (${e.message}), tentando Evolution`)
      return await evolution.sendText(tenantId, to, body)
    }
  }
  if (f.feat_meta_api) return meta.sendText(tenantId, to, body)
  if (f.feat_evolution_api) return evolution.sendText(tenantId, to, body)

  // detecta automaticamente se tem canal conectado na tabela channels
  if (await hasConnectedChannel(tenantId)) return evolution.sendText(tenantId, to, body)

  throw new Error('Nenhum provider de WhatsApp habilitado para este cliente.')
}

export { meta, evolution }
