import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const queuesRouter = Router()
queuesRouter.use(requireAuth, requireTenant)

const schema = z.object({
  name:        z.string().min(1).max(100),
  color:       z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366F1'),
  description: z.string().max(300).optional().nullable(),
})

// queue_operators não tem coluna tenant_id (ver migration_tenant_safety_triggers.sql) —
// sem essa checagem, um user_id de outro tenant era aceito sem nenhuma validação,
// entrando na fila de outro cliente.
async function assertUsersBelongToTenant(client, tenantId, userIds) {
  if (!userIds.length) return
  const r = await client.query(
    'SELECT id FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])',
    [tenantId, userIds]
  )
  const found = new Set(r.rows.map((row) => row.id))
  const invalid = userIds.filter((id) => !found.has(id))
  if (invalid.length) {
    const err = new Error('Um ou mais operadores não pertencem a este cliente.')
    err.status = 400
    throw err
  }
}

async function fetchOperators(client, queueIds) {
  if (!queueIds.length) return []
  const r = await client.query(
    `SELECT qo.queue_id, u.id, u.name, u.email
     FROM queue_operators qo JOIN users u ON u.id = qo.user_id
     WHERE qo.queue_id = ANY($1::uuid[])`,
    [queueIds]
  )
  return r.rows
}

queuesRouter.get('/', async (req, res) => {
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const queuesR = await client.query('SELECT * FROM queues WHERE tenant_id = $1 ORDER BY name', [req.user.tenantId])
      const queues = queuesR.rows
      if (!queues.length) return []
      const ids = queues.map((q) => q.id)
      const ops = await fetchOperators(client, ids)
      return queues.map((q) => ({
        ...q,
        operators: ops.filter((o) => o.queue_id === q.id).map((o) => ({ id: o.id, name: o.name, email: o.email })),
      }))
    })
    res.json({ queues: result })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

queuesRouter.post('/', async (req, res) => {
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message })
  try {
    const { operator_ids = [] } = req.body
    const row = await withTenant(req.user.tenantId, async (client) => {
      await assertUsersBelongToTenant(client, req.user.tenantId, operator_ids)
      const r = await client.query(
        'INSERT INTO queues (tenant_id, name, color, description) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.user.tenantId, p.data.name, p.data.color, p.data.description ?? null]
      )
      const queue = r.rows[0]
      if (operator_ids.length) {
        const values = []
        const placeholders = operator_ids.map((uid, i) => {
          values.push(queue.id, uid)
          return `($${i * 2 + 1}, $${i * 2 + 2})`
        })
        await client.query(`INSERT INTO queue_operators (queue_id, user_id) VALUES ${placeholders.join(', ')}`, values)
      }
      return queue
    })
    res.status(201).json({ queue: { ...row, operators: [] } })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

queuesRouter.patch('/:id', async (req, res) => {
  const p = schema.partial().safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message })
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      if (req.body.operator_ids !== undefined) {
        await assertUsersBelongToTenant(client, req.user.tenantId, req.body.operator_ids)
      }
      const columns = Object.keys(p.data)
      const setClauses = columns.map((c, i) => `${c} = $${i + 1}`)
      const values = columns.map((c) => p.data[c])
      values.push(req.params.id, req.user.tenantId)
      const r = await client.query(
        `UPDATE queues SET ${setClauses.join(', ')} WHERE id = $${columns.length + 1} AND tenant_id = $${columns.length + 2} RETURNING *`,
        values
      )
      const row = r.rows[0]

      if (req.body.operator_ids !== undefined) {
        await client.query('DELETE FROM queue_operators WHERE queue_id = $1', [req.params.id])
        if (req.body.operator_ids.length) {
          const values2 = []
          const placeholders = req.body.operator_ids.map((uid, i) => {
            values2.push(req.params.id, uid)
            return `($${i * 2 + 1}, $${i * 2 + 2})`
          })
          await client.query(`INSERT INTO queue_operators (queue_id, user_id) VALUES ${placeholders.join(', ')}`, values2)
        }
      }
      // re-fetch operators
      const updatedOps = await fetchOperators(client, [req.params.id])
      return { ...row, operators: updatedOps.map((o) => ({ id: o.id, name: o.name, email: o.email })) }
    })
    res.json({ queue: result })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

queuesRouter.delete('/:id', async (req, res) => {
  try {
    await withTenant(req.user.tenantId, (client) =>
      client.query('DELETE FROM queues WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
    )
    res.json({ deleted: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
