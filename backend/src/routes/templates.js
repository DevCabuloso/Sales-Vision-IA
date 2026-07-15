import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
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
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT id, name FROM template_categories WHERE tenant_id = $1 ORDER BY name',
        [req.user.tenantId]
      )
      // tenant novo sem nenhuma categoria ainda — semeia as padrão na hora
      if (r.rows.length) return r.rows
      const values = []
      const placeholders = DEFAULT_CATEGORIES.map((name, i) => {
        values.push(req.user.tenantId, name)
        return `($${i * 2 + 1}, $${i * 2 + 2})`
      })
      const seeded = await client.query(
        `INSERT INTO template_categories (tenant_id, name) VALUES ${placeholders.join(', ')} RETURNING id, name`,
        values
      )
      return seeded.rows
    })
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
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'INSERT INTO template_categories (tenant_id, name) VALUES ($1, $2) RETURNING id, name',
        [req.user.tenantId, parsed.data.name.trim()]
      )
      return r.rows[0]
    })
    res.status(201).json({ category: row })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' })
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/templates/categories/:id
templatesRouter.delete('/categories/:id', async (req, res) => {
  try {
    await withTenant(req.user.tenantId, (client) =>
      client.query('DELETE FROM template_categories WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
    )
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/templates
templatesRouter.get('/', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT * FROM templates WHERE tenant_id = $1 ORDER BY created_at DESC',
        [req.user.tenantId]
      )
      return r.rows
    })
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
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'INSERT INTO templates (tenant_id, name, category, content) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.user.tenantId, parsed.data.name, parsed.data.category, parsed.data.content]
      )
      return r.rows[0]
    })
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
    const update = { ...partial.data, updated_at: new Date().toISOString() }
    const row = await withTenant(req.user.tenantId, async (client) => {
      const columns = Object.keys(update)
      const setClauses = columns.map((c, i) => `${c} = $${i + 1}`)
      const values = columns.map((c) => update[c])
      values.push(req.params.id, req.user.tenantId)
      const r = await client.query(
        `UPDATE templates SET ${setClauses.join(', ')}
         WHERE id = $${columns.length + 1} AND tenant_id = $${columns.length + 2} RETURNING *`,
        values
      )
      return r.rows[0]
    })
    res.json({ template: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/templates/:id
templatesRouter.delete('/:id', async (req, res) => {
  try {
    await withTenant(req.user.tenantId, (client) =>
      client.query('DELETE FROM templates WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
    )
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/templates/:id/duplicate
templatesRouter.post('/:id/duplicate', async (req, res) => {
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT * FROM templates WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      const src = r.rows[0]
      if (!src) return null
      const dupR = await client.query(
        'INSERT INTO templates (tenant_id, name, category, content) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.user.tenantId, `${src.name} (cópia)`, src.category, src.content]
      )
      return dupR.rows[0]
    })
    if (!row) return res.status(404).json({ error: 'Template não encontrado.' })
    res.status(201).json({ template: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/templates/:id/test — executa o template com a IA configurada
templatesRouter.post('/:id/test', async (req, res) => {
  const { context = '' } = req.body

  try {
    const { tpl, cfg } = await withTenant(req.user.tenantId, async (client) => {
      const [tplR, cfgR] = await Promise.all([
        client.query('SELECT * FROM templates WHERE id = $1 AND tenant_id = $2 LIMIT 1', [req.params.id, req.user.tenantId]),
        client.query('SELECT * FROM ai_configs WHERE tenant_id = $1 LIMIT 1', [req.user.tenantId]),
      ])
      return { tpl: tplR.rows[0], cfg: cfgR.rows[0] }
    })
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
