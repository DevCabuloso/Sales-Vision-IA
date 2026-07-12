import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
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

// GET /api/flows
flowsRouter.get('/', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('flows')
        .select('id, name, status, channel_id, trigger_keywords, timeout_minutes, nodes, edges, updated_at')
        .eq('tenant_id', req.user.tenantId)
        .order('updated_at', { ascending: false })
    )
    res.json({ flows: rows || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/flows/:id
flowsRouter.get('/:id', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('flows').select('*')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows?.length) return res.status(404).json({ error: 'Fluxo não encontrado.' })
    res.json({ flow: rows[0] })
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
    const rows = unwrap(
      await supabase.from('flows').insert({
        tenant_id:        req.user.tenantId,
        name:             name.trim(),
        channel_id:       channel_id || null,
        trigger_keywords: trigger_keywords || [],
        timeout_minutes:  timeout_minutes || 30,
        fallback_text:    fallback_text || null,
        nodes:            DEFAULT_NODES(),
        edges:            [],
        updated_at:       new Date().toISOString(),
      }).select()
    )
    res.status(201).json({ flow: rows[0] })
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

    const rows = unwrap(
      await supabase.from('flows')
        .update(update).eq('id', req.params.id).eq('tenant_id', req.user.tenantId).select()
    )
    if (!rows?.length) return res.status(404).json({ error: 'Fluxo não encontrado.' })
    res.json({ flow: rows[0] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/flows/:id
flowsRouter.delete('/:id', async (req, res) => {
  try {
    unwrap(
      await supabase.from('flows')
        .delete().eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
    )
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/flows/:id/sessions — sessões ativas de um fluxo
flowsRouter.get('/:id/sessions', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('flow_sessions')
        .select('id, lead_id, current_node_id, variables, status, last_activity_at, created_at')
        .eq('flow_id', req.params.id)
        .eq('tenant_id', req.user.tenantId)
        .order('last_activity_at', { ascending: false })
        .limit(50)
    )
    res.json({ sessions: rows || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
