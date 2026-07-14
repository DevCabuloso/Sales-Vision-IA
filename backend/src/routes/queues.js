import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
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
async function assertUsersBelongToTenant(tenantId, userIds) {
  if (!userIds.length) return
  const rows = unwrap(
    await supabase.from('users').select('id').eq('tenant_id', tenantId).in('id', userIds)
  )
  const found = new Set(rows.map((r) => r.id))
  const invalid = userIds.filter((id) => !found.has(id))
  if (invalid.length) {
    const err = new Error('Um ou mais operadores não pertencem a este cliente.')
    err.status = 400
    throw err
  }
}

queuesRouter.get('/', async (req, res) => {
  try {
    const queues = unwrap(await supabase.from('queues').select('*').eq('tenant_id', req.user.tenantId).order('name'))
    if (!queues.length) return res.json({ queues: [] })
    const ids = queues.map((q) => q.id)
    const ops = unwrap(
      await supabase.from('queue_operators').select('queue_id, users(id, name, email)').in('queue_id', ids)
    )
    const result = queues.map((q) => ({
      ...q,
      operators: ops.filter((o) => o.queue_id === q.id).map((o) => o.users),
    }))
    res.json({ queues: result })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

queuesRouter.post('/', async (req, res) => {
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message })
  try {
    const { operator_ids = [] } = req.body
    await assertUsersBelongToTenant(req.user.tenantId, operator_ids)
    const row = unwrap(await supabase.from('queues').insert({ tenant_id: req.user.tenantId, ...p.data }).select('*').single())
    if (operator_ids.length) {
      await supabase.from('queue_operators').insert(operator_ids.map((uid) => ({ queue_id: row.id, user_id: uid })))
    }
    res.status(201).json({ queue: { ...row, operators: [] } })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

queuesRouter.patch('/:id', async (req, res) => {
  const p = schema.partial().safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message })
  try {
    if (req.body.operator_ids !== undefined) {
      await assertUsersBelongToTenant(req.user.tenantId, req.body.operator_ids)
    }
    const row = unwrap(await supabase.from('queues').update(p.data).eq('id', req.params.id).eq('tenant_id', req.user.tenantId).select('*').single())
    if (req.body.operator_ids !== undefined) {
      await supabase.from('queue_operators').delete().eq('queue_id', req.params.id)
      if (req.body.operator_ids.length) {
        await supabase.from('queue_operators').insert(req.body.operator_ids.map((uid) => ({ queue_id: req.params.id, user_id: uid })))
      }
    }
    // re-fetch operators
    const updatedOps = unwrap(
      await supabase.from('queue_operators').select('users(id, name, email)').eq('queue_id', req.params.id)
    )
    res.json({ queue: { ...row, operators: updatedOps.map((o) => o.users) } })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

queuesRouter.delete('/:id', async (req, res) => {
  try {
    unwrap(await supabase.from('queues').delete().eq('id', req.params.id).eq('tenant_id', req.user.tenantId))
    res.json({ deleted: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
