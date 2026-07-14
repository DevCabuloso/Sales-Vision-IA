import { supabase, unwrap } from '../db/supabase.js'

const DEDUPE_WINDOW_MS = 15 * 60 * 1000

/**
 * Cria um alerta (sino, ver NotificationBell.vue) pros admins/owner do tenant
 * quando algo falha silenciosamente do ponto de vista do lead (envio de
 * WhatsApp, resposta da IA indisponível) — antes, essas falhas só apareciam
 * em `pm2 logs`, nunca na própria plataforma, então ninguém do time sabia
 * que um lead ficou sem resposta. Deduplicado por tenant+type+lead numa
 * janela curta pra não virar spam quando a causa raiz (ex: Evolution fora
 * do ar) afeta várias mensagens seguidas do mesmo lead.
 */
export async function notifyOpsFailure(tenantId, { type, title, message, leadId = null }) {
  try {
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString()
    let dupQuery = supabase.from('notifications').select('id')
      .eq('tenant_id', tenantId).eq('type', type).is('resolved_at', null)
      .gte('created_at', since)
    dupQuery = leadId ? dupQuery.eq('lead_id', leadId) : dupQuery.is('lead_id', null)
    const existing = unwrap(await dupQuery.limit(1)) || []
    if (existing.length) return

    const recipients = unwrap(
      await supabase.from('users').select('id')
        .eq('tenant_id', tenantId).eq('active', true).in('role', ['owner', 'admin'])
        .limit(10)
    ) || []
    for (const r of recipients) {
      await supabase.from('notifications').insert({
        tenant_id: tenantId, user_id: r.id, type, title, message, lead_id: leadId,
      })
    }
  } catch (e) {
    console.warn('[opsAlerts] falha ao criar notificação:', e.message)
  }
}
