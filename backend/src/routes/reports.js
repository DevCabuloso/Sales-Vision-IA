import { Router } from 'express'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const reportsRouter = Router()
reportsRouter.use(requireAuth, requireTenant)

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

// GET /api/reports/daily?date=YYYY-MM-DD
reportsRouter.get('/daily', async (req, res) => {
  const tenantId = req.user.tenantId
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayDateStr()
  const { start, end } = dayRangeUtc(dateStr)

  try {
    const [users, ticketLogs, leadsToday, messagesToday, apptsToday, usageEvents, stageRows] = await Promise.all([
      supabase.from('users').select('id, name, email, role')
        .eq('tenant_id', tenantId).neq('role', 'owner'),
      supabase.from('ticket_logs').select('lead_id, user_id, user_name, action, to_user_id, to_user_name, created_at')
        .eq('tenant_id', tenantId).gte('created_at', start).lt('created_at', end)
        .order('created_at', { ascending: true }),
      supabase.from('leads').select('id, name, phone, stage, score, created_at')
        .eq('tenant_id', tenantId).gte('created_at', start).lt('created_at', end),
      supabase.from('messages').select('role, created_at')
        .eq('tenant_id', tenantId).gte('created_at', start).lt('created_at', end),
      supabase.from('appointments').select('id, lead_id, lead_name, start_time')
        .eq('tenant_id', tenantId).gte('created_at', start).lt('created_at', end),
      supabase.from('usage_events').select('user_id, event_type, meta, created_at')
        .eq('tenant_id', tenantId).gte('created_at', start).lt('created_at', end),
      supabase.from('leads').select('stage').eq('tenant_id', tenantId),
    ]).then((rs) => rs.map(unwrap))

    // leads tocados hoje via ticket_logs podem ter sido criados em dias anteriores
    const touchedIds = [...new Set(ticketLogs.map((l) => l.lead_id).filter(Boolean))]
    const touchedLeads = touchedIds.length
      ? unwrap(await supabase.from('leads').select('id, name, phone, stage').eq('tenant_id', tenantId).in('id', touchedIds))
      : []
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

    const stageCounts = {}
    for (const l of stageRows) { const s = l.stage || 'Novo Lead'; stageCounts[s] = (stageCounts[s] || 0) + 1 }
    const funnel = Object.entries(stageCounts)
      .map(([stage, count]) => ({ stage, count }))
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

    res.json({ date: dateStr, summary, byUser, funnel })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
