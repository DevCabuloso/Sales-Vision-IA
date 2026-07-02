import { config } from '../../config/index.js'
import { getCredentials } from '../integrations.js'

// Credenciais por-tenant esperadas em integrations(provider='meta_whatsapp'):
//   credentials: { accessToken }
//   meta:        { phoneNumberId, wabaId }

async function getCreds(tenantId) {
  const creds = await getCredentials(tenantId, 'meta_whatsapp')
  if (!creds) throw new Error('Meta WhatsApp não conectado para este cliente.')
  const { accessToken } = creds.credentials
  const { phoneNumberId } = creds.meta
  if (!accessToken || !phoneNumberId) {
    throw new Error('Credenciais Meta incompletas (accessToken/phoneNumberId).')
  }
  return { accessToken, phoneNumberId }
}

/** Envia uma mensagem de texto via Meta WhatsApp Cloud API. */
export async function sendText(tenantId, to, body) {
  const { accessToken, phoneNumberId } = await getCreds(tenantId)
  const url = `https://graph.facebook.com/${config.meta.graphVersion}/${phoneNumberId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error?.message || `Meta API erro ${res.status}`)
  return { id: data.messages?.[0]?.id, provider: 'meta_whatsapp' }
}

/**
 * Envia mídia (imagem, vídeo, áudio, documento) via Meta Cloud API.
 * Faz upload do buffer primeiro para obter um media_id, depois envia a mensagem.
 */
export async function sendMedia(tenantId, to, { buffer, mimetype, filename, caption = '' }) {
  const { accessToken, phoneNumberId } = await getCreds(tenantId)
  const base = `https://graph.facebook.com/${config.meta.graphVersion}`

  // 1) Upload do arquivo → media_id
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('file', new Blob([buffer], { type: mimetype }), filename)
  const uploadRes = await fetch(`${base}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  const uploadData = await uploadRes.json().catch(() => ({}))
  if (!uploadRes.ok) {
    throw new Error(uploadData.error?.message || `Meta media upload erro ${uploadRes.status}`)
  }
  const mediaId = uploadData.id
  if (!mediaId) throw new Error('Meta não retornou media_id após upload.')

  // 2) Envio da mensagem com media_id
  const type = mimetype.startsWith('image/') ? 'image'
    : mimetype.startsWith('video/') ? 'video'
    : mimetype.startsWith('audio/') ? 'audio'
    : 'document'

  const mediaPayload = { id: mediaId }
  if (caption) mediaPayload.caption = caption
  if (type === 'document') mediaPayload.filename = filename

  const res = await fetch(`${base}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type,
      [type]: mediaPayload,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error?.message || `Meta API erro ${res.status}`)
  return { id: data.messages?.[0]?.id, provider: 'meta_whatsapp' }
}

/**
 * Extrai mensagens de um payload de webhook da Meta.
 * Retorna [{ from, text, mediaType, phoneNumberId, pushName }]
 */
export function parseWebhook(body) {
  const out = []
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {}
      const phoneNumberId = value.metadata?.phone_number_id

      // mapa wa_id → nome do contato
      const nameMap = {}
      for (const c of value.contacts || []) {
        if (c.wa_id) nameMap[c.wa_id] = c.profile?.name || null
      }

      for (const msg of value.messages || []) {
        const from = msg.from
        const pushName = nameMap[from] || null

        if (msg.type === 'text') {
          out.push({ from, text: msg.text?.body || '', phoneNumberId, pushName })
        } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(msg.type)) {
          const caption = msg[msg.type]?.caption || ''
          const fname   = msg[msg.type]?.filename || msg.type
          out.push({
            from,
            text: caption || `[${fname}]`,
            mediaType: msg.type,
            phoneNumberId,
            pushName,
          })
        }
      }
    }
  }
  return out
}

/**
 * Extrai status de entrega de um payload de webhook da Meta.
 * Retorna [{ messageId, recipientId, status, phoneNumberId, error }]
 * status: 'sent' | 'delivered' | 'read' | 'failed'
 */
export function parseWebhookStatuses(body) {
  const out = []
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {}
      const phoneNumberId = value.metadata?.phone_number_id
      for (const s of value.statuses || []) {
        out.push({
          messageId:   s.id,
          recipientId: s.recipient_id,
          status:      s.status,
          phoneNumberId,
          error:       s.errors?.[0]?.message || null,
        })
      }
    }
  }
  return out
}
