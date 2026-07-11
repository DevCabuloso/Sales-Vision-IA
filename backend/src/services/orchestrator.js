import { supabase, unwrap } from '../db/supabase.js'
import { runAgent } from './ai/agent.js'
import { analyzeLead } from './ai/analyze.js'
import * as whatsapp from './whatsapp/index.js'
import { logUsage } from './usage.js'
import { isWithinBusinessHours, getOffMessage } from '../routes/business-hours.js'
import { uploadChatMedia } from './mediaStorage.js'
import { decryptJSON } from './crypto.js'

// Cache TTL simples para reduzir queries repetidas por mensagem recebida
const _cache = new Map()
function ttlGet(key, ttlSec, fn) {
  const now = Date.now()
  const hit = _cache.get(key)
  if (hit && hit.exp > now) return Promise.resolve(hit.val)
  return Promise.resolve(fn()).then((val) => {
    _cache.set(key, { val, exp: now + ttlSec * 1000 })
    return val
  })
}
// Invalida tenant quando dados de configuração mudam (chamado externamente se necessário)
export function invalidateTenantCache(tenantId) { _cache.delete(`tenant:${tenantId}`) }

/**
 * Processa uma mensagem recebida de um lead via WhatsApp.
 */
/** Normaliza número de telefone: só dígitos, sem espaços/traços/+. */
function normalizePhone(raw) {
  return (raw || '').replace(/\D/g, '')
}

/** Registra mensagem enviada pela plataforma para evitar duplicata do webhook fromMe. */
const _sentByPlatform = new Map()
export function markSentByPlatform(tenantId, phone, text) {
  const key = `${tenantId}:${normalizePhone(phone)}:${text}`
  _sentByPlatform.set(key, Date.now())
  setTimeout(() => _sentByPlatform.delete(key), 30000)
}

/** Resolve o id interno (messages.id) da mensagem citada a partir do wa_message_id do webhook. */
async function resolveReplyToId(tenantId, replyToWaId) {
  if (!replyToWaId) return null
  try {
    const rows = unwrap(
      await supabase.from('messages').select('id')
        .eq('tenant_id', tenantId).eq('wa_message_id', replyToWaId).limit(1)
    )
    return rows?.[0]?.id || null
  } catch {
    return null
  }
}

/** Baixa (Meta: Graph API / Evolution: descriptografia via API própria) a mídia recebida e persiste no storage. */
async function resolveMedia({
  tenantId, provider, instanceName, mediaType, mediaId, mediaMimeType, mediaFilename,
  mediaMessageId, mediaRemoteJid, mediaFromMe,
}) {
  if (!mediaType) return null
  try {
    let buffer, mimetype
    if (provider === 'meta_whatsapp' && mediaId) {
      const dl = await whatsapp.meta.downloadMedia(tenantId, mediaId)
      buffer = dl.buffer
      mimetype = dl.mimetype || mediaMimeType
    } else if (provider === 'evolution' && mediaMessageId && instanceName) {
      const dl = await whatsapp.evolution.downloadMediaBase64(instanceName, mediaMessageId, mediaRemoteJid, mediaFromMe)
      buffer = Buffer.from(dl.base64, 'base64')
      mimetype = dl.mimetype || mediaMimeType
    } else {
      console.warn(`[orchestrator] mídia tipo=${mediaType} sem fonte para download (provider=${provider})`)
      return null
    }
    const url = await uploadChatMedia(tenantId, buffer, mimetype || 'application/octet-stream', mediaFilename || mediaType)

    // transcreve áudio pra texto — sem isso a IA não "escuta" as mensagens de voz do lead
    let transcript = null
    if (mediaType === 'audio') {
      try {
        const { transcribeAudio } = await import('./ai/openai.js')
        const aiCfgRows = unwrap(
          await supabase.from('ai_configs').select('openai_api_key').eq('tenant_id', tenantId).limit(1)
        )
        const apiKey = aiCfgRows?.[0]?.openai_api_key ? decryptJSON(aiCfgRows[0].openai_api_key) : undefined
        transcript = (await transcribeAudio(buffer, mimetype, mediaFilename || 'audio.ogg', apiKey)) || null
      } catch (e) {
        console.warn('[orchestrator] falha ao transcrever áudio:', e.message)
      }
    }

    return { url, mimetype: mimetype || null, transcript }
  } catch (e) {
    console.warn('[orchestrator] falha ao baixar/salvar mídia recebida:', e.message)
    return null
  }
}

export async function handleInboundMessage({
  tenantId, from: rawFrom, text, provider, instanceName, pushName,
  mediaType, mediaId, mediaMimeType, mediaFilename,
  mediaMessageId, mediaRemoteJid, mediaFromMe,
  waMessageId, replyToWaId,
  isGroup, senderJid,
}) {
  // grupo: só processa se o tenant ligou "Habilitar suporte a grupos"
  // (tenants.op_settings.ignore_group_messages === false). Por padrão essa
  // chave não existe/é true, então mensagem de grupo continua sendo
  // ignorada exatamente como antes — comportamento igual pra quem não mexeu
  // na configuração. Checa isso ANTES de qualquer query de lead/canal pra
  // não gastar nada com grupo desabilitado (caso mais comum hoje).
  if (isGroup) {
    const opSettings = await ttlGet(`opsettings:${tenantId}`, 300, async () => {
      const rows = unwrap(await supabase.from('tenants').select('op_settings').eq('id', tenantId).limit(1))
      return rows?.[0]?.op_settings || {}
    })
    if (opSettings.ignore_group_messages !== false) return { reply: null, scheduled: null }
  }

  const from = normalizePhone(rawFrom)
  // resolve channel_id pelo instance_name (se disponível)
  let channelId = null
  if (instanceName) {
    try {
      const chRows = unwrap(
        await supabase.from('channels').select('id')
          .eq('tenant_id', tenantId).eq('instance_name', instanceName).limit(1)
      )
      channelId = chRows?.[0]?.id || null
    } catch { /* ignora */ }
  }

  // 1) lead (upsert por telefone) — grupo usa o JID do grupo como "telefone".
  // Em grupo, pushName é de quem MANDOU a mensagem, não do grupo — nunca usar
  // como nome provisório aqui (evita o nome do lead "piscar" com o nome de um
  // participante aleatório até o group_subject real ser resolvido abaixo).
  const upsertPayload = { tenant_id: tenantId, phone: from, name: isGroup ? from : (pushName || from), updated_at: new Date().toISOString() }
  if (channelId) upsertPayload.channel_id = channelId
  if (isGroup) upsertPayload.is_group = true
  // remoteJid real reportado pelo Baileys na mensagem recebida — mais confiável que
  // reconstruir "telefone@s.whatsapp.net" na hora de editar/apagar (ver comentário
  // na migration_chat_actions.sql sobre o modo LID do WhatsApp).
  if (mediaRemoteJid) upsertPayload.wa_remote_jid = mediaRemoteJid

  const lead = unwrap(
    await supabase.from('leads').upsert(
      upsertPayload,
      { onConflict: 'tenant_id,phone', ignoreDuplicates: false }
    ).select('id, name, stage, assigned_to, conversation_status, human_takeover, is_group, group_subject').single()
  )

  // atualiza o nome se ainda é o número e agora temos o pushName — só pra
  // conversa privada; em grupo o pushName é de quem MANDOU a mensagem, não
  // do grupo, então nunca deve virar o nome da conversa
  if (!isGroup && pushName && lead.name === from) {
    await supabase.from('leads').update({ name: pushName }).eq('id', lead.id)
    lead.name = pushName
  }

  // nome do grupo: busca uma vez na Evolution (webhook não traz o "subject"),
  // fica cacheado em leads.group_subject pras próximas mensagens do mesmo grupo
  if (isGroup) {
    const groupJid = mediaRemoteJid || `${from}@g.us`
    await resolveGroupSubject(lead, instanceName, groupJid)
  }

  // garante channel_id atualizado se lead já existia
  if (channelId) {
    await supabase.from('leads').update({ channel_id: channelId }).eq('id', lead.id).neq('channel_id', channelId)
  }

  // auto-atribuição: se o canal tem usuário ou fila definidos, aplica ao lead
  if (channelId) {
    try {
      const chRows = unwrap(
        await supabase.from('channels').select('assigned_user_id, assigned_queue_id')
          .eq('id', channelId).limit(1)
      )
      const ch = chRows?.[0]
      if (ch?.assigned_user_id && !lead.assigned_to) {
        await supabase.from('leads').update({ assigned_to: ch.assigned_user_id }).eq('id', lead.id)
      }
      if (ch?.assigned_queue_id && !lead.queue_id) {
        await supabase.from('leads').update({ queue_id: ch.assigned_queue_id }).eq('id', lead.id)
      }
    } catch { /* ignora */ }
  }

  // se estava resolvido, reabre como pendente e marca o início da nova conversa
  if (lead.conversation_status === 'resolved') {
    await supabase.from('leads')
      .update({ conversation_status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', lead.id)
    lead.conversation_status = 'pending'
    // separador visual no histórico
    await supabase.from('messages').insert({
      tenant_id: tenantId, lead_id: lead.id, role: 'system',
      text: '— Nova conversa iniciada —', provider,
    })
  } else if (!lead.conversation_status) {
    await supabase.from('leads')
      .update({ conversation_status: 'pending' })
      .eq('id', lead.id)
  }

  console.log(`[orchestrator] lead upserted: id=${lead.id} phone=${from} status=${lead.conversation_status}`)

  // 2) baixa mídia (se houver), resolve reply_to_id e salva mensagem + logUsage em paralelo
  const [media, replyToId] = await Promise.all([
    resolveMedia({
      tenantId, provider, instanceName, mediaType, mediaId, mediaMimeType, mediaFilename,
      mediaMessageId, mediaRemoteJid, mediaFromMe,
    }),
    resolveReplyToId(tenantId, replyToWaId),
  ])
  const finalText = (mediaType === 'audio' && media?.transcript) ? media.transcript : text
  const [msgResult] = await Promise.all([
    supabase.from('messages').insert({
      tenant_id: tenantId, lead_id: lead.id, role: 'lead', text: finalText, provider,
      media_url: media?.url || null,
      media_type: mediaType || null,
      media_mimetype: media?.mimetype || mediaMimeType || null,
      media_filename: mediaFilename || null,
      wa_message_id: waMessageId || null,
      reply_to_id: replyToId,
      sender_jid: isGroup ? (senderJid || null) : null,
      sender_name: isGroup ? (pushName || null) : null,
    }).select('id'),
    logUsage(tenantId, null, 'message_received', { provider }),
  ])
  const savedId = msgResult?.data?.[0]?.id || '(sem id)'
  console.log(`[orchestrator] mensagem salva: id=${savedId} lead_id=${lead.id} text="${finalText?.slice(0, 40)}"`)
  if (msgResult?.error) console.error('[orchestrator] ERRO ao salvar mensagem:', msgResult.error.message)

  // grupo: fica só no atendimento humano — mensagem já está salva/visível no
  // Chat, mas não passa por fluxo nem IA (evita a IA falando num grupo com
  // várias pessoas ao mesmo tempo)
  if (isGroup) return { reply: null, scheduled: null }

  // 2.5) flow engine — retoma sessão ativa sempre; só inicia novo fluxo se não houver humano atendendo
  try {
    const { processFlowMessage } = await import('./flowEngine.js')
    const handledByFlow = await processFlowMessage({
      tenantId, leadId: lead.id, text, channelId,
      allowNewFlow: !lead.human_takeover,
    })
    if (handledByFlow) return { reply: null, scheduled: null }
  } catch (e) {
    console.warn('[orchestrator] flowEngine error:', e.message)
  }

  // 3) histórico + tenant + horário comercial em paralelo
  // tenant e horário são cacheados por 5 min (mudam raramente)
  const [histResult, tenantInfo, withinHours] = await Promise.all([
    supabase.from('messages').select('role, text')
      .eq('lead_id', lead.id).order('created_at', { ascending: true }),
    ttlGet(`tenant:${tenantId}`, 300, async () => {
      const rows = unwrap(await supabase.from('tenants').select('name, ai_enabled').eq('id', tenantId).limit(1))
      return rows?.[0] || { name: null, ai_enabled: true }
    }),
    ttlGet(`biz:${tenantId}`, 60, () => isWithinBusinessHours(tenantId)),
  ])
  const hist = unwrap(histResult)
  const tenantName = tenantInfo.name
  const aiEnabled = (tenantInfo.ai_enabled ?? true) && !lead.human_takeover
  if (!withinHours) {
    const offMsg = await getOffMessage(tenantId)
    try {
      await whatsapp.sendText(tenantId, from, offMsg)
      await supabase.from('messages').insert({ tenant_id: tenantId, lead_id: lead.id, role: 'ai', text: offMsg, provider })
    } catch (e) { console.warn('[orchestrator] off-hours msg:', e.message) }
    return { reply: offMsg, scheduled: null }
  }

  // 4) roda o agente (se IA estiver habilitada)
  let reply = ''
  let scheduled = null
  if (aiEnabled) {
    try {
      const out = await runAgent({ tenantId, tenantName, history: hist })
      reply = out.reply
      scheduled = out.scheduled
    } catch (e) {
      console.error('[orchestrator] IA falhou:', e.message)
    }
  }

  // 5) envia resposta
  if (reply) {
    try {
      await whatsapp.sendText(tenantId, from, reply)
      await Promise.all([
        supabase.from('messages').insert({ tenant_id: tenantId, lead_id: lead.id, role: 'ai', text: reply, provider }),
        logUsage(tenantId, null, 'message_sent', { provider }),
      ])
    } catch (e) {
      console.error('[orchestrator] falha ao enviar:', e.message)
    }
  }

  // 5) persiste reunião se agendou
  if (scheduled) {
    await supabase.from('appointments').insert({
      tenant_id: tenantId, lead_id: lead.id, lead_name: lead.name,
      title: scheduled.title, provider: 'google', external_id: scheduled.externalId,
      start_time: scheduled.start, end_time: scheduled.end,
      meeting_link: scheduled.meetingLink, status: 'scheduled',
    })
    await supabase.from('leads')
      .update({ stage: 'Reunião Agendada', updated_at: new Date().toISOString() })
      .eq('id', lead.id)
    if (lead.stage !== 'Reunião Agendada') {
      await supabase.from('lead_stage_history').insert({
        tenant_id: tenantId, lead_id: lead.id,
        from_stage: lead.stage, to_stage: 'Reunião Agendada',
        changed_by: null, notes: 'Reunião agendada automaticamente pela IA',
      })
      lead.stage = 'Reunião Agendada'
    }
    await logUsage(tenantId, null, 'appointment_created', { by: 'ai' })
  }

  // 6) re-analisa lead (não bloqueia)
  const stageBeforeAnalysis = lead.stage
  analyzeLead(hist.concat([{ role: 'ai', text: reply }]))
    .then(async (a) => {
      const newStage = scheduled ? 'Reunião Agendada' : a.stage
      await supabase.from('leads').update({
        score: a.score,
        intention: a.intention,
        stage: newStage,
        interests: a.interests,
        updated_at: new Date().toISOString(),
      }).eq('id', lead.id)
      if (!scheduled && newStage !== stageBeforeAnalysis) {
        await supabase.from('lead_stage_history').insert({
          tenant_id: tenantId, lead_id: lead.id,
          from_stage: stageBeforeAnalysis, to_stage: newStage,
          changed_by: null, notes: 'Movido automaticamente pela IA',
        })
      }
    })
    .catch((e) => console.warn('[orchestrator] análise:', e.message))

  return { reply, scheduled }
}

/** Busca e persiste o nome do grupo uma única vez (cacheado em leads.group_subject). */
async function resolveGroupSubject(lead, instanceName, groupJid) {
  if (lead.group_subject) return
  const subject = await whatsapp.evolution.getGroupSubject(instanceName, groupJid).catch(() => null)
  if (subject) {
    await supabase.from('leads').update({ group_subject: subject, name: subject }).eq('id', lead.id)
    lead.group_subject = subject
    lead.name = subject
  }
}

/**
 * Registra uma mensagem enviada diretamente pelo WhatsApp (fromMe=true).
 * Salva como mensagem do operador sem acionar a IA.
 */
export async function handleOutboundMessage({
  tenantId, to: rawTo, text, provider, instanceName,
  mediaType, mediaId, mediaMimeType, mediaFilename,
  mediaMessageId, mediaRemoteJid, mediaFromMe,
  waMessageId, replyToWaId,
  isGroup,
}) {
  // mesmo gate de handleInboundMessage — se grupo não estiver habilitado pro
  // tenant, nem chega a criar/atualizar lead (evita que um "oi" mandado pelo
  // próprio atendente pro grupo crie uma conversa fantasma na plataforma)
  if (isGroup) {
    const opSettings = await ttlGet(`opsettings:${tenantId}`, 300, async () => {
      const rows = unwrap(await supabase.from('tenants').select('op_settings').eq('id', tenantId).limit(1))
      return rows?.[0]?.op_settings || {}
    })
    if (opSettings.ignore_group_messages !== false) return
  }

  const to = normalizePhone(rawTo)
  const platformKey = `${tenantId}:${to}:${text}`
  if (_sentByPlatform.has(platformKey)) {
    _sentByPlatform.delete(platformKey)
    return
  }
  let channelId = null
  if (instanceName) {
    try {
      const chRows = unwrap(
        await supabase.from('channels').select('id')
          .eq('tenant_id', tenantId).eq('instance_name', instanceName).limit(1)
      )
      channelId = chRows?.[0]?.id || null
    } catch { /* ignora */ }
  }

  const upsertPayload = { tenant_id: tenantId, phone: to, name: to, updated_at: new Date().toISOString() }
  if (channelId) upsertPayload.channel_id = channelId
  if (isGroup) upsertPayload.is_group = true

  const lead = unwrap(
    await supabase.from('leads').upsert(
      upsertPayload,
      { onConflict: 'tenant_id,phone', ignoreDuplicates: false }
    ).select('id, group_subject').single()
  )

  if (isGroup) {
    const groupJid = mediaRemoteJid || `${to}@g.us`
    await resolveGroupSubject(lead, instanceName, groupJid)
  }

  // Evita duplicata quando a IA envia via Evolution e o webhook fromMe volta imediatamente
  const cutoff = new Date(Date.now() - 15000).toISOString()
  const existing = unwrap(
    await supabase.from('messages')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('lead_id', lead.id)
      .eq('text', text)
      .gte('created_at', cutoff)
      .limit(1)
  )
  if (existing?.length) return

  const [media, replyToId] = await Promise.all([
    resolveMedia({
      tenantId, provider, instanceName, mediaType, mediaId, mediaMimeType, mediaFilename,
      mediaMessageId, mediaRemoteJid, mediaFromMe,
    }),
    resolveReplyToId(tenantId, replyToWaId),
  ])

  const finalText = (mediaType === 'audio' && media?.transcript) ? media.transcript : text
  await supabase.from('messages').insert({
    tenant_id: tenantId,
    lead_id: lead.id,
    role: 'agent',
    text: finalText,
    provider,
    media_url: media?.url || null,
    media_type: mediaType || null,
    media_mimetype: media?.mimetype || mediaMimeType || null,
    media_filename: mediaFilename || null,
    wa_message_id: waMessageId || null,
    reply_to_id: replyToId,
  })
}
