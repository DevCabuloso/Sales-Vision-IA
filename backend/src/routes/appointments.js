import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant, requirePermission } from '../middleware/auth.js'
import { createEvent, cancelEvent, listEvents, updateEvent } from '../services/googleCalendar.js'
import { logUsage } from '../services/usage.js'

export const appointmentsRouter = Router()
appointmentsRouter.use(requireAuth, requireTenant, requirePermission('agenda'))

// ─── GET /api/appointments ───
appointmentsRouter.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000)
  const offset = parseInt(req.query.offset, 10) || 0

  const rows = await withTenant(req.user.tenantId, async (client) => {
    const r = await client.query(
      `SELECT id, lead_id, lead_name, title, provider, external_id, start_time, end_time, meeting_link, status
       FROM appointments WHERE tenant_id = $1
       ORDER BY start_time DESC LIMIT $2 OFFSET $3`,
      [req.user.tenantId, limit, offset]
    )
    return r.rows
  })
  res.json({ appointments: rows, limit, offset })
})

// ─── POST /api/appointments/sync ─── importa eventos do Google Calendar
appointmentsRouter.post('/sync', async (req, res) => {
  try {
    const timeMin = new Date()
    timeMin.setMonth(timeMin.getMonth() - 1) // 1 mês atrás
    const timeMax = new Date()
    timeMax.setMonth(timeMax.getMonth() + 3) // 3 meses à frente

    const events = await listEvents(req.user.tenantId, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 200,
      showDeleted: true,
    })

    const synced = await withTenant(req.user.tenantId, async (client) => {
      // busca external_ids já existentes para não duplicar
      const existingR = await client.query(
        "SELECT id, external_id, status FROM appointments WHERE tenant_id = $1 AND external_id IS NOT NULL",
        [req.user.tenantId]
      )
      const existingMap = Object.fromEntries(existingR.rows.map((r) => [r.external_id, r]))

      let synced = 0
      for (const ev of events) {
        if (!ev.externalId) continue
        const status = ev.status === 'cancelled' ? 'cancelled' : 'scheduled'

        if (existingMap[ev.externalId]) {
          // atualiza dados que podem ter mudado
          await client.query(
            `UPDATE appointments SET title = $1, start_time = $2, end_time = $3, meeting_link = $4, status = $5
             WHERE id = $6`,
            [ev.title || '(sem título)', ev.start, ev.end, ev.meetingLink || null, status, existingMap[ev.externalId].id]
          )
        } else {
          // insere novo evento vindo do Google Calendar
          await client.query(
            `INSERT INTO appointments (tenant_id, title, provider, external_id, start_time, end_time, meeting_link, status)
             VALUES ($1, $2, 'google', $3, $4, $5, $6, $7)`,
            [req.user.tenantId, ev.title || '(sem título)', ev.externalId, ev.start, ev.end, ev.meetingLink || null, status]
          )
        }
        synced++
      }
      return synced
    })

    res.json({ synced })
  } catch (e) {
    const msg = e.message || ''
    console.error('[appointments/sync] erro:', msg)
    if (msg.includes('não conectado') || msg.includes('Google OAuth não configurado'))
      return res.json({ synced: 0, warning: 'Google Calendar não conectado. Reconecte em Integrações.' })
    if (msg.includes('invalid_grant') || msg.includes('Token has been expired') || msg.includes('token expired'))
      return res.json({ synced: 0, warning: 'Acesso ao Google Calendar expirado. Reconecte em Integrações.' })
    if (msg.includes('ENCRYPTION_KEY'))
      return res.status(500).json({ error: 'ENCRYPTION_KEY não configurada no servidor.' })
    res.status(500).json({ error: 'Falha ao sincronizar com Google Calendar: ' + msg })
  }
})

// ─── POST /api/appointments ───
const createSchema = z.object({
  title: z.string().min(1),
  leadName: z.string().optional(),
  leadId: z.string().uuid().optional(),
  start: z.string(),
  end: z.string(),
})

appointmentsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
  const d = parsed.data

  try {
    const ev = await createEvent(req.user.tenantId, {
      summary: d.title,
      description: 'Agendado pelo painel SDR IA.',
      start: d.start,
      end: d.end,
    })
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO appointments (tenant_id, lead_id, lead_name, title, provider, external_id, start_time, end_time, meeting_link, status)
         VALUES ($1, $2, $3, $4, 'google', $5, $6, $7, $8, 'scheduled')
         RETURNING *`,
        [req.user.tenantId, d.leadId || null, d.leadName || null, d.title, ev.externalId, d.start, d.end, ev.meetingLink]
      )
      return r.rows[0]
    })
    await logUsage(req.user.tenantId, req.user.id, 'appointment_created')
    res.status(201).json({ appointment: row, meetingLink: ev.meetingLink })
  } catch (e) {
    res.status(502).json({ error: 'Falha ao criar evento: ' + e.message })
  }
})

// ─── PATCH /api/appointments/:id ─── reagendar (muda horário/título sem perder histórico)
const rescheduleSchema = z.object({
  title: z.string().min(1).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
}).refine((d) => d.title || d.start || d.end, { message: 'Informe ao menos um campo para atualizar.' })

appointmentsRouter.patch('/:id', async (req, res) => {
  const parsed = rescheduleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' })
  const d = parsed.data

  const current = await withTenant(req.user.tenantId, async (client) => {
    const r = await client.query(
      'SELECT external_id, status FROM appointments WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [req.params.id, req.user.tenantId]
    )
    return r.rows[0]
  })
  if (!current) return res.status(404).json({ error: 'Reunião não encontrada.' })
  if (current.status === 'cancelled') return res.status(400).json({ error: 'Não é possível reagendar uma reunião cancelada.' })

  const patch = { updated_at: new Date().toISOString() }
  if (d.title) patch.title = d.title
  if (d.start) patch.start_time = d.start
  if (d.end) patch.end_time = d.end

  try {
    if (current.external_id) {
      const ev = await updateEvent(req.user.tenantId, current.external_id, { summary: d.title, start: d.start, end: d.end })
      if (ev.meetingLink) patch.meeting_link = ev.meetingLink
    }
    const row = await withTenant(req.user.tenantId, async (client) => {
      const columns = Object.keys(patch)
      const setClauses = columns.map((c, i) => `${c} = $${i + 1}`)
      const values = columns.map((c) => patch[c])
      values.push(req.params.id, req.user.tenantId)
      const r = await client.query(
        `UPDATE appointments SET ${setClauses.join(', ')}
         WHERE id = $${columns.length + 1} AND tenant_id = $${columns.length + 2}
         RETURNING *`,
        values
      )
      return r.rows[0]
    })
    res.json({ appointment: row })
  } catch (e) {
    res.status(502).json({ error: 'Falha ao reagendar evento: ' + e.message })
  }
})

// ─── POST /api/appointments/:id/cancel ───
appointmentsRouter.post('/:id/cancel', async (req, res) => {
  const current = await withTenant(req.user.tenantId, async (client) => {
    const r = await client.query(
      'SELECT external_id FROM appointments WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [req.params.id, req.user.tenantId]
    )
    return r.rows[0]
  })
  if (!current) return res.status(404).json({ error: 'Reunião não encontrada.' })

  if (current.external_id) {
    try {
      await cancelEvent(req.user.tenantId, current.external_id)
    } catch (e) {
      console.warn('[appts] falha ao cancelar no Google:', e.message)
    }
  }
  await withTenant(req.user.tenantId, (client) =>
    client.query(
      "UPDATE appointments SET status = 'cancelled' WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.user.tenantId]
    )
  )
  res.json({ cancelled: true })
})
