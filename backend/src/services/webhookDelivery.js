import { createHmac } from 'node:crypto'
import { supabase, unwrap } from '../db/supabase.js'
import { safeFetch } from '../utils/ssrfGuard.js'

const MAX_ATTEMPTS = 5
const BACKOFF_MS = 5 * 60 * 1000 // 5min por tentativa (attempts * 5min)
const DELIVERY_TIMEOUT_MS = 10_000

/**
 * Enfileira uma entrega por endpoint ativo do tenant inscrito nesse evento.
 * Chamado nos pontos de origem (leads.js, appointments.js, webhooks.js) —
 * nunca lança erro, pra nunca quebrar o fluxo principal por causa de um
 * webhook de terceiro mal configurado.
 */
export async function enqueueWebhookEvent(tenantId, eventType, payload) {
  try {
    const endpoints = unwrap(
      await supabase.from('webhook_endpoints')
        .select('id, events')
        .eq('tenant_id', tenantId)
        .eq('active', true)
    ) || []
    const subscribed = endpoints.filter((e) => (e.events || []).includes(eventType))
    if (!subscribed.length) return

    await supabase.from('webhook_deliveries').insert(
      subscribed.map((e) => ({
        tenant_id: tenantId,
        endpoint_id: e.id,
        event_type: eventType,
        payload,
      }))
    )
  } catch (e) {
    console.warn('[webhookDelivery] falha ao enfileirar evento:', e.message)
  }
}

function signBody(secret, rawBody) {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

/**
 * Processa entregas pendentes/prontas pra retry (chamado pelo scheduler.js,
 * mesmo padrão de fila com claim otimista dos outros jobs deste arquivo).
 */
export async function deliverPendingWebhooks() {
  const due = unwrap(
    await supabase.from('webhook_deliveries')
      .select('id, tenant_id, endpoint_id, event_type, payload, attempts')
      .in('status', ['pending', 'failed'])
      .lte('next_attempt_at', new Date().toISOString())
      .limit(50)
  ) || []

  for (const delivery of due) {
    const { data: claimed } = await supabase.from('webhook_deliveries')
      .update({ status: 'sending' })
      .eq('id', delivery.id).in('status', ['pending', 'failed'])
      .select('id').single()
    if (!claimed) continue

    try {
      const endpointRows = unwrap(
        await supabase.from('webhook_endpoints').select('url, secret, active')
          .eq('id', delivery.endpoint_id).limit(1)
      ) || []
      const endpoint = endpointRows[0]
      if (!endpoint || !endpoint.active) {
        await supabase.from('webhook_deliveries').update({ status: 'cancelled' }).eq('id', delivery.id)
        continue
      }

      const rawBody = JSON.stringify({ event: delivery.event_type, data: delivery.payload })
      const signature = signBody(endpoint.secret, rawBody)

      const res = await safeFetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': delivery.event_type,
          'X-Webhook-Signature': signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      })

      if (res.ok) {
        await supabase.from('webhook_deliveries').update({
          status: 'success', delivered_at: new Date().toISOString(),
        }).eq('id', delivery.id)
      } else {
        await failDelivery(delivery, `HTTP ${res.status}`)
      }
    } catch (e) {
      await failDelivery(delivery, e.message)
    }
  }
}

async function failDelivery(delivery, errorMessage) {
  const attempts = delivery.attempts + 1
  const permanent = attempts >= MAX_ATTEMPTS
  await supabase.from('webhook_deliveries').update({
    status: permanent ? 'failed_permanent' : 'failed',
    attempts,
    last_error: errorMessage,
    next_attempt_at: permanent ? null : new Date(Date.now() + attempts * BACKOFF_MS).toISOString(),
  }).eq('id', delivery.id)
}
