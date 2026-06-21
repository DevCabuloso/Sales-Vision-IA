import { config } from '../../config/index.js'
import { getCredentials } from '../integrations.js'

// Credenciais por-tenant esperadas em integrations(provider='meta_whatsapp'):
//   credentials: { accessToken }
//   meta:        { phoneNumberId, wabaId }

/** Envia uma mensagem de texto via Meta WhatsApp Cloud API. */
export async function sendText(tenantId, to, body) {
  const creds = await getCredentials(tenantId, 'meta_whatsapp')
  if (!creds) throw new Error('Meta WhatsApp não conectado para este cliente.')
  const { accessToken } = creds.credentials
  const { phoneNumberId } = creds.meta
  if (!accessToken || !phoneNumberId) {
    throw new Error('Credenciais Meta incompletas (accessToken/phoneNumberId).')
  }

  const url = `https://graph.facebook.com/${config.meta.graphVersion}/${phoneNumberId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error?.message || `Meta API erro ${res.status}`)
  }
  return { id: data.messages?.[0]?.id, provider: 'meta_whatsapp' }
}

/**
 * Extrai mensagens de um payload de webhook da Meta.
 * Retorna [{ from, text, phoneNumberId }]
 */
export function parseWebhook(body) {
  const out = []
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {}
      const phoneNumberId = value.metadata?.phone_number_id
      for (const msg of value.messages || []) {
        if (msg.type === 'text') {
          out.push({ from: msg.from, text: msg.text?.body || '', phoneNumberId })
        }
      }
    }
  }
  return out
}
