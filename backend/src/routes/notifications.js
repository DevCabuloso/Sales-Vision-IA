import { Router } from 'express'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth, requireTenant)

notificationsRouter.get('/', async (req, res) => {
  try {
    const minutes = Math.max(1, parseInt(req.query.minutes) || 30)
    const tenantId = req.user.tenantId

    const { notifications, alerts } = await withTenant(tenantId, async (client) => {
      // Busca mensagens das últimas 48h ordenadas por mais recente
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const messagesR = await client.query(
        `SELECT lead_id, role, text, created_at FROM messages
         WHERE tenant_id = $1 AND created_at >= $2
         ORDER BY created_at DESC`,
        [tenantId, cutoff]
      )
      const messages = messagesR.rows

      // Última mensagem por lead (client-side grouping)
      const lastByLead = {}
      for (const msg of messages || []) {
        if (!lastByLead[msg.lead_id]) lastByLead[msg.lead_id] = msg
      }

      // Filtra: última mensagem é do lead e passou do tempo configurado
      const thresholdMs = minutes * 60 * 1000
      const now = Date.now()
      const unanswered = Object.values(lastByLead).filter(msg => {
        const age = now - new Date(msg.created_at).getTime()
        return msg.role === 'lead' && age >= thresholdMs
      })

      let notifications = []
      if (unanswered.length) {
        // Busca dados dos leads
        const leadIds = unanswered.map(m => m.lead_id)
        const leadsR = await client.query(
          'SELECT id, name, phone FROM leads WHERE id = ANY($1::uuid[]) AND tenant_id = $2',
          [leadIds, tenantId]
        )

        const leadMap = {}
        for (const l of leadsR.rows || []) leadMap[l.id] = l

        notifications = unanswered
          .map(msg => ({
            lead_id:     msg.lead_id,
            lead_name:   leadMap[msg.lead_id]?.name || null,
            lead_phone:  leadMap[msg.lead_id]?.phone || '—',
            last_message: (msg.text || '').slice(0, 120),
            minutes_ago: Math.floor((now - new Date(msg.created_at).getTime()) / 60000),
            created_at:  msg.created_at,
          }))
          .sort((a, b) => b.minutes_ago - a.minutes_ago)
      }

      // Avisos persistidos (ex: vencimento de mensalidade) direcionados a este
      // usuário — diferente das "notificações" acima, que são recalculadas a
      // cada request a partir de messages, sem tabela própria.
      const alertsR = await client.query(
        `SELECT id, type, title, message, created_at FROM notifications
         WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL AND resolved_at IS NULL
         ORDER BY created_at DESC`,
        [tenantId, req.user.id]
      )

      return { notifications, alerts: alertsR.rows || [] }
    })

    res.json({ notifications, alerts })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

notificationsRouter.patch('/:id/read', async (req, res) => {
  const row = await withTenant(req.user.tenantId, async (client) => {
    const r = await client.query(
      `UPDATE notifications SET read_at = $1
       WHERE id = $2 AND tenant_id = $3 AND user_id = $4
       RETURNING id`,
      [new Date().toISOString(), req.params.id, req.user.tenantId, req.user.id]
    )
    return r.rows[0]
  })
  if (!row) return res.status(404).json({ error: 'Notificação não encontrada.' })
  res.json({ read: true })
})
