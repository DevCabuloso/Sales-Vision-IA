import { randomUUID } from 'node:crypto'
import { supabase, unwrap } from '../db/supabase.js'
import { timingSafeStringEqual } from './timingSafeCompare.js'

/**
 * Antes, TODOS os tenants validavam o webhook da Evolution contra o mesmo
 * EVOLUTION_WEBHOOK_SECRET global (config/env) — quem detivesse essa secret
 * (o próprio servidor Evolution, ou alguém com acesso a ele) podia forjar
 * eventos para QUALQUER tenant só trocando o :tenantId da URL. Cada canal
 * agora tem seu próprio segredo (channels.webhook_secret), gerado sob demanda
 * e usado tanto para validar o webhook recebido quanto para o header `apikey`
 * registrado na Evolution. Retrocompatível: enquanto um canal não passar por
 * POST /:id/revalidate-webhook (que gera e registra o segredo novo), a
 * validação continua caindo no EVOLUTION_WEBHOOK_SECRET global, igual antes.
 */
export async function getOrCreateChannelWebhookSecret(channelId) {
  const rows = unwrap(
    await supabase.from('channels').select('webhook_secret').eq('id', channelId).limit(1)
  )
  const existing = rows?.[0]?.webhook_secret
  if (existing) return existing

  const secret = randomUUID()
  unwrap(
    await supabase.from('channels').update({ webhook_secret: secret }).eq('id', channelId)
  )
  return secret
}

// 'match' → aceito por um segredo por-canal; 'mismatch' → algum canal do
// tenant TEM segredo próprio mas nenhum bateu (não cai no fallback global,
// senão o segredo por-canal não protegeria nada); 'none-set' → nenhum canal
// do tenant tem segredo próprio ainda, chamador decide se cai no fallback.
export async function matchTenantWebhookSecret(tenantId, provided) {
  const rows = unwrap(
    await supabase.from('channels').select('webhook_secret')
      .eq('tenant_id', tenantId).not('webhook_secret', 'is', null)
  ) || []
  if (!rows.length) return 'none-set'
  const ok = rows.some((r) => timingSafeStringEqual(provided, r.webhook_secret))
  return ok ? 'match' : 'mismatch'
}

export async function matchInstanceWebhookSecret(instanceName, provided) {
  const rows = unwrap(
    await supabase.from('channels').select('webhook_secret')
      .eq('instance_name', instanceName).not('webhook_secret', 'is', null).limit(1)
  ) || []
  if (!rows.length) return 'none-set'
  const ok = timingSafeStringEqual(provided, rows[0].webhook_secret)
  return ok ? 'match' : 'mismatch'
}
