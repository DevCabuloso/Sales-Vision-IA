import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const labelsRouter = Router()
labelsRouter.use(requireAuth, requireTenant)

const schema = z.object({
  name:  z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366F1'),
})

labelsRouter.get('/', async (req, res) => {
  try {
    const rows = unwrap(await supabase.from('labels').select('*').eq('tenant_id', req.user.tenantId).order('name'))
    res.json({ labels: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

labelsRouter.post('/', async (req, res) => {
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message })
  try {
    const row = unwrap(await supabase.from('labels').insert({ tenant_id: req.user.tenantId, ...p.data }).select('*').single())
    res.status(201).json({ label: row })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

labelsRouter.patch('/:id', async (req, res) => {
  const p = schema.partial().safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message })
  try {
    const row = unwrap(await supabase.from('labels').update(p.data).eq('id', req.params.id).eq('tenant_id', req.user.tenantId).select('*').single())
    res.json({ label: row })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

labelsRouter.delete('/:id', async (req, res) => {
  try {
    unwrap(await supabase.from('labels').delete().eq('id', req.params.id).eq('tenant_id', req.user.tenantId))
    res.json({ deleted: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
