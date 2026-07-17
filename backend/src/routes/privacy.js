import { Router } from 'express'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { logAudit } from '../services/usage.js'

export const privacyRouter = Router()
privacyRouter.use(requireAuth, requireTenant)

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  }
  next()
}

// GET /api/privacy/export/:leadId — reúne todos os dados pessoais ligados a
// um lead/contato (mesma tabela `leads`, só vista por rotas diferentes) e
// devolve como um único arquivo JSON para download — atende ao pedido de
// portabilidade de dados (LGPD art. 18 / GDPR art. 20).
privacyRouter.get('/export/:leadId', requireAdmin, async (req, res) => {
  try {
    const data = await withTenant(req.user.tenantId, async (client) => {
      const leadR = await client.query('SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1', [req.params.leadId, req.user.tenantId])
      if (!leadR.rows.length) return null

      const [messagesR, appointmentsR, ticketLogsR, stageHistoryR, followupEnrollmentsR, flowSessionsR] = await Promise.all([
        client.query('SELECT * FROM messages WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at ASC', [req.params.leadId, req.user.tenantId]),
        client.query('SELECT * FROM appointments WHERE lead_id = $1 AND tenant_id = $2 ORDER BY start_time ASC', [req.params.leadId, req.user.tenantId]),
        client.query('SELECT * FROM ticket_logs WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at ASC', [req.params.leadId, req.user.tenantId]),
        client.query('SELECT * FROM lead_stage_history WHERE lead_id = $1 AND tenant_id = $2 ORDER BY changed_at ASC', [req.params.leadId, req.user.tenantId]),
        client.query('SELECT * FROM followup_enrollments WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at ASC', [req.params.leadId, req.user.tenantId]),
        client.query('SELECT * FROM flow_sessions WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at ASC', [req.params.leadId, req.user.tenantId]),
      ])

      return {
        lead: leadR.rows[0],
        messages: messagesR.rows,
        appointments: appointmentsR.rows,
        ticketLogs: ticketLogsR.rows,
        stageHistory: stageHistoryR.rows,
        followupEnrollments: followupEnrollmentsR.rows,
        flowSessions: flowSessionsR.rows,
      }
    })
    if (!data) return res.status(404).json({ error: 'Lead não encontrado.' })

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="dados-lead-${req.params.leadId}.json"`)
    res.send(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const ERASED_TEXT = '[dado removido - LGPD]'

// POST /api/privacy/erase/:leadId — anonimiza um lead/contato a pedido do
// titular. NÃO deleta linhas (preservaria integridade de relatórios
// agregados) — sobrescreve os campos com dado pessoal e marca `erased_at`.
privacyRouter.post('/erase/:leadId', requireAdmin, async (req, res) => {
  try {
    const lead = await withTenant(req.user.tenantId, async (client) => {
      const existsR = await client.query('SELECT id FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1', [req.params.leadId, req.user.tenantId])
      if (!existsR.rows.length) return null

      const leadR = await client.query(
        `UPDATE leads SET name = $1, phone = $2, email = NULL, tags = NULL, interests = '[]'::jsonb, erased_at = now()
         WHERE id = $3 AND tenant_id = $4 RETURNING id, erased_at`,
        [ERASED_TEXT, ERASED_TEXT, req.params.leadId, req.user.tenantId]
      )
      await client.query(
        `UPDATE messages SET text = $1, media_url = NULL, media_filename = NULL
         WHERE lead_id = $2 AND tenant_id = $3`,
        [ERASED_TEXT, req.params.leadId, req.user.tenantId]
      )
      return leadR.rows[0]
    })
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })

    await logAudit(req.user.tenantId, req.user.id, 'lead', 'erase', req.params.leadId)
    res.json({ erased: true, erasedAt: lead.erased_at })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
