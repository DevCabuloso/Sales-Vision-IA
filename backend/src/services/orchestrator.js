import { supabase, unwrap } from '../db/supabase.js'
import { runAgent } from './ai/agent.js'
import { analyzeLead } from './ai/analyze.js'
import * as whatsapp from './whatsapp/index.js'
import { logUsage } from './usage.js'
import { isWithinBusinessHours, getOffMessage } from '../routes/business-hours.js'

/**
 * Processa uma mensagem recebida de um lead via WhatsApp.
 */
export async function handleInboundMessage({ tenantId, from, text, provider, instanceName, pushName }) {
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

  // 1) lead (upsert por telefone)
  const upsertPayload = { tenant_id: tenantId, phone: from, name: pushName || from, updated_at: new Date().toISOString() }
  if (channelId) upsertPayload.channel_id = channelId

  const lead = unwrap(
    await supabase.from('leads').upsert(
      upsertPayload,
      { onConflict: 'tenant_id,phone', ignoreDuplicates: false }
    ).select('id, name, assigned_to, conversation_status').single()
  )

  // atualiza o nome se ainda é o número e agora temos o pushName
  if (pushName && lead.name === from) {
    await supabase.from('leads').update({ name: pushName }).eq('id', lead.id)
    lead.name = pushName
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

  // 2) salva mensagem do lead
  await supabase.from('messages').insert({
    tenant_id: tenantId, lead_id: lead.id, role: 'lead', text, provider,
  })
  await logUsage(tenantId, null, 'message_received', { provider })

  // histórico
  const hist = unwrap(
    await supabase.from('messages').select('role, text')
      .eq('lead_id', lead.id).order('created_at', { ascending: true })
  )
  const tRows = unwrap(
    await supabase.from('tenants').select('name, ai_enabled').eq('id', tenantId).limit(1)
  )
  const tenantName = tRows?.[0]?.name
  const aiEnabled = tRows?.[0]?.ai_enabled ?? true

  // 3) verifica horário de atendimento
  const withinHours = await isWithinBusinessHours(tenantId)
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
      await supabase.from('messages').insert({
        tenant_id: tenantId, lead_id: lead.id, role: 'ai', text: reply, provider,
      })
      await logUsage(tenantId, null, 'message_sent', { provider })
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
    await logUsage(tenantId, null, 'appointment_created', { by: 'ai' })
  }

  // 6) re-analisa lead (não bloqueia)
  analyzeLead(hist.concat([{ role: 'ai', text: reply }]))
    .then((a) =>
      supabase.from('leads').update({
        score: a.score,
        intention: a.intention,
        stage: scheduled ? 'Reunião Agendada' : a.stage,
        interests: a.interests,
        updated_at: new Date().toISOString(),
      }).eq('id', lead.id)
    )
    .catch((e) => console.warn('[orchestrator] análise:', e.message))

  return { reply, scheduled }
}

/**
 * Registra uma mensagem enviada diretamente pelo WhatsApp (fromMe=true).
 * Salva como mensagem do operador sem acionar a IA.
 */
export async function handleOutboundMessage({ tenantId, to, text, provider, instanceName }) {
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

  const lead = unwrap(
    await supabase.from('leads').upsert(
      upsertPayload,
      { onConflict: 'tenant_id,phone', ignoreDuplicates: false }
    ).select('id').single()
  )

  await supabase.from('messages').insert({
    tenant_id: tenantId,
    lead_id: lead.id,
    role: 'agent',
    text,
    provider,
  })
}
