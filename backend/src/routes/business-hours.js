import { Router } from 'express'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const businessHoursRouter = Router()
businessHoursRouter.use(requireAuth, requireTenant)

const DEFAULT_SCHEDULE = {
  0: { open: false, start: '08:00', end: '18:00' },
  1: { open: true,  start: '08:00', end: '18:00' },
  2: { open: true,  start: '08:00', end: '18:00' },
  3: { open: true,  start: '08:00', end: '18:00' },
  4: { open: true,  start: '08:00', end: '18:00' },
  5: { open: true,  start: '08:00', end: '18:00' },
  6: { open: false, start: '08:00', end: '12:00' },
}

businessHoursRouter.get('/', async (req, res) => {
  try {
    const rows = unwrap(await supabase.from('business_hours').select('*').eq('tenant_id', req.user.tenantId).limit(1))
    res.json({ config: rows[0] || { enabled: false, timezone: 'America/Sao_Paulo', schedule: DEFAULT_SCHEDULE, off_message: 'Estamos fora do horário de atendimento. Retornaremos em breve!' } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

businessHoursRouter.put('/', async (req, res) => {
  const { enabled, timezone, schedule, off_message } = req.body
  try {
    const row = unwrap(
      await supabase.from('business_hours').upsert(
        { tenant_id: req.user.tenantId, enabled: !!enabled, timezone: timezone || 'America/Sao_Paulo', schedule: schedule || DEFAULT_SCHEDULE, off_message: off_message || '' },
        { onConflict: 'tenant_id' }
      ).select('*').single()
    )
    res.json({ config: row })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

/** Utilitário exportado para o orchestrator verificar horário */
export async function isWithinBusinessHours(tenantId) {
  try {
    const rows = unwrap(await supabase.from('business_hours').select('enabled, timezone, schedule').eq('tenant_id', tenantId).limit(1))
    const cfg = rows[0]
    if (!cfg || !cfg.enabled) return true
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: cfg.timezone || 'America/Sao_Paulo' }))
    const day = now.getDay()
    const dayConfig = cfg.schedule[day]
    if (!dayConfig?.open) return false
    const [sh, sm] = dayConfig.start.split(':').map(Number)
    const [eh, em] = dayConfig.end.split(':').map(Number)
    const mins = now.getHours() * 60 + now.getMinutes()
    return mins >= sh * 60 + sm && mins < eh * 60 + em
  } catch { return true }
}

/** Fuso horário operacional do tenant (usado também pelo agendamento de acompanhamentos) */
export async function getTenantTimezone(tenantId) {
  try {
    const rows = unwrap(await supabase.from('business_hours').select('timezone').eq('tenant_id', tenantId).limit(1))
    return rows[0]?.timezone || 'America/Sao_Paulo'
  } catch { return 'America/Sao_Paulo' }
}

export async function getOffMessage(tenantId) {
  try {
    const rows = unwrap(await supabase.from('business_hours').select('off_message').eq('tenant_id', tenantId).limit(1))
    return rows[0]?.off_message || 'Estamos fora do horário de atendimento. Retornaremos em breve!'
  } catch { return 'Estamos fora do horário de atendimento.' }
}
