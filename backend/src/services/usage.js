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

/**
 * Audit log genérico — reaproveita `usage_events` (já tenant-scoped, RLS e
 * indexado) em vez de criar tabela nova. Convenção: `event_type` sempre no
 * formato `audit.<entity>.<action>`, o que permite à rota GET /api/audit-log
 * filtrar com `event_type LIKE 'audit.%'` sem misturar com os demais eventos
 * (message_sent, lead_created etc.) que já usam essa mesma tabela.
 */
export async function logAudit(tenantId, actorId, entity, action, entityId, changes = {}) {
  await logUsage(tenantId, actorId, `audit.${entity}.${action}`, { entityId, changes })
}
