import { supabase, unwrap } from '../db/supabase.js'
import { sendText } from './whatsapp/index.js'
import { markSentByPlatform } from './orchestrator.js'
import { logUsage } from './usage.js'
import { processBroadcast } from '../routes/broadcast.js'

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

let running = false
async function tick() {
  if (running) return
  running = true
  try {
    await runDueBroadcastCampaigns()
    await runDueScheduledMessages()
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
