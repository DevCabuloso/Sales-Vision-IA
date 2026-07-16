import { supabase, unwrap } from '../db/supabase.js'
import { sendText, sendMedia } from './whatsapp/index.js'
import { markSentByPlatform } from './orchestrator.js'
import { logUsage } from './usage.js'
import { processBroadcast } from '../routes/broadcast.js'
import { safeFetch } from '../utils/ssrfGuard.js'
import { createBillingReminderNotification } from './billingNotifications.js'
import { createAppointmentReminderNotification } from './appointmentNotifications.js'

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
        // proteção seria SSRF trivial contra rede interna a cada disparo. O
        // timeout é igualmente essencial aqui: o scheduler processa os due items
        // sequencialmente sob um mutex único (`running`) — sem timeout, um host
        // lento/travado numa media_url mal configurada por UM tenant prende o
        // ciclo inteiro (campanhas, mensagens agendadas, lembretes de vencimento
        // de TODOS os tenants) até o fetch resolver ou expirar.
        const resp = await safeFetch(item.media_url, { signal: AbortSignal.timeout(10_000) })
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

// Horário/timezone fixos em America/Sao_Paulo (mesmo padrão de
// followups.js/business-hours.js) — usar Intl em vez de getHours()/
// getDate() evita depender do timezone do SO onde o processo Node roda.
const REMINDER_TZ = 'America/Sao_Paulo'

function ymdInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function hmInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t).value
  return `${get('hour')}:${get('minute')}`
}

// Aviso de vencimento de mensalidade: dispara uma vez por dia, no horário
// configurado em platform_settings, pros tenants com billing_notify_user_id
// definido cujo next_billing_at cai exatamente N dias à frente de hoje.
// O tick roda a cada 20s, então o guard de "já criei hoje" (dentro de
// createBillingReminderNotification) evita duplicar o aviso nos ~3 ticks que
// caem dentro do mesmo minuto configurado.
async function runDueBillingReminders() {
  const settingsRows = unwrap(
    await supabase.from('platform_settings')
      .select('billing_reminder_days_before, billing_reminder_time')
      .eq('id', 1).limit(1)
  ) || []
  if (!settingsRows.length) return
  const { billing_reminder_days_before: daysBefore, billing_reminder_time: timeStr } = settingsRows[0]

  const now = new Date()
  if (hmInTimezone(now, REMINDER_TZ) !== (timeStr || '09:00')) return

  const targetDateStr = ymdInTimezone(new Date(now.getTime() + daysBefore * 86400000), REMINDER_TZ)

  // .limit(): essa query roda a cada tick (20s) — sem limite, cresce sem
  // paginação conforme a base de tenants aumenta. 500 é bem acima de qualquer
  // volume atual e revisitado se a base crescer além disso.
  const tenants = unwrap(
    await supabase.from('tenants')
      .select('id, name, next_billing_at, billing_notify_user_id')
      .not('billing_notify_user_id', 'is', null)
      .not('next_billing_at', 'is', null)
      .limit(500)
  ) || []

  for (const t of tenants) {
    if (ymdInTimezone(new Date(t.next_billing_at), REMINDER_TZ) !== targetDateStr) continue

    try {
      const message = `A mensalidade de ${t.name} vence em ${daysBefore} dia${daysBefore === 1 ? '' : 's'}.`
      await createBillingReminderNotification(t, message)
    } catch (e) {
      console.error('[scheduler] falha ao criar aviso de vencimento:', e.message)
    }
  }
}

// Lembretes de agendamento: cada linha de appointment_reminders due (fire_at
// <= now, ainda não disparada) vira uma notificação no sino do responsável
// pela reunião. Reivindica com o mesmo padrão "claimed" das outras filas
// deste arquivo, pra não duplicar entre ticks concorrentes.
async function runDueAppointmentReminders() {
  const due = unwrap(
    await supabase.from('appointment_reminders')
      .select('id, tenant_id, appointment_id')
      .eq('fired', false)
      .lte('fire_at', new Date().toISOString())
      .limit(50)
  ) || []

  for (const reminder of due) {
    const { data: claimed } = await supabase.from('appointment_reminders')
      .update({ fired: true })
      .eq('id', reminder.id).eq('fired', false)
      .select('id').single()
    if (!claimed) continue

    try {
      const apptRows = unwrap(
        await supabase.from('appointments')
          .select('tenant_id, title, lead_name, start_time, timezone, assignee_id, status')
          .eq('id', reminder.appointment_id).eq('tenant_id', reminder.tenant_id).limit(1)
      ) || []
      const appt = apptRows[0]
      if (!appt || appt.status === 'cancelled') continue
      await createAppointmentReminderNotification(appt)
    } catch (e) {
      console.error('[scheduler] falha ao criar lembrete de agendamento:', e.message)
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
    await runDueBillingReminders()
    await runDueAppointmentReminders()
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
