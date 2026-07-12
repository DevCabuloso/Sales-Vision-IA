import { supabase, unwrap } from '../db/supabase.js'
import { sendText, sendMedia } from './whatsapp/index.js'
import { markSentByPlatform } from './orchestrator.js'
import { logUsage } from './usage.js'
import { processBroadcast } from '../routes/broadcast.js'
import { safeFetch } from '../utils/ssrfGuard.js'

const POLL_MS = 20_000

async function runDueBroadcastCampaigns() {
  const due = unwrap(
    await supabase.from('broadcast_campaigns').select('id, tenant_id, content')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .limit(20)
  )
  for (const camp of due) {
    // marca como sending antes de disparar para não ser pega de novo no próximo tick
    const { data: claimed } = await supabase.from('broadcast_campaigns')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', camp.id).eq('status', 'scheduled')
      .select('id').single()
    if (!claimed) continue // outra tick/processo já pegou

    processBroadcast(camp.tenant_id, camp).catch((e) =>
      console.error('[scheduler] erro na campanha agendada:', e.message)
    )
  }
}

async function runDueScheduledMessages() {
  const due = unwrap(
    await supabase.from('scheduled_messages').select('id, tenant_id, lead_id, text')
      .eq('status', 'pending')
      .lte('send_at', new Date().toISOString())
      .limit(50)
  )
  for (const item of due) {
    // reivindica a linha atomically-ish: só segue se ainda estava pending
    const { data: claimed } = await supabase.from('scheduled_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', item.id).eq('status', 'pending')
      .select('id').single()
    if (!claimed) continue

    try {
      const leadRows = unwrap(
        await supabase.from('leads').select('id, phone, human_takeover')
          .eq('id', item.lead_id).eq('tenant_id', item.tenant_id).limit(1)
      )
      const lead = leadRows[0]
      if (!lead?.phone) throw new Error('Lead sem telefone.')

      await supabase.from('messages').insert({
        tenant_id: item.tenant_id,
        lead_id: item.lead_id,
        role: 'agent',
        text: item.text,
        is_human_takeover: lead.human_takeover,
      })

      markSentByPlatform(item.tenant_id, lead.phone, item.text)
      await sendText(item.tenant_id, lead.phone, item.text)
      await logUsage(item.tenant_id, null, 'message_sent', { by: 'scheduled' })
    } catch (e) {
      console.error('[scheduler] falha ao enviar mensagem agendada:', e.message)
      await supabase.from('scheduled_messages').update({ status: 'failed', error: e.message })
        .eq('id', item.id)
    }
  }
}

async function runDueFollowupMessages() {
  const due = unwrap(
    await supabase.from('followup_enrollment_messages')
      .select('id, tenant_id, lead_id, enrollment_id, text, media_url, media_type, media_mimetype, media_filename')
      .eq('status', 'pending')
      .lte('send_at', new Date().toISOString())
      .limit(50)
  )
  for (const item of due) {
    // reivindica a linha atomically-ish: só segue se ainda estava pending
    const { data: claimed } = await supabase.from('followup_enrollment_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', item.id).eq('status', 'pending')
      .select('id').single()
    if (!claimed) continue

    try {
      const leadRows = unwrap(
        await supabase.from('leads').select('id, phone, human_takeover')
          .eq('id', item.lead_id).eq('tenant_id', item.tenant_id).limit(1)
      )
      const lead = leadRows[0]
      if (!lead?.phone) throw new Error('Lead sem telefone.')

      const mediaType = item.media_url ? item.media_type : null
      await supabase.from('messages').insert({
        tenant_id: item.tenant_id,
        lead_id: item.lead_id,
        role: 'agent',
        text: item.text,
        is_human_takeover: lead.human_takeover,
        media_url: item.media_url,
        media_type: mediaType,
        media_mimetype: item.media_mimetype,
        media_filename: item.media_filename,
      })

      if (item.media_url) {
        markSentByPlatform(item.tenant_id, lead.phone, `[${mediaType}]`)
        // safeFetch: media_url é uma URL livre digitada pelo usuário ao criar o
        // passo de follow-up (z.string().url() em followups.js) — sem essa
        // proteção seria SSRF trivial contra rede interna a cada disparo.
        const resp = await safeFetch(item.media_url)
        const buffer = Buffer.from(await resp.arrayBuffer())
        await sendMedia(item.tenant_id, lead.phone, {
          buffer, mimetype: item.media_mimetype, filename: item.media_filename, caption: item.text,
        })
      } else {
        markSentByPlatform(item.tenant_id, lead.phone, item.text)
        await sendText(item.tenant_id, lead.phone, item.text)
      }
      await logUsage(item.tenant_id, null, 'message_sent', { by: 'followup' })

      const pending = unwrap(
        await supabase.from('followup_enrollment_messages').select('id')
          .eq('enrollment_id', item.enrollment_id).eq('status', 'pending').limit(1)
      )
      if (!pending.length) {
        await supabase.from('followup_enrollments').update({
          status: 'completed', finished_at: new Date().toISOString(),
        }).eq('id', item.enrollment_id).eq('status', 'active')
      }
    } catch (e) {
      console.error('[scheduler] falha ao enviar mensagem de acompanhamento:', e.message)
      await supabase.from('followup_enrollment_messages').update({ status: 'failed', error: e.message })
        .eq('id', item.id)
    }
  }
}

let running = false
async function tick() {
  if (running) return
  running = true
  try {
    await runDueBroadcastCampaigns()
    await runDueScheduledMessages()
    await runDueFollowupMessages()
  } catch (e) {
    console.error('[scheduler] erro no ciclo:', e.message)
  } finally {
    running = false
  }
}

export function startScheduler() {
  setInterval(tick, POLL_MS)
  console.log(`[scheduler] iniciado, verificando a cada ${POLL_MS / 1000}s`)
}
