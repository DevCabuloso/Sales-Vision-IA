import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const reportsRouter = Router()
reportsRouter.use(requireAuth, requireTenant)

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  }
  next()
}

const TENANT_TZ_OFFSET_HOURS = 3 // America/Sao_Paulo (GMT-3), sem horário de verão

function todayDateStr() {
  const now = new Date(Date.now() - TENANT_TZ_OFFSET_HOURS * 3600 * 1000)
  return now.toISOString().slice(0, 10)
}

function dayRangeUtc(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d, TENANT_TZ_OFFSET_HOURS, 0, 0))
  const end = new Date(Date.UTC(y, m - 1, d + 1, TENANT_TZ_OFFSET_HOURS, 0, 0))
  return { start: start.toISOString(), end: end.toISOString() }
}

// Agregação do dia (summary/byUser/funnel), extraída pra ser reaproveitada
// tanto pela rota GET /daily quanto pelo job de relatório agendado por
// e-mail (scheduler.js runDueScheduledReports, que soma vários dias).
export async function buildDailyReport(tenantId, dateStr) {
  const { start, end } = dayRangeUtc(dateStr)

  const { users, ticketLogs, leadsToday, messagesToday, apptsToday, usageEvents, stageCountRows, touchedLeads } =
    await withTenant(tenantId, async (client) => {
        const [usersR, ticketLogsR, leadsTodayR, messagesTodayR, apptsTodayR, usageEventsR, stageCountR] = await Promise.all([
          client.query(
            "SELECT id, name, email, role FROM users WHERE tenant_id = $1 AND role != 'owner'",
            [tenantId]
          ),
          client.query(
            `SELECT lead_id, user_id, user_name, action, to_user_id, to_user_name, created_at
             FROM ticket_logs WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3
             ORDER BY created_at ASC`,
            [tenantId, start, end]
          ),
          client.query(
            `SELECT id, name, phone, stage, score, created_at
             FROM leads WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3`,
            [tenantId, start, end]
          ),
          client.query(
            'SELECT role, created_at FROM messages WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3',
            [tenantId, start, end]
          ),
          client.query(
            `SELECT id, lead_id, lead_name, start_time
             FROM appointments WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3`,
            [tenantId, start, end]
          ),
          client.query(
            `SELECT user_id, event_type, meta, created_at
             FROM usage_events WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3`,
            [tenantId, start, end]
          ),
          // GROUP BY feito no banco (RPC) em vez de buscar até 20.000 linhas de
          // `stage` e agregar em JS a cada chamada.
          client.query('SELECT * FROM leads_stage_counts($1)', [tenantId]),
        ])

        // leads tocados hoje via ticket_logs podem ter sido criados em dias anteriores
        const touchedIds = [...new Set(ticketLogsR.rows.map((l) => l.lead_id).filter(Boolean))]
        const touchedLeadsR = touchedIds.length
          ? await client.query(
              'SELECT id, name, phone, stage FROM leads WHERE tenant_id = $1 AND id = ANY($2::uuid[])',
              [tenantId, touchedIds]
            )
          : { rows: [] }

        return {
          users: usersR.rows,
          ticketLogs: ticketLogsR.rows,
          leadsToday: leadsTodayR.rows,
          messagesToday: messagesTodayR.rows,
          apptsToday: apptsTodayR.rows,
          usageEvents: usageEventsR.rows,
          stageCountRows: stageCountR.rows,
          touchedLeads: touchedLeadsR.rows,
        }
      })

    const leadById = new Map([...touchedLeads, ...leadsToday].map((l) => [l.id, l]))

    // ── agregação por usuário ──
    const byUserMap = new Map()
    function ensureUser(id, fallbackName) {
      if (!id) return null
      if (!byUserMap.has(id)) {
        byUserMap.set(id, {
          userId: id, name: fallbackName || 'Usuário', email: '',
          leadsAttended: new Map(),
          conversationsResolved: 0, conversationsTransferred: 0,
          messagesSent: 0, appointmentsCreated: 0, leadsCreated: 0, humanTakeovers: 0,
        })
      }
      return byUserMap.get(id)
    }
    for (const u of users) {
      ensureUser(u.id, u.name || u.email)
      byUserMap.get(u.id).email = u.email
    }

    for (const log of ticketLogs) {
      const lead = leadById.get(log.lead_id)
      const clientInfo = {
        leadId: log.lead_id,
        leadName: lead?.name || 'Lead sem nome',
        phone: lead?.phone || '',
        stage: lead?.stage || '—',
        lastAction: log.action,
        lastActionAt: log.created_at,
      }
      const actor = ensureUser(log.user_id, log.user_name)
      if (actor) {
        actor.leadsAttended.set(log.lead_id, clientInfo)
        if (log.action === 'closed') actor.conversationsResolved++
        if (log.action === 'transferred') actor.conversationsTransferred++
      }
      if (log.to_user_id) {
        const receiver = ensureUser(log.to_user_id, log.to_user_name)
        receiver.leadsAttended.set(log.lead_id, { ...clientInfo, lastAction: `recebeu de ${log.user_name || 'outro atendente'}` })
      }
    }

    for (const ev of usageEvents) {
      const u = ensureUser(ev.user_id, null)
      if (!u) continue
      if (ev.event_type === 'message_sent')      u.messagesSent++
      if (ev.event_type === 'appointment_created') u.appointmentsCreated++
      if (ev.event_type === 'lead_created')        u.leadsCreated++
      if (ev.event_type === 'human_takeover')      u.humanTakeovers++
    }

    const byUser = [...byUserMap.values()]
      .map((u) => ({
        userId: u.userId,
        name: u.name,
        email: u.email,
        leadsAttended: [...u.leadsAttended.values()].sort((a, b) => new Date(b.lastActionAt) - new Date(a.lastActionAt)),
        conversationsResolved: u.conversationsResolved,
        conversationsTransferred: u.conversationsTransferred,
        messagesSent: u.messagesSent,
        appointmentsCreated: u.appointmentsCreated,
        leadsCreated: u.leadsCreated,
        humanTakeovers: u.humanTakeovers,
      }))
      .sort((a, b) => b.leadsAttended.length - a.leadsAttended.length || b.messagesSent - a.messagesSent)

    // ── resumo geral ──
    const messagesByRole = {}
    for (const m of messagesToday) messagesByRole[m.role] = (messagesByRole[m.role] || 0) + 1

    const funnel = stageCountRows
      .map((r) => ({ stage: r.stage, count: Number(r.count) }))
      .sort((a, b) => b.count - a.count)

    const summary = {
      newLeads: leadsToday.length,
      qualifiedNewLeads: leadsToday.filter((l) => (l.score ?? 0) >= 70).length,
      conversationsOpened: ticketLogs.filter((l) => l.action === 'opened').length,
      conversationsResolved: ticketLogs.filter((l) => l.action === 'closed').length,
      conversationsTransferred: ticketLogs.filter((l) => l.action === 'transferred').length,
      appointmentsScheduled: apptsToday.length,
      messages: {
        total: messagesToday.length,
        fromLeads:  messagesByRole.lead  || 0,
        fromAI:     messagesByRole.ai    || 0,
        fromAgents: messagesByRole.agent || 0,
      },
    }

  return { date: dateStr, summary, byUser, funnel }
}

// GET /api/reports/daily?date=YYYY-MM-DD
reportsRouter.get('/daily', async (req, res) => {
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayDateStr()
  try {
    const report = await buildDailyReport(req.user.tenantId, dateStr)
    res.json(report)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const DEFAULT_SCHEDULE = { active: false, recipients: [], day_of_week: 1, hour: 8, minute: 0, timezone: 'America/Sao_Paulo' }

const scheduleSchema = z.object({
  active:      z.boolean().optional(),
  recipients:  z.array(z.string().email()).max(20).optional(),
  day_of_week: z.number().int().min(0).max(6).optional(),
  hour:        z.number().int().min(0).max(23).optional(),
  minute:      z.number().int().min(0).max(59).optional(),
  timezone:    z.string().min(1).optional(),
})

// GET /api/reports/schedule — configuração do relatório semanal por e-mail
reportsRouter.get('/schedule', requireAdmin, async (req, res) => {
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query('SELECT * FROM report_schedules WHERE tenant_id = $1 LIMIT 1', [req.user.tenantId])
      return r.rows[0]
    })
    res.json({ schedule: row || { tenant_id: req.user.tenantId, ...DEFAULT_SCHEDULE } })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/reports/schedule
reportsRouter.put('/schedule', requireAdmin, async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const data = { ...DEFAULT_SCHEDULE, ...parsed.data }
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO report_schedules (tenant_id, active, recipients, day_of_week, hour, minute, timezone, updated_at)
         VALUES ($1, $2, $3::text[], $4, $5, $6, $7, now())
         ON CONFLICT (tenant_id) DO UPDATE SET
           active = EXCLUDED.active, recipients = EXCLUDED.recipients, day_of_week = EXCLUDED.day_of_week,
           hour = EXCLUDED.hour, minute = EXCLUDED.minute, timezone = EXCLUDED.timezone, updated_at = now()
         RETURNING *`,
        [req.user.tenantId, data.active, data.recipients, data.day_of_week, data.hour, data.minute, data.timezone]
      )
      return r.rows[0]
    })
    res.json({ schedule: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
