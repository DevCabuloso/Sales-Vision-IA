import { supabase, unwrap } from '../../db/supabase.js'
import * as meta from './meta.js'
import * as evolution from './evolution.js'
import { ttlGet } from '../../utils/ttlCache.js'

// feat_meta_api/feat_evolution_api/feat_hybrid mudam raramente (só quando um
// admin mexe nas configurações do tenant) — sem cache, isso reconsulta o
// Supabase a CADA envio de mensagem, o que soma milhares de queries evitáveis
// num disparo em massa (até 5000 contatos por campanha).
async function getTenantFlags(tenantId) {
  return ttlGet(`whatsapp-flags:${tenantId}`, 60, async () => {
    const rows = unwrap(
      await supabase.from('tenants')
        .select('feat_meta_api, feat_evolution_api, feat_hybrid')
        .eq('id', tenantId).limit(1)
    )
    return rows?.[0] || {}
  })
}

async function hasConnectedChannel(tenantId) {
  try {
    return await ttlGet(`whatsapp-hasChannel:${tenantId}`, 15, async () => {
      const rows = unwrap(
        await supabase.from('channels').select('id')
          .eq('tenant_id', tenantId).eq('status', 'connected').limit(1)
      )
      return rows?.length > 0
    })
  } catch {
    return false
  }
}

export async function sendMedia(tenantId, to, opts) {
  const f = await getTenantFlags(tenantId)
  if (f.feat_hybrid) {
    try {
      return await meta.sendMedia(tenantId, to, opts)
    } catch (e) {
      console.warn(`[whatsapp] híbrido: Meta falhou para mídia (${e.message}), tentando Evolution`)
      return await evolution.sendMedia(tenantId, to, opts)
    }
  }
  if (f.feat_meta_api) return meta.sendMedia(tenantId, to, opts)
  if (f.feat_evolution_api || await hasConnectedChannel(tenantId)) {
    return evolution.sendMedia(tenantId, to, opts)
  }
  throw new Error('Nenhum provider de WhatsApp habilitado para este cliente.')
}

export async function sendText(tenantId, to, body, opts) {
  const f = await getTenantFlags(tenantId)

  if (f.feat_hybrid) {
    try {
      return await meta.sendText(tenantId, to, body, opts)
    } catch (e) {
      console.warn(`[whatsapp] híbrido: Meta falhou (${e.message}), tentando Evolution`)
      return await evolution.sendText(tenantId, to, body, opts)
    }
  }
  if (f.feat_meta_api) return meta.sendText(tenantId, to, body, opts)
  if (f.feat_evolution_api) return evolution.sendText(tenantId, to, body, opts)

  // detecta automaticamente se tem canal conectado na tabela channels
  if (await hasConnectedChannel(tenantId)) return evolution.sendText(tenantId, to, body, opts)

  throw new Error('Nenhum provider de WhatsApp habilitado para este cliente.')
}

export async function sendLocation(tenantId, to, opts) {
  const f = await getTenantFlags(tenantId)
  if (f.feat_hybrid) {
    try {
      return await meta.sendLocation(tenantId, to, opts)
    } catch (e) {
      console.warn(`[whatsapp] híbrido: Meta falhou para localização (${e.message}), tentando Evolution`)
      return await evolution.sendLocation(tenantId, to, opts)
    }
  }
  if (f.feat_meta_api) return meta.sendLocation(tenantId, to, opts)
  if (f.feat_evolution_api || await hasConnectedChannel(tenantId)) {
    return evolution.sendLocation(tenantId, to, opts)
  }
  throw new Error('Nenhum provider de WhatsApp habilitado para este cliente.')
}

/** Editar/apagar só existem de verdade na Evolution API — a Cloud API da Meta não expõe esses recursos. */
export async function editMessage(tenantId, opts) {
  return evolution.editMessage(tenantId, opts)
}
export async function deleteMessage(tenantId, opts) {
  return evolution.deleteMessage(tenantId, opts)
}

export { meta, evolution }
