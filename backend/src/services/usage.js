import { supabase } from '../db/supabase.js'

/** Registra um evento de uso (para o painel do dono). Nunca lança erro. */
export async function logUsage(tenantId, userId, eventType, meta = {}) {
  try {
    await supabase.from('usage_events').insert({
      tenant_id: tenantId,
      user_id: userId,
      event_type: eventType,
      meta,
    })
  } catch (e) {
    console.warn('[usage] falha ao registrar evento:', e.message)
  }
}
