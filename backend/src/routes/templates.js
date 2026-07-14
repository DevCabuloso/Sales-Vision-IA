import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant, requirePermission } from '../middleware/auth.js'
import { chat } from '../services/ai/openai.js'

export const templatesRouter = Router()
templatesRouter.use(requireAuth, requireTenant, requirePermission('templates'))

const schema = z.object({
  name:     z.string().min(1).max(200),
  category: z.string().min(1).max(100).default('geral'),
  content:  z.string().min(1).max(4000),
})

const DEFAULT_CATEGORIES = ['Marketing', 'Utilidade']

// ─── CATEGORIAS ───

// GET /api/templates/categories
templatesRouter.get('/categories', async (req, res) => {
  try {
    let rows = unwrap(
      await supabase.from('template_categories').select('id, name')
        .eq('tenant_id', req.user.tenantId)
        .order('name')
    )
    // tenant novo sem nenhuma categoria ainda — semeia as padrão na hora
    if (!rows.length) {
      const seeded = unwrap(
        await supabase.from('template_categories')
          .insert(DEFAULT_CATEGORIES.map((name) => ({ tenant_id: req.user.tenantId, name })))
          .select('id, name')
      )
      rows = seeded
    }
    res.json({ categories: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const categorySchema = z.object({ name: z.string().min(1).max(50) })

// POST /api/templates/categories
templatesRouter.post('/categories', async (req, res) => {
  const parsed = categorySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const row = unwrap(
      await supabase.from('template_categories').insert({
        tenant_id: req.user.tenantId,
        name: parsed.data.name.trim(),
      }).select('id, name').single()
    )
    res.status(201).json({ category: row })
  } catch (e) {
    if (e.message.includes('23505')) return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' })
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/templates/categories/:id
templatesRouter.delete('/categories/:id', async (req, res) => {
  try {
    await supabase.from('template_categories').delete()
      .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/templates
templatesRouter.get('/', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('templates').select('*')
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: false })
    )
    res.json({ templates: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/templates
templatesRouter.post('/', async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const row = unwrap(
      await supabase.from('templates').insert({
        tenant_id: req.user.tenantId,
        ...parsed.data,
      }).select('*').single()
    )
    res.status(201).json({ template: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/templates/:id
templatesRouter.patch('/:id', async (req, res) => {
  const partial = schema.partial().safeParse(req.body)
  if (!partial.success) return res.status(400).json({ error: partial.error.issues[0].message })

  try {
    const row = unwrap(
      await supabase.from('templates').update({
        ...partial.data,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.id).eq('tenant_id', req.user.tenantId).select('*').single()
    )
    res.json({ template: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/templates/:id
templatesRouter.delete('/:id', async (req, res) => {
  try {
    await supabase.from('templates').delete()
      .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/templates/:id/duplicate
templatesRouter.post('/:id/duplicate', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('templates').select('*')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Template não encontrado.' })

    const src = rows[0]
    const row = unwrap(
      await supabase.from('templates').insert({
        tenant_id: req.user.tenantId,
        name: `${src.name} (cópia)`,
        category: src.category,
        content: src.content,
      }).select('*').single()
    )
    res.status(201).json({ template: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/templates/:id/test — executa o template com a IA configurada
templatesRouter.post('/:id/test', async (req, res) => {
  const { context = '' } = req.body

  try {
    const [tplRows, cfgRows] = await Promise.all([
      supabase.from('templates').select('*').eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1),
      supabase.from('ai_configs').select('*').eq('tenant_id', req.user.tenantId).limit(1),
    ])
    const tpl = unwrap(tplRows)[0]
    const cfg = unwrap(cfgRows)[0]
    if (!tpl) return res.status(404).json({ error: 'Template não encontrado.' })

    const messages = []
    if (cfg?.system_prompt) messages.push({ role: 'system', content: cfg.system_prompt })
    messages.push({
      role: 'user',
      content: `Usando o template abaixo, gere uma mensagem para o seguinte contexto: ${context || 'sem contexto específico'}.\n\nTemplate:\n${tpl.content}`,
    })

    const response = await chat({
      messages,
      temperature: cfg?.temperature ?? 0.7,
      maxTokens: cfg?.max_tokens ?? 1000,
      model: cfg?.model,
    })

    res.json({ result: response?.content || '' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
