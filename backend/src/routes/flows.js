import { Router } from 'express'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const flowsRouter = Router()
flowsRouter.use(requireAuth, requireTenant)

const DEFAULT_NODES = () => [
  { id: 'start',   type: 'flowNode', position: { x: 80,  y: 200 }, data: { nodeType: 'start' } },
  { id: 'welcome', type: 'flowNode', position: { x: 320, y: 200 }, data: { nodeType: 'message', text: 'Olá! Como posso te ajudar?' } },
]
const DEFAULT_EDGES = () => [
  { id: 'e-start-welcome', source: 'start', target: 'welcome', type: 'auto', data: { edgeType: 'auto' } },
]

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
  const { name, channel_id, trigger_keywords, timeout_minutes, fallback_text } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório.' })
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
        edges:            DEFAULT_EDGES(),
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
  const { name, status, channel_id, trigger_keywords, timeout_minutes, fallback_text, nodes, edges } = req.body
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
