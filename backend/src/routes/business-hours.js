import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { logAudit } from '../services/usage.js'

export const businessHoursRouter = Router()
businessHoursRouter.use(requireAuth, requireTenant)

const dayScheduleSchema = z.object({
  open:  z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (use HH:mm).'),
  end:   z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (use HH:mm).'),
})

const putSchema = z.object({
  enabled:     z.boolean().optional(),
  timezone:    z.string().min(1).optional(),
  schedule:    z.record(z.string(), dayScheduleSchema).optional(),
  off_message: z.string().optional(),
})

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
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query('SELECT * FROM business_hours WHERE tenant_id = $1 LIMIT 1', [req.user.tenantId])
      return r.rows[0]
    })
    res.json({ config: row || { enabled: false, timezone: 'America/Sao_Paulo', schedule: DEFAULT_SCHEDULE, off_message: 'Estamos fora do horário de atendimento. Retornaremos em breve!' } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

businessHoursRouter.put('/', async (req, res) => {
  const parsed = putSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { enabled, timezone, schedule, off_message } = parsed.data
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO business_hours (tenant_id, enabled, timezone, schedule, off_message)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (tenant_id) DO UPDATE SET
           enabled = EXCLUDED.enabled, timezone = EXCLUDED.timezone,
           schedule = EXCLUDED.schedule, off_message = EXCLUDED.off_message
         RETURNING *`,
        [req.user.tenantId, !!enabled, timezone || 'America/Sao_Paulo', JSON.stringify(schedule || DEFAULT_SCHEDULE), off_message || '']
      )
      return r.rows[0]
    })
    await logAudit(req.user.tenantId, req.user.id, 'business_hours', 'update', req.user.tenantId, { enabled, timezone })
    res.json({ config: row })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

/** Utilitário exportado para o orchestrator verificar horário */
export async function isWithinBusinessHours(tenantId) {
  try {
    const cfg = await withTenant(tenantId, async (client) => {
      const r = await client.query('SELECT enabled, timezone, schedule FROM business_hours WHERE tenant_id = $1 LIMIT 1', [tenantId])
      return r.rows[0]
    })
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
    const row = await withTenant(tenantId, async (client) => {
      const r = await client.query('SELECT timezone FROM business_hours WHERE tenant_id = $1 LIMIT 1', [tenantId])
      return r.rows[0]
    })
    return row?.timezone || 'America/Sao_Paulo'
  } catch { return 'America/Sao_Paulo' }
}

export async function getOffMessage(tenantId) {
  try {
    const row = await withTenant(tenantId, async (client) => {
      const r = await client.query('SELECT off_message FROM business_hours WHERE tenant_id = $1 LIMIT 1', [tenantId])
      return r.rows[0]
    })
    return row?.off_message || 'Estamos fora do horário de atendimento. Retornaremos em breve!'
  } catch { return 'Estamos fora do horário de atendimento.' }
}
