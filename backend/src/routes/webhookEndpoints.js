import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { logAudit } from '../services/usage.js'
import { assertPublicUrl } from '../utils/ssrfGuard.js'

export const webhookEndpointsRouter = Router()
webhookEndpointsRouter.use(requireAuth, requireTenant)

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  }
  next()
}

export const WEBHOOK_EVENT_TYPES = ['lead.created', 'lead.stage_changed', 'appointment.created', 'message.received']

const schema = z.object({
  url:    z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
  active: z.boolean().optional().default(true),
})

const SELECT_COLS = 'id, url, events, active, created_at'

// GET /api/webhook-endpoints
webhookEndpointsRouter.get('/', requireAdmin, async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT ${SELECT_COLS} FROM webhook_endpoints WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [req.user.tenantId]
      )
      return r.rows
    })
    res.json({ endpoints: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/webhook-endpoints — o segredo só é retornado nesta chamada (criação)
webhookEndpointsRouter.post('/', requireAdmin, async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    await assertPublicUrl(parsed.data.url)
    const secret = randomUUID()
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO webhook_endpoints (tenant_id, url, secret, events, active)
         VALUES ($1, $2, $3, $4::text[], $5)
         RETURNING ${SELECT_COLS}`,
        [req.user.tenantId, parsed.data.url, secret, parsed.data.events, parsed.data.active]
      )
      return r.rows[0]
    })
    await logAudit(req.user.tenantId, req.user.id, 'webhook_endpoint', 'create', row.id, { url: row.url, events: row.events })
    res.status(201).json({ endpoint: { ...row, secret } })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/webhook-endpoints/:id
webhookEndpointsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const partial = schema.partial().safeParse(req.body)
  if (!partial.success) return res.status(400).json({ error: partial.error.issues[0].message })

  try {
    if (partial.data.url) await assertPublicUrl(partial.data.url)
    const update = { ...partial.data }
    const row = await withTenant(req.user.tenantId, async (client) => {
      const columns = Object.keys(update)
      const setClauses = columns.map((c, i) => c === 'events' ? `${c} = $${i + 1}::text[]` : `${c} = $${i + 1}`)
      const values = columns.map((c) => update[c])
      values.push(req.params.id, req.user.tenantId)
      const r = await client.query(
        `UPDATE webhook_endpoints SET ${setClauses.join(', ')}
         WHERE id = $${columns.length + 1} AND tenant_id = $${columns.length + 2}
         RETURNING ${SELECT_COLS}`,
        values
      )
      return r.rows[0]
    })
    if (!row) return res.status(404).json({ error: 'Endpoint não encontrado.' })
    await logAudit(req.user.tenantId, req.user.id, 'webhook_endpoint', 'update', req.params.id, partial.data)
    res.json({ endpoint: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/webhook-endpoints/:id/regenerate-secret
webhookEndpointsRouter.post('/:id/regenerate-secret', requireAdmin, async (req, res) => {
  try {
    const secret = randomUUID()
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `UPDATE webhook_endpoints SET secret = $1 WHERE id = $2 AND tenant_id = $3 RETURNING ${SELECT_COLS}`,
        [secret, req.params.id, req.user.tenantId]
      )
      return r.rows[0]
    })
    if (!row) return res.status(404).json({ error: 'Endpoint não encontrado.' })
    await logAudit(req.user.tenantId, req.user.id, 'webhook_endpoint', 'regenerate_secret', req.params.id)
    res.json({ endpoint: { ...row, secret } })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/webhook-endpoints/:id
webhookEndpointsRouter.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await withTenant(req.user.tenantId, (client) =>
      client.query('DELETE FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
    )
    await logAudit(req.user.tenantId, req.user.id, 'webhook_endpoint', 'delete', req.params.id)
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
