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

/** Extrai a mensagem de erro real da resposta da Evolution — o texto útil às vezes vem
 *  em data.message, às vezes em data.error, às vezes só dentro de data.response.message
 *  (array), dependendo do tipo de erro (ex: erro de validação de payload). */
function evoErrorMessage(data, status) {
  const nested = Array.isArray(data?.response?.message) ? data.response.message.join(', ') : data?.response?.message
  return data?.message || nested || data?.error || `Evolution erro ${status}`
}

/**
 * Monta o objeto "quoted" (citação) no formato Baileys/Evolution v2, se houver contexto.
 * A Baileys exige também o conteúdo da mensagem citada (`message`), não só o `key` — sem
 * ele o contexto sai vazio e o WhatsApp entrega a mensagem sem nenhuma citação visível.
 */
function buildQuoted(to, quotedWaId, quotedFromMe, quotedText) {
  if (!quotedWaId) return undefined
  return {
    key: { id: quotedWaId, remoteJid: `${to}@s.whatsapp.net`, fromMe: !!quotedFromMe },
    message: { conversation: quotedText || '' },
  }
}

/** Envia texto via Evolution API. */
export async function sendText(tenantId, to, body, { quotedWaId, quotedFromMe, quotedText } = {}) {
  const quoted = buildQuoted(to, quotedWaId, quotedFromMe, quotedText)

  // tenta canal global (tabela channels) primeiro
  const channel = await getConnectedChannel(tenantId)
  if (channel && config.evolution.apiUrl) {
    const url = `${config.evolution.apiUrl.replace(/\/$/, '')}/message/sendText/${channel.instance_name}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.evolution.apiKey },
      body: JSON.stringify({ number: to, text: body, ...(quoted ? { quoted } : {}) }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(evoErrorMessage(data, res.status))
    return { id: data.key?.id || null, remoteJid: data.key?.remoteJid || null, provider: 'evolution' }
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
    body: JSON.stringify({ number: to, text: body, ...(quoted ? { quoted } : {}) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(evoErrorMessage(data, res.status))
  return { id: data.key?.id || null, remoteJid: data.key?.remoteJid || null, provider: 'evolution' }
}

/** Envia mídia (imagem, vídeo, áudio, documento) via Evolution API. */
export async function sendMedia(tenantId, to, { buffer, mimetype, filename, caption = '', quotedWaId, quotedFromMe, quotedText }) {
  const base64 = buffer.toString('base64')
  const mediatype = mimetype.startsWith('image/') ? 'image'
    : mimetype.startsWith('video/') ? 'video'
    : mimetype.startsWith('audio/') ? 'audio'
    : 'document'

  const quoted = buildQuoted(to, quotedWaId, quotedFromMe, quotedText)
  const payload = { number: to, mediatype, mimetype, media: base64, fileName: filename, caption, ...(quoted ? { quoted } : {}) }

  const channel = await getConnectedChannel(tenantId)
  if (channel && config.evolution.apiUrl) {
    const url = `${config.evolution.apiUrl.replace(/\/$/, '')}/message/sendMedia/${channel.instance_name}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.evolution.apiKey },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(evoErrorMessage(data, res.status))
    return { id: data.key?.id || null, remoteJid: data.key?.remoteJid || null, provider: 'evolution' }
  }
  throw new Error('Canal Evolution não conectado.')
}

/** Envia uma localização (o próprio WhatsApp do destinatário renderiza o mapa). */
export async function sendLocation(tenantId, to, { latitude, longitude, name, address, quotedWaId, quotedFromMe, quotedText }) {
  const quoted = buildQuoted(to, quotedWaId, quotedFromMe, quotedText)
  const channel = await getConnectedChannel(tenantId)
  if (!channel || !config.evolution.apiUrl) throw new Error('Canal Evolution não conectado.')

  const url = `${config.evolution.apiUrl.replace(/\/$/, '')}/message/sendLocation/${channel.instance_name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.evolution.apiKey },
    body: JSON.stringify({ number: to, latitude, longitude, name, address, ...(quoted ? { quoted } : {}) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(evoErrorMessage(data, res.status))
  return { id: data.key?.id || null, remoteJid: data.key?.remoteJid || null, provider: 'evolution' }
}

/**
 * Edita uma mensagem já enviada (só funciona para mensagens enviadas pela própria
 * sessão, dentro da janela de tempo que o WhatsApp permite — a Evolution só repassa
 * a edição, quem decide se aceita é o próprio WhatsApp).
 */
export async function editMessage(tenantId, { waMessageId, remoteJid, newText }) {
  const channel = await getConnectedChannel(tenantId)
  if (!channel || !config.evolution.apiUrl) throw new Error('Canal Evolution não conectado.')

  const url = `${config.evolution.apiUrl.replace(/\/$/, '')}/chat/updateMessage/${channel.instance_name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.evolution.apiKey },
    body: JSON.stringify({
      number: remoteJid.split('@')[0],
      key: { remoteJid, fromMe: true, id: waMessageId },
      text: newText,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(evoErrorMessage(data, res.status))
  return { ok: true }
}

/** Apaga uma mensagem "para todos" (só mensagens enviadas pela própria sessão, dentro da janela do WhatsApp). */
export async function deleteMessage(tenantId, { waMessageId, remoteJid }) {
  const channel = await getConnectedChannel(tenantId)
  if (!channel || !config.evolution.apiUrl) throw new Error('Canal Evolution não conectado.')

  const url = `${config.evolution.apiUrl.replace(/\/$/, '')}/chat/deleteMessageForEveryone/${channel.instance_name}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', apikey: config.evolution.apiKey },
    body: JSON.stringify({ id: waMessageId, remoteJid, fromMe: true }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(evoErrorMessage(data, res.status))
  return { ok: true }
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
  // timeout defensivo: se a sessão do WhatsApp estiver com problema de descriptografia
  // (ex: "Bad MAC" / sessão dessincronizada), a Evolution pode nunca responder — sem isso,
  // o fetch trava para sempre e a mensagem inteira nunca é salva na plataforma.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.evolution.apiKey },
      body: JSON.stringify({
        message: { key: { id: messageId, remoteJid, fromMe: !!fromMe } },
        convertToMp4: false,
      }),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `Evolution erro ${res.status}`)
    if (!data.base64) throw new Error('Evolution não retornou base64 da mídia.')
    return { base64: data.base64, mimetype: data.mimetype || null }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Evolution não respondeu a tempo ao buscar a mídia (timeout).')
    throw e
  } finally {
    clearTimeout(timeout)
  }
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
  // descarta broadcast lists (não são conversa de verdade); grupos (@g.us)
  // são tratados como conversa normal — quem decide se processa ou não é o
  // orchestrator, a partir de tenants.op_settings.ignore_group_messages
  if (remoteJid.endsWith('@broadcast')) return null
  const isGroup = remoteJid.endsWith('@g.us')

  const fromMe = data?.key?.fromMe === true

  const msg = data?.message || {}

  // DIAGNÓSTICO TEMPORÁRIO — mensagens de membros de grupo não estavam
  // aparecendo no Chat; nenhuma virava mensagem salva apesar de muitos
  // eventos chegando. Dump completo pra ver o formato real antes de ajustar
  // a extração de texto/mídia. Remover depois de identificar a causa.
  if (isGroup && !fromMe) {
    console.log('[DEBUG-GROUP-MSG]', JSON.stringify({ msgKeys: Object.keys(msg), msg }).slice(0, 1500))
  }

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

  // contextInfo carrega a citação (reply) — pode vir em qualquer um dos tipos de mensagem
  const contextInfo =
    msg.extendedTextMessage?.contextInfo ||
    msg.imageMessage?.contextInfo ||
    msg.videoMessage?.contextInfo ||
    msg.audioMessage?.contextInfo ||
    msg.documentMessage?.contextInfo ||
    null

  const from = remoteJid.split('@')[0]
  const pushName = data?.pushName || null
  // em grupo, quem de fato mandou a mensagem é `participant` (remoteJid é o
  // JID do grupo) — o pushName já reflete o remetente em ambos os casos
  const senderJid = isGroup ? (data?.key?.participant || null) : null
  const finalText = text || `[${mediaType || 'mensagem'}]`
  return {
    from, text: finalText, mediaType, mediaMimeType, mediaFilename,
    mediaMessageId: data?.key?.id || null, mediaRemoteJid: remoteJid, mediaFromMe: fromMe,
    waMessageId: data?.key?.id || null,
    replyToWaId: contextInfo?.stanzaId || null,
    isGroup, senderJid,
    instanceName, fromMe, pushName,
  }
}

// ACK da Baileys (numérico) ou nome do status (Evolution v2) → nosso status interno
const ACK_STATUS_MAP = {
  0: 'failed', ERROR: 'failed',
  1: 'sent', PENDING: 'sent',
  2: 'sent', SERVER_ACK: 'sent',
  3: 'delivered', DELIVERY_ACK: 'delivered',
  4: 'read', READ: 'read',
  5: 'read', PLAYED: 'read',
}

/**
 * Extrai status de entrega de um webhook da Evolution (evento messages.update).
 * Retorna [{ messageId, status, instanceName }] — status: 'sent' | 'delivered' | 'read' | 'failed'
 */
export function parseWebhookStatus(body) {
  const event = body?.event
  if (event !== 'messages.update') return []

  const instanceName = body?.instance || body?.instanceName || null
  const dataRaw = body?.data
  const items = Array.isArray(dataRaw) ? dataRaw : (dataRaw ? [dataRaw] : [])

  const out = []
  for (const item of items) {
    const messageId = item?.key?.id || item?.keyId || null
    if (!messageId) continue
    const rawAck = item?.update?.status ?? item?.status ?? item?.update?.ack ?? item?.ack
    const status = ACK_STATUS_MAP[rawAck]
    if (!status) {
      console.log('[evolution.parseWebhookStatus] ack não reconhecido:', rawAck, '| item:', JSON.stringify(item).slice(0, 300))
      continue
    }
    out.push({ messageId, status, instanceName })
  }
  return out
}

/**
 * Busca o nome de exibição (subject) de um grupo do WhatsApp na Evolution API.
 * Retorna null em qualquer falha (endpoint indisponível, grupo não encontrado,
 * ou o campo `subject` vier vazio — a própria Evolution tem esse bug documentado
 * em algumas versões) para o chamador decidir o fallback, sem derrubar o fluxo
 * de recebimento de mensagem por causa disso.
 */
export async function getGroupSubject(instanceName, groupJid) {
  if (!config.evolution.apiUrl || !instanceName || !groupJid) return null
  try {
    const url = `${config.evolution.apiUrl.replace(/\/$/, '')}/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(groupJid)}&getParticipants=false`
    const res = await fetch(url, { headers: { apikey: config.evolution.apiKey } })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    return data?.subject || null
  } catch (e) {
    console.warn('[evolution.getGroupSubject] falha ao buscar nome do grupo:', e.message)
    return null
  }
}
