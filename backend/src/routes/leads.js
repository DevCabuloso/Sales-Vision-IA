import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { analyzeLead } from '../services/ai/analyze.js'
import { logUsage } from '../services/usage.js'

export const leadsRouter = Router()
leadsRouter.use(requireAuth, requireTenant)

// ─── GET /api/leads ───
leadsRouter.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000)
    const offset = parseInt(req.query.offset, 10) || 0

    const rows = unwrap(
      await supabase.from('leads')
        .select('id, name, phone, stage, score, intention, interests, created_at, updated_at')
        .eq('tenant_id', req.user.tenantId)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1)
    )
    res.json({ leads: rows, limit, offset })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── POST /api/leads ───
const createSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(8),
  stage: z.string().optional(),
  intention: z.string().optional(),
  interests: z.array(z.string()).optional(),
})

leadsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })
  }
  const d = parsed.data

  const { count } = await supabase.from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', req.user.tenantId)
  const tenant = unwrap(
    await supabase.from('tenants').select('max_leads').eq('id', req.user.tenantId).limit(1)
  )
  if ((count ?? 0) >= (tenant?.[0]?.max_leads ?? 1000)) {
    return res.status(403).json({ error: 'Limite de leads do plano atingido.' })
  }

  const { data, error } = await supabase.from('leads').insert({
    tenant_id: req.user.tenantId,
    name: d.name || null,
    phone: d.phone.trim(),
    stage: d.stage || 'Novo Lead',
    intention: d.intention || null,
    interests: d.interests || [],
  }).select().single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe um lead com esse telefone.' })
    return res.status(500).json({ error: error.message })
  }
  await logUsage(req.user.tenantId, req.user.id, 'lead_created', { phone: d.phone })
  res.status(201).json({ lead: data })
})

// ─── PATCH /api/leads/:id ───
const updateSchema = z.object({
  name: z.string().optional(),
  stage: z.string().optional(),
  score: z.number().int().min(0).max(100).optional(),
  intention: z.string().optional(),
  interests: z.array(z.string()).optional(),
}).partial()

leadsRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
  if (!Object.keys(parsed.data).length) return res.status(400).json({ error: 'Nada para atualizar.' })

  try {
    const current = unwrap(
      await supabase.from('leads').select('stage').eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )

    const patch = { ...parsed.data, updated_at: new Date().toISOString() }
    const rows = unwrap(
      await supabase.from('leads').update(patch)
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
        .select()
    )
    if (!rows.length) return res.status(404).json({ error: 'Lead não encontrado.' })

    if (parsed.data.stage && current[0]?.stage !== parsed.data.stage) {
      supabase.from('lead_stage_history').insert({
        tenant_id:  req.user.tenantId,
        lead_id:    req.params.id,
        from_stage: current[0]?.stage || null,
        to_stage:   parsed.data.stage,
        changed_by: req.user.id,
      }).catch((e) => console.warn('[leads] falha ao salvar histórico de estágio:', e.message))
    }

    res.json({ lead: rows[0] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── DELETE /api/leads/:id ───
leadsRouter.delete('/:id', async (req, res) => {
  try {
    unwrap(
      await supabase.from('leads').delete()
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
    )
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── GET /api/leads/:id/history ───
leadsRouter.get('/:id/history', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('lead_stage_history')
        .select('id, from_stage, to_stage, notes, changed_at, changed_by')
        .eq('lead_id', req.params.id).eq('tenant_id', req.user.tenantId)
        .order('changed_at', { ascending: false })
    )
    res.json({ history: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── GET /api/leads/:id/messages ───
leadsRouter.get('/:id/messages', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('messages')
        .select('role, text, provider, created_at')
        .eq('lead_id', req.params.id).eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: true })
    )
    res.json({ messages: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── POST /api/leads/:id/analyze ───
leadsRouter.post('/:id/analyze', async (req, res) => {
  const msgs = unwrap(
    await supabase.from('messages').select('role, text')
      .eq('lead_id', req.params.id).eq('tenant_id', req.user.tenantId)
      .order('created_at', { ascending: true })
  )
  try {
    const analysis = await analyzeLead(msgs)
    const rows = unwrap(
      await supabase.from('leads').update({
        score: analysis.score,
        intention: analysis.intention,
        stage: analysis.stage,
        interests: analysis.interests,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.id).eq('tenant_id', req.user.tenantId).select()
    )
    if (!rows.length) return res.status(404).json({ error: 'Lead não encontrado.' })
    res.json({ lead: rows[0], analysis })
  } catch (e) {
    res.status(502).json({ error: 'Falha na análise de IA: ' + e.message })
  }
})
