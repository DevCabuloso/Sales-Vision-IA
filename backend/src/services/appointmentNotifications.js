import { supabase, unwrap } from '../db/supabase.js'

function hmInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t).value
  return `${get('hour')}:${get('minute')}`
}

/** Cria o lembrete de agendamento no sino de notificações do responsável pela reunião. */
export async function createAppointmentReminderNotification(appt) {
  if (!appt.assignee_id) return false

  const when = hmInTimezone(new Date(appt.start_time), appt.timezone || 'America/Sao_Paulo')
  const who = appt.lead_name ? ` com ${appt.lead_name}` : ''
  const message = `"${appt.title}"${who} começa às ${when}.`

  const { error } = await supabase.from('notifications').insert({
    tenant_id: appt.tenant_id,
    user_id: appt.assignee_id,
    type: 'appointment_reminder',
    title: 'Lembrete de agendamento',
    message,
  })
  if (error) throw new Error(error.message)
  return true
}
