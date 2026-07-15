import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const flowsRouter = Router()
flowsRouter.use(requireAuth, requireTenant)

const DEFAULT_NODES = () => [
  { id: 'n1', tipo: 'mensagem',  conteudo: 'Olá! 👋 Como posso te ajudar?' },
  { id: 'n2', tipo: 'encerrar' },
]

const createSchema = z.object({
  name:             z.string().min(1, 'Nome obrigatório.'),
  channel_id:       z.string().min(1).nullable().optional(),
  trigger_keywords: z.array(z.string()).optional(),
  timeout_minutes:  z.number().int().positive().optional(),
  fallback_text:    z.string().nullable().optional(),
})

const updateSchema = createSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
  nodes:  z.array(z.any()).optional(),
  edges:  z.array(z.any()).optional(),
})

// Colunas jsonb — precisam de ::jsonb + JSON.stringify no INSERT/UPDATE.
const JSONB_COLUMNS = new Set(['nodes', 'edges'])
const ARRAY_COLUMNS = new Set(['trigger_keywords'])

function columnPlaceholder(col, i) {
  if (JSONB_COLUMNS.has(col)) return `$${i}::jsonb`
  if (ARRAY_COLUMNS.has(col)) return `$${i}::text[]`
  return `$${i}`
}
function columnValue(col, value) {
  return JSONB_COLUMNS.has(col) ? JSON.stringify(value) : value
}

// GET /api/flows
flowsRouter.get('/', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, name, status, channel_id, trigger_keywords, timeout_minutes, nodes, edges, updated_at
         FROM flows WHERE tenant_id = $1 ORDER BY updated_at DESC`,
        [req.user.tenantId]
      )
      return r.rows
    })
    res.json({ flows: rows || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/flows/:id
flowsRouter.get('/:id', async (req, res) => {
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT * FROM flows WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      return r.rows[0]
    })
    if (!row) return res.status(404).json({ error: 'Fluxo não encontrado.' })
    res.json({ flow: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/flows
flowsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { name, channel_id, trigger_keywords, timeout_minutes, fallback_text } = parsed.data
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO flows (tenant_id, name, channel_id, trigger_keywords, timeout_minutes, fallback_text, nodes, edges, updated_at)
         VALUES ($1, $2, $3, $4::text[], $5, $6, $7::jsonb, $8::jsonb, $9)
         RETURNING *`,
        [
          req.user.tenantId,
          name.trim(),
          channel_id || null,
          trigger_keywords || [],
          timeout_minutes || 30,
          fallback_text || null,
          JSON.stringify(DEFAULT_NODES()),
          JSON.stringify([]),
          new Date().toISOString(),
        ]
      )
      return r.rows[0]
    })
    res.status(201).json({ flow: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/flows/:id
flowsRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { name, status, channel_id, trigger_keywords, timeout_minutes, fallback_text, nodes, edges } = parsed.data
  try {
    const update = { updated_at: new Date().toISOString() }
    if (name             !== undefined) update.name             = name
    if (status           !== undefined) update.status           = status
    if (channel_id       !== undefined) update.channel_id       = channel_id
    if (trigger_keywords !== undefined) update.trigger_keywords = trigger_keywords
    if (timeout_minutes  !== undefined) update.timeout_minutes  = timeout_minutes
    if (fallback_text    !== undefined) update.fallback_text    = fallback_text
    if (nodes            !== undefined) update.nodes            = nodes
    if (edges            !== undefined) update.edges            = edges

    const row = await withTenant(req.user.tenantId, async (client) => {
      const setClauses = []
      const values = []
      let i = 1
      for (const [key, value] of Object.entries(update)) {
        setClauses.push(`${key} = ${columnPlaceholder(key, i)}`)
        values.push(columnValue(key, value))
        i++
      }
      values.push(req.params.id, req.user.tenantId)
      const r = await client.query(
        `UPDATE flows SET ${setClauses.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1} RETURNING *`,
        values
      )
      return r.rows[0]
    })
    if (!row) return res.status(404).json({ error: 'Fluxo não encontrado.' })
    res.json({ flow: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/flows/:id
flowsRouter.delete('/:id', async (req, res) => {
  try {
    await withTenant(req.user.tenantId, (client) =>
      client.query('DELETE FROM flows WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
    )
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/flows/:id/sessions — sessões ativas de um fluxo
flowsRouter.get('/:id/sessions', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, lead_id, current_node_id, variables, status, last_activity_at, created_at
         FROM flow_sessions WHERE flow_id = $1 AND tenant_id = $2
         ORDER BY last_activity_at DESC LIMIT 50`,
        [req.params.id, req.user.tenantId]
      )
      return r.rows
    })
    res.json({ sessions: rows || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
