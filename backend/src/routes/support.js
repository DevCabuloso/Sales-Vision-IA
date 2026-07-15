import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const supportRouter = Router()
supportRouter.use(requireAuth, requireTenant)

export const SUPPORT_CATEGORIES = [
  'tecnico', 'duvida', 'whatsapp', 'financeiro', 'sugestao', 'outro',
]

const createSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  description: z.string().max(2000).optional().nullable(),
})

const messageSchema = z.object({
  text: z.string().min(1).max(4000),
})

// GET /api/support/tickets — chamados abertos por este usuário
supportRouter.get('/tickets', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, category, description, status, started_at, closed_at, created_at, updated_at
         FROM support_tickets WHERE tenant_id = $1 AND user_id = $2
         ORDER BY updated_at DESC`,
        [req.user.tenantId, req.user.id]
      )
      return r.rows
    })
    res.json({ tickets: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/support/tickets — abre um novo chamado
supportRouter.post('/tickets', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO support_tickets (tenant_id, user_id, category, description)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.user.tenantId, req.user.id, parsed.data.category, parsed.data.description || null]
      )
      return r.rows[0]
    })
    res.status(201).json({ ticket: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/support/tickets/:id/messages
supportRouter.get('/tickets/:id/messages', async (req, res) => {
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const ticketR = await client.query(
        'SELECT id FROM support_tickets WHERE id = $1 AND tenant_id = $2 AND user_id = $3 LIMIT 1',
        [req.params.id, req.user.tenantId, req.user.id]
      )
      if (!ticketR.rows.length) return null
      const msgsR = await client.query(
        `SELECT id, sender_type, sender_id, text, created_at FROM support_messages
         WHERE ticket_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
        [req.params.id, req.user.tenantId]
      )
      return msgsR.rows
    })
    if (!result) return res.status(404).json({ error: 'Chamado não encontrado.' })
    res.json({ messages: result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/support/tickets/:id/messages
supportRouter.post('/tickets/:id/messages', async (req, res) => {
  const parsed = messageSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const ticketR = await client.query(
        'SELECT id, status FROM support_tickets WHERE id = $1 AND tenant_id = $2 AND user_id = $3 LIMIT 1',
        [req.params.id, req.user.tenantId, req.user.id]
      )
      const ticket = ticketR.rows[0]
      if (!ticket) return { status: 404, error: 'Chamado não encontrado.' }
      if (ticket.status === 'closed') return { status: 400, error: 'Este chamado já foi encerrado.' }

      const msgR = await client.query(
        `INSERT INTO support_messages (ticket_id, tenant_id, sender_type, sender_id, text)
         VALUES ($1, $2, 'user', $3, $4) RETURNING *`,
        [req.params.id, req.user.tenantId, req.user.id, parsed.data.text]
      )
      await client.query(
        'UPDATE support_tickets SET updated_at = $1 WHERE id = $2',
        [new Date().toISOString(), req.params.id]
      )
      return { message: msgR.rows[0] }
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.status(201).json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
