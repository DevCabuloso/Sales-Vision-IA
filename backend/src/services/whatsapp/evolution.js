import { getCredentials } from '../integrations.js'
import { config } from '../../config/index.js'
import { supabase, unwrap } from '../../db/supabase.js'

/** Busca o primeiro canal conectado do tenant na tabela channels. */
async function getConnectedChannel(tenantId) {
  try {
    const rows = unwrap(
      await supabase.from('channels').select('instance_name')
        .eq('tenant_id', tenantId).eq('status', 'connected').limit(1)
    )
    return rows?.[0] || null
  } catch {
    return null
  }
}

/** Envia texto via Evolution API. */
export async function sendText(tenantId, to, body) {
  // tenta canal global (tabela channels) primeiro
  const channel = await getConnectedChannel(tenantId)
  if (channel && config.evolution.apiUrl) {
    const url = `${config.evolution.apiUrl.replace(/\/$/, '')}/message/sendText/${channel.instance_name}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.evolution.apiKey },
      body: JSON.stringify({ number: to, text: body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `Evolution erro ${res.status}`)
    return { id: data.key?.id || null, provider: 'evolution' }
  }

  // fallback: credenciais antigas por-tenant em integrations
  const creds = await getCredentials(tenantId, 'evolution')
  if (!creds) throw new Error('Evolution API não conectada para este cliente.')
  const { apiKey } = creds.credentials
  const { baseUrl, instance } = creds.meta
  if (!apiKey || !baseUrl || !instance) {
    throw new Error('Credenciais Evolution incompletas (apiKey/baseUrl/instance).')
  }
  const url = `${baseUrl.replace(/\/$/, '')}/message/sendText/${instance}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number: to, text: body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Evolution erro ${res.status}`)
  return { id: data.key?.id || null, provider: 'evolution' }
}

/** Envia mídia (imagem, vídeo, áudio, documento) via Evolution API. */
export async function sendMedia(tenantId, to, { buffer, mimetype, filename, caption = '' }) {
  const base64 = buffer.toString('base64')
  const mediatype = mimetype.startsWith('image/') ? 'image'
    : mimetype.startsWith('video/') ? 'video'
    : mimetype.startsWith('audio/') ? 'audio'
    : 'document'

  const payload = { number: to, mediatype, mimetype, media: base64, fileName: filename, caption }

  const channel = await getConnectedChannel(tenantId)
  if (channel && config.evolution.apiUrl) {
    const url = `${config.evolution.apiUrl.replace(/\/$/, '')}/message/sendMedia/${channel.instance_name}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.evolution.apiKey },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `Evolution erro ${res.status}`)
    return { id: data.key?.id || null, provider: 'evolution' }
  }
  throw new Error('Canal Evolution não conectado.')
}

/**
 * Extrai mensagem de um webhook da Evolution (evento messages.upsert).
 * Retorna { from, text } ou null.
 */
export function parseWebhook(body) {
  const data = body?.data || body
  const remoteJid = data?.key?.remoteJid
  if (!remoteJid || data?.key?.fromMe) return null
  // ignora mensagens de grupos (@g.us) e broadcasts (@broadcast)
  if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) return null
  const text =
    data?.message?.conversation ||
    data?.message?.extendedTextMessage?.text ||
    ''
  if (!text) return null
  const from = remoteJid.split('@')[0]
  return { from, text }
}
