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
 * Baixa e descriptografa uma mídia recebida, usando o endpoint próprio da Evolution
 * (a mídia do WhatsApp chega criptografada — a Evolution já tem a chave da sessão
 * Baileys para descriptografar, então é mais simples/confiável pedir pra ela do que
 * reimplementar a criptografia do WhatsApp aqui).
 */
export async function downloadMediaBase64(instanceName, messageId, remoteJid, fromMe) {
  if (!config.evolution.apiUrl) throw new Error('EVOLUTION_API_URL não configurado.')
  const url = `${config.evolution.apiUrl.replace(/\/$/, '')}/chat/getBase64FromMediaMessage/${instanceName}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.evolution.apiKey },
    body: JSON.stringify({
      message: { key: { id: messageId, remoteJid, fromMe: !!fromMe } },
      convertToMp4: false,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Evolution erro ${res.status}`)
  if (!data.base64) throw new Error('Evolution não retornou base64 da mídia.')
  return { base64: data.base64, mimetype: data.mimetype || null }
}

/**
 * Extrai mensagem de um webhook da Evolution (evento messages.upsert).
 * Retorna { from, text, mediaType, instanceName } ou null.
 */
export function parseWebhook(body) {
  // Evolution v2 envia body.event; só processa mensagens recebidas
  const event = body?.event
  if (event && event !== 'messages.upsert') return null

  const instanceName = body?.instance || body?.instanceName || null

  // suporte a payload v2 (body.data) e legado (body direto); data pode ser array
  const dataRaw = body?.data || body
  const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw

  console.log('[evolution.parseWebhook] data keys:', Object.keys(data || {}).join(', '), '| fromMe:', data?.key?.fromMe, '| remoteJid:', data?.key?.remoteJid)

  const remoteJid = data?.key?.remoteJid
  if (!remoteJid) {
    console.warn('[evolution.parseWebhook] sem remoteJid, descartando. body.data type:', Array.isArray(body?.data) ? 'array' : typeof body?.data)
    return null
  }
  // descarta mensagens de grupos/broadcasts
  if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) return null

  const fromMe = data?.key?.fromMe === true

  const msg = data?.message || {}

  // extrai texto cobrindo todos os tipos comuns da Evolution v2
  const text =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.listResponseMessage?.title ||
    msg.templateButtonReplyMessage?.selectedDisplayText ||
    msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    ''

  // tipo de mídia + mimetype/nome de arquivo para registro
  let mediaType = null
  let mediaMimeType = null
  let mediaFilename = null
  if (msg.imageMessage) {
    mediaType = 'image'; mediaMimeType = msg.imageMessage.mimetype
  } else if (msg.videoMessage) {
    mediaType = 'video'; mediaMimeType = msg.videoMessage.mimetype
  } else if (msg.audioMessage || msg.pttMessage) {
    mediaType = 'audio'; mediaMimeType = (msg.audioMessage || msg.pttMessage).mimetype
  } else if (msg.documentMessage || msg.documentWithCaptionMessage) {
    mediaType = 'document'
    const docMsg = msg.documentMessage || msg.documentWithCaptionMessage?.message?.documentMessage
    mediaMimeType = docMsg?.mimetype || null
    mediaFilename = docMsg?.fileName || null
  } else if (msg.stickerMessage) {
    mediaType = 'sticker'; mediaMimeType = msg.stickerMessage.mimetype
  }

  // descarta se não há texto nem mídia reconhecida
  if (!text && !mediaType) {
    console.warn('[evolution.parseWebhook] mensagem sem texto/mídia reconhecida, tipo:', Object.keys(msg).join(', ') || '(vazio)')
    return null
  }

  const from = remoteJid.split('@')[0]
  const pushName = data?.pushName || null
  const finalText = text || `[${mediaType || 'mensagem'}]`
  return {
    from, text: finalText, mediaType, mediaMimeType, mediaFilename,
    mediaMessageId: data?.key?.id || null, mediaRemoteJid: remoteJid, mediaFromMe: fromMe,
    instanceName, fromMe, pushName,
  }
}
