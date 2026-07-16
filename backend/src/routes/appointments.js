import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant, requirePermission } from '../middleware/auth.js'
import { createEvent, cancelEvent, listEvents, updateEvent, isConnected } from '../services/googleCalendar.js'
import { expandRecurrence, ruleToGoogleRRule } from '../services/recurrence.js'
import { logUsage } from '../services/usage.js'

export const appointmentsRouter = Router()
appointmentsRouter.use(requireAuth, requireTenant, requirePermission('agenda'))

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

const recurrenceSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().positive().max(365).optional(),
  byDay: z.array(z.enum(WEEKDAY_CODES)).optional(),
  count: z.number().int().positive().max(500).optional(),
  until: z.string().optional(),
}).nullish()

const guestSchema = z.union([
  z.string().email(),
  z.object({ email: z.string().email(), name: z.string().optional() }),
])

const reminderSchema = z.object({
  method: z.enum(['popup', 'email']).default('popup'),
  minutesBefore: z.number().int().min(0).max(40320), // até 4 semanas antes, mesmo teto do Google
})

/** Normaliza convidados pra sempre virar [{email, name?, status}]. */
function normalizeGuests(guests = []) {
  return guests.map((g) => (typeof g === 'string' ? { email: g, status: 'needsAction' } : { email: g.email, name: g.name, status: 'needsAction' }))
}

// ─── GET /api/appointments ───
appointmentsRouter.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000)
  const offset = parseInt(req.query.offset, 10) || 0

  const rows = await withTenant(req.user.tenantId, async (client) => {
    const conditions = ['tenant_id = $1']
    const params = [req.user.tenantId]
    if (req.query.from) { params.push(req.query.from); conditions.push(`start_time >= $${params.length}`) }
    if (req.query.to) { params.push(req.query.to); conditions.push(`start_time <= $${params.length}`) }
    params.push(limit, offset)
    const r = await client.query(
      `SELECT id, lead_id, lead_name, title, provider, external_id, start_time, end_time, meeting_link, status,
              description, location, color, all_day, timezone, guests, recurrence_rule, recurrence_parent_id
       FROM appointments WHERE ${conditions.join(' AND ')}
       ORDER BY start_time DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )
    return r.rows
  })
  res.json({ appointments: rows, limit, offset })
})

// ─── sincronização com o Google Calendar (usada por /sync e por POST / quando há série recorrente) ───
async function syncFromGoogle(tenantId) {
  const timeMin = new Date()
  timeMin.setMonth(timeMin.getMonth() - 1) // 1 mês atrás
  const timeMax = new Date()
  timeMax.setMonth(timeMax.getMonth() + 12) // 1 ano à frente — cobre a maior parte das séries recorrentes criadas pela plataforma

  const events = await listEvents(tenantId, {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: 500,
    showDeleted: true,
  })

  return withTenant(tenantId, async (client) => {
    // busca external_ids já existentes para não duplicar
    const existingR = await client.query(
      "SELECT id, external_id, status FROM appointments WHERE tenant_id = $1 AND external_id IS NOT NULL",
      [tenantId]
    )
    const existingMap = Object.fromEntries(existingR.rows.map((r) => [r.external_id, r]))

    let synced = 0
    for (const ev of events) {
      if (!ev.externalId) continue
      const status = ev.status === 'cancelled' ? 'cancelled' : 'scheduled'
      const guestsJson = JSON.stringify((ev.guests || []).map((g) => ({ email: g.email, name: g.name, status: g.status })))

      if (existingMap[ev.externalId]) {
        // atualiza dados que podem ter mudado
        await client.query(
          `UPDATE appointments SET title = $1, start_time = $2, end_time = $3, meeting_link = $4, status = $5,
             description = $6, location = $7, all_day = $8, guests = $9::jsonb, google_recurring_event_id = $10
           WHERE id = $11`,
          [ev.title || '(sem título)', ev.start, ev.end, ev.meetingLink || null, status,
            ev.description || null, ev.location || null, !!ev.allDay, guestsJson, ev.recurringEventId || null,
            existingMap[ev.externalId].id]
        )
      } else {
        // insere novo evento vindo do Google Calendar
        await client.query(
          `INSERT INTO appointments (tenant_id, title, provider, external_id, start_time, end_time, meeting_link, status,
             description, location, all_day, guests, google_recurring_event_id)
           VALUES ($1, $2, 'google', $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
          [tenantId, ev.title || '(sem título)', ev.externalId, ev.start, ev.end, ev.meetingLink || null, status,
            ev.description || null, ev.location || null, !!ev.allDay, guestsJson, ev.recurringEventId || null]
        )
      }
      synced++
    }
    return synced
  })
}

// ─── POST /api/appointments/sync ─── importa eventos do Google Calendar
appointmentsRouter.post('/sync', async (req, res) => {
  try {
    const synced = await syncFromGoogle(req.user.tenantId)
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

// ─── lembretes ───
async function createReminders(tenantId, rows, reminders) {
  if (!reminders?.length || !rows.length) return
  await withTenant(tenantId, async (client) => {
    for (const row of rows) {
      const startTime = new Date(row.start_time)
      for (const r of reminders) {
        const fireAt = new Date(startTime.getTime() - r.minutesBefore * 60_000)
        await client.query(
          `INSERT INTO appointment_reminders (tenant_id, appointment_id, method, minutes_before, fire_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, row.id, r.method || 'popup', r.minutesBefore, fireAt.toISOString()]
        )
      }
    }
  })
}

async function replaceReminders(tenantId, rows, reminders) {
  if (!rows.length) return
  await withTenant(tenantId, (client) =>
    client.query(
      `DELETE FROM appointment_reminders WHERE tenant_id = $1 AND appointment_id = ANY($2::uuid[]) AND NOT fired`,
      [tenantId, rows.map((r) => r.id)]
    )
  )
  await createReminders(tenantId, rows, reminders)
}

// ─── insere uma única linha (agendamento local-first) ───
async function insertAppointmentRow(client, tenantId, d, opts) {
  const { provider = 'local', externalId = null, meetingLink = null, googleRecurringEventId = null, start, end, guests, allDay, timezone, assigneeId = null } = opts
  const r = await client.query(
    `INSERT INTO appointments (tenant_id, lead_id, lead_name, title, provider, external_id, start_time, end_time,
       meeting_link, status, description, location, color, all_day, timezone, guests, google_recurring_event_id,
       recurrence_rule, recurrence_parent_id, assignee_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'scheduled',$10,$11,$12,$13,$14,$15::jsonb,$16,$17::jsonb,$18,$19)
     RETURNING *`,
    [
      tenantId, d.leadId || null, d.leadName || null, d.title, provider, externalId, start, end, meetingLink,
      d.description || null, d.location || null, d.color || null, allDay, timezone, JSON.stringify(guests),
      googleRecurringEventId, opts.recurrenceRule ? JSON.stringify(opts.recurrenceRule) : null, opts.recurrenceParentId || null,
      assigneeId,
    ]
  )
  return r.rows[0]
}

// ─── POST /api/appointments ───
const createSchema = z.object({
  title: z.string().min(1),
  leadName: z.string().optional(),
  leadId: z.string().uuid().optional(),
  start: z.string(),
  end: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  color: z.string().optional(),
  allDay: z.boolean().optional(),
  timezone: z.string().optional(),
  guests: z.array(guestSchema).optional(),
  reminders: z.array(reminderSchema).optional(),
  recurrence: recurrenceSchema,
})

appointmentsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' })
  const d = parsed.data
  const guests = normalizeGuests(d.guests)
  const allDay = !!d.allDay
  const timezone = d.timezone || 'America/Sao_Paulo'

  // agendamento é sempre local-first: se o Google estiver conectado, tenta
  // sincronizar como um plus (link de Meet real, convite por e-mail via
  // Google); se falhar ou não estiver conectado, segue só na plataforma.
  const connected = await isConnected(req.user.tenantId).catch(() => false)
  let googleResult = null
  let warning = null
  if (connected) {
    try {
      googleResult = await createEvent(req.user.tenantId, {
        summary: d.title, description: d.description, location: d.location,
        start: d.start, end: d.end, attendees: guests, timeZone: timezone, allDay,
        recurrence: d.recurrence ? ruleToGoogleRRule(d.recurrence) : null,
        reminders: d.reminders,
      })
    } catch (e) {
      console.warn('[appointments] falha ao criar no Google, mantendo local:', e.message)
      warning = 'Não foi possível sincronizar com o Google Calendar; o agendamento foi salvo só na plataforma.'
    }
  }

  try {
    let rows

    if (googleResult && d.recurrence) {
      // série recorrente do Google: o Google expande as instâncias do lado
      // dele — puxamos via sync (que já faz upsert por external_id/singleEvents)
      await syncFromGoogle(req.user.tenantId)
      const seriesId = googleResult.recurringEventId || googleResult.externalId
      rows = await withTenant(req.user.tenantId, async (client) => {
        await client.query(
          `UPDATE appointments SET lead_id = $1, lead_name = $2, color = $3, assignee_id = $4
           WHERE tenant_id = $5 AND (external_id = $6 OR google_recurring_event_id = $6)`,
          [d.leadId || null, d.leadName || null, d.color || null, req.user.id, req.user.tenantId, seriesId]
        )
        const r = await client.query(
          `SELECT * FROM appointments WHERE tenant_id = $1 AND (external_id = $2 OR google_recurring_event_id = $2)
           ORDER BY start_time`,
          [req.user.tenantId, seriesId]
        )
        return r.rows
      })
      if (!rows.length) {
        // a série caiu fora da janela padrão de sync (raro) — garante ao menos a 1ª ocorrência
        rows = [await withTenant(req.user.tenantId, (client) => insertAppointmentRow(client, req.user.tenantId, d, {
          provider: 'google', externalId: googleResult.externalId, meetingLink: googleResult.meetingLink,
          googleRecurringEventId: googleResult.recurringEventId || googleResult.externalId,
          start: d.start, end: d.end, guests, allDay, timezone, assigneeId: req.user.id,
        }))]
      }
    } else if (googleResult) {
      rows = [await withTenant(req.user.tenantId, (client) => insertAppointmentRow(client, req.user.tenantId, d, {
        provider: 'google', externalId: googleResult.externalId, meetingLink: googleResult.meetingLink,
        start: d.start, end: d.end, guests, allDay, timezone, assigneeId: req.user.id,
      }))]
    } else if (d.recurrence) {
      // sem Google: materializa a série localmente (teto de 200 ocorrências,
      // ou 2 anos à frente quando a regra não tem count/until definidos)
      const horizonEnd = !d.recurrence.count && !d.recurrence.until
        ? new Date(new Date(d.start).getTime() + 2 * YEAR_MS).toISOString()
        : undefined
      const occurrences = expandRecurrence({ start: d.start, end: d.end, rule: d.recurrence, maxOccurrences: 200, horizonEnd })
      rows = await withTenant(req.user.tenantId, async (client) => {
        const inserted = []
        let masterId = null
        for (let i = 0; i < occurrences.length; i++) {
          const occ = occurrences[i]
          const row = await insertAppointmentRow(client, req.user.tenantId, d, {
            start: occ.start.toISOString(), end: occ.end.toISOString(), guests, allDay, timezone, assigneeId: req.user.id,
            recurrenceRule: i === 0 && occurrences.length > 1 ? d.recurrence : null,
            recurrenceParentId: i === 0 ? null : masterId,
          })
          if (i === 0) masterId = row.id
          inserted.push(row)
        }
        return inserted
      })
    } else {
      rows = [await withTenant(req.user.tenantId, (client) => insertAppointmentRow(client, req.user.tenantId, d, {
        start: d.start, end: d.end, guests, allDay, timezone, assigneeId: req.user.id,
      }))]
    }

    if (!rows.length) throw new Error('Nenhum agendamento foi criado.')
    await createReminders(req.user.tenantId, rows, d.reminders)
    await logUsage(req.user.tenantId, req.user.id, 'appointment_created')

    res.status(201).json({
      appointment: rows[0],
      occurrences: rows.length,
      meetingLink: googleResult?.meetingLink || rows[0].meeting_link || null,
      warning,
    })
  } catch (e) {
    res.status(500).json({ error: 'Falha ao criar agendamento: ' + e.message })
  }
})

// ─── PATCH /api/appointments/:id ─── editar/reagendar (muda campos sem perder histórico)
const rescheduleSchema = z.object({
  title: z.string().min(1).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  color: z.string().optional(),
  guests: z.array(guestSchema).optional(),
  reminders: z.array(reminderSchema).optional(),
  scope: z.enum(['this', 'following', 'all']).optional(),
}).refine(
  (d) => d.title || d.start || d.end || d.description !== undefined || d.location !== undefined || d.color !== undefined || d.guests || d.reminders,
  { message: 'Informe ao menos um campo para atualizar.' }
)

appointmentsRouter.patch('/:id', async (req, res) => {
  const parsed = rescheduleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' })
  const d = parsed.data
  const scope = d.scope || 'this'

  const current = await withTenant(req.user.tenantId, async (client) => {
    const r = await client.query(
      `SELECT id, external_id, status, recurrence_parent_id, google_recurring_event_id, start_time
       FROM appointments WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.params.id, req.user.tenantId]
    )
    return r.rows[0]
  })
  if (!current) return res.status(404).json({ error: 'Reunião não encontrada.' })
  if (current.status === 'cancelled') return res.status(400).json({ error: 'Não é possível reagendar uma reunião cancelada.' })
  if (current.google_recurring_event_id && scope !== 'this') {
    return res.status(400).json({ error: 'Por enquanto só é possível editar "somente este evento" em séries sincronizadas com o Google.' })
  }

  const guests = d.guests !== undefined ? normalizeGuests(d.guests) : undefined

  // appointments não tem coluna updated_at (nunca teve — ver schema.sql)
  const patch = {}
  if (d.title) patch.title = d.title
  if (d.start) patch.start_time = d.start
  if (d.end) patch.end_time = d.end
  if (d.description !== undefined) patch.description = d.description
  if (d.location !== undefined) patch.location = d.location
  if (d.color !== undefined) patch.color = d.color
  if (guests !== undefined) patch.guests = JSON.stringify(guests)

  try {
    if (current.external_id) {
      const ev = await updateEvent(req.user.tenantId, current.external_id, {
        summary: d.title, start: d.start, end: d.end, description: d.description, location: d.location,
        attendees: guests, reminders: d.reminders,
      })
      if (ev.meetingLink) patch.meeting_link = ev.meetingLink
    }

    // quando o PATCH só traz `reminders` (sem título/horário/descrição/etc),
    // patch fica vazio — não há SET válido, então só busca as linhas alvo sem UPDATE
    const columns = Object.keys(patch)

    let rows
    if (scope === 'this') {
      rows = await withTenant(req.user.tenantId, async (client) => {
        if (!columns.length) {
          const r = await client.query(
            'SELECT * FROM appointments WHERE id = $1 AND tenant_id = $2',
            [req.params.id, req.user.tenantId]
          )
          return r.rows
        }
        const setClauses = columns.map((c, i) => `${c} = $${i + 1}`)
        const values = columns.map((c) => patch[c])
        values.push(req.params.id, req.user.tenantId)
        const r = await client.query(
          `UPDATE appointments SET ${setClauses.join(', ')}
           WHERE id = $${columns.length + 1} AND tenant_id = $${columns.length + 2}
           RETURNING *`,
          values
        )
        return r.rows
      })
    } else {
      const masterId = current.recurrence_parent_id || current.id
      rows = await withTenant(req.user.tenantId, async (client) => {
        if (!columns.length) {
          const params = [req.user.tenantId, masterId]
          let where = `tenant_id = $1 AND (id = $2 OR recurrence_parent_id = $2)`
          if (scope === 'following') { params.push(current.start_time); where += ` AND start_time >= $3` }
          const r = await client.query(`SELECT * FROM appointments WHERE ${where}`, params)
          return r.rows
        }
        const setClauses = columns.map((c, i) => `${c} = $${i + 1}`)
        const values = columns.map((c) => patch[c])
        values.push(req.user.tenantId, masterId)
        let where = `tenant_id = $${values.length - 1} AND (id = $${values.length} OR recurrence_parent_id = $${values.length})`
        if (scope === 'following') {
          values.push(current.start_time)
          where += ` AND start_time >= $${values.length}`
        }
        const r = await client.query(`UPDATE appointments SET ${setClauses.join(', ')} WHERE ${where} RETURNING *`, values)
        return r.rows
      })
    }

    if (d.reminders) await replaceReminders(req.user.tenantId, rows, d.reminders)

    res.json({ appointment: rows[0], updated: rows.length })
  } catch (e) {
    res.status(502).json({ error: 'Falha ao reagendar evento: ' + e.message })
  }
})

// ─── POST /api/appointments/:id/cancel ───
appointmentsRouter.post('/:id/cancel', async (req, res) => {
  const scope = ['this', 'following', 'all'].includes(req.body?.scope) ? req.body.scope : 'this'

  const current = await withTenant(req.user.tenantId, async (client) => {
    const r = await client.query(
      `SELECT external_id, recurrence_parent_id, google_recurring_event_id, start_time
       FROM appointments WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.params.id, req.user.tenantId]
    )
    return r.rows[0]
  })
  if (!current) return res.status(404).json({ error: 'Reunião não encontrada.' })
  if (current.google_recurring_event_id && scope !== 'this') {
    return res.status(400).json({ error: 'Por enquanto só é possível cancelar "somente este evento" em séries sincronizadas com o Google.' })
  }

  if (current.external_id) {
    try {
      await cancelEvent(req.user.tenantId, current.external_id)
    } catch (e) {
      console.warn('[appts] falha ao cancelar no Google:', e.message)
    }
  }

  await withTenant(req.user.tenantId, async (client) => {
    if (scope === 'this') {
      return client.query(
        "UPDATE appointments SET status = 'cancelled' WHERE id = $1 AND tenant_id = $2",
        [req.params.id, req.user.tenantId]
      )
    }
    const masterId = current.recurrence_parent_id || req.params.id
    if (scope === 'all') {
      return client.query(
        "UPDATE appointments SET status = 'cancelled' WHERE tenant_id = $1 AND (id = $2 OR recurrence_parent_id = $2)",
        [req.user.tenantId, masterId]
      )
    }
    return client.query(
      "UPDATE appointments SET status = 'cancelled' WHERE tenant_id = $1 AND (id = $2 OR recurrence_parent_id = $2) AND start_time >= $3",
      [req.user.tenantId, masterId, current.start_time]
    )
  })
  res.json({ cancelled: true })
})
