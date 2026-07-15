import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const labelsRouter = Router()
labelsRouter.use(requireAuth, requireTenant)

const schema = z.object({
  name:  z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366F1'),
})

labelsRouter.get('/', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT * FROM labels WHERE tenant_id = $1 ORDER BY name',
        [req.user.tenantId]
      )
      return r.rows
    })
    res.json({ labels: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

labelsRouter.post('/', async (req, res) => {
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message })
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'INSERT INTO labels (tenant_id, name, color) VALUES ($1, $2, $3) RETURNING *',
        [req.user.tenantId, p.data.name, p.data.color]
      )
      return r.rows[0]
    })
    res.status(201).json({ label: row })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

labelsRouter.patch('/:id', async (req, res) => {
  const p = schema.partial().safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message })
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const setClauses = []
      const values = []
      let i = 1
      for (const [key, value] of Object.entries(p.data)) {
        setClauses.push(`${key} = $${i}`)
        values.push(value)
        i++
      }
      values.push(req.params.id, req.user.tenantId)
      const r = await client.query(
        `UPDATE labels SET ${setClauses.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1} RETURNING *`,
        values
      )
      if (!r.rows[0]) throw new Error('Etiqueta não encontrada.')
      return r.rows[0]
    })
    res.json({ label: row })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

labelsRouter.delete('/:id', async (req, res) => {
  try {
    await withTenant(req.user.tenantId, (client) =>
      client.query('DELETE FROM labels WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
    )
    res.json({ deleted: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
