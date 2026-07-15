import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { encrypt, decryptJSON } from '../services/crypto.js'
import { assertPublicUrl, safeFetch } from '../utils/ssrfGuard.js'

export const customApisRouter = Router()
customApisRouter.use(requireAuth, requireTenant)

const schema = z.object({
  name:     z.string().min(1).max(100),
  base_url: z.string().url('URL base inválida'),
  api_key:  z.string().optional().nullable(),
  model:    z.string().optional().nullable(),
  headers:  z.record(z.string()).optional().default({}),
  provider: z.enum(['openai', 'claude', 'gemini', 'deepseek', 'custom']).default('custom'),
  active:   z.boolean().optional().default(true),
})

const JSONB_COLUMNS = new Set(['headers'])
function columnPlaceholder(col, i) { return JSONB_COLUMNS.has(col) ? `$${i}::jsonb` : `$${i}` }
function columnValue(col, value) { return JSONB_COLUMNS.has(col) ? JSON.stringify(value) : value }

// GET /api/custom-apis
customApisRouter.get('/', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, name, base_url, model, headers, provider, active, created_at, updated_at
         FROM custom_apis WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [req.user.tenantId]
      )
      return r.rows
    })
    res.json({ apis: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/custom-apis
customApisRouter.post('/', async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    await assertPublicUrl(parsed.data.base_url)
    const { api_key, ...rest } = parsed.data
    const payload = { tenant_id: req.user.tenantId, ...rest, api_key: api_key ? encrypt(api_key) : null }

    const row = await withTenant(req.user.tenantId, async (client) => {
      const columns = Object.keys(payload)
      const placeholders = columns.map((c, i) => columnPlaceholder(c, i + 1))
      const values = columns.map((c) => columnValue(c, payload[c]))
      const r = await client.query(
        `INSERT INTO custom_apis (${columns.join(', ')}) VALUES (${placeholders.join(', ')})
         RETURNING id, name, base_url, model, headers, provider, active, created_at`,
        values
      )
      return r.rows[0]
    })
    res.status(201).json({ api: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/custom-apis/:id
customApisRouter.patch('/:id', async (req, res) => {
  const parsed = schema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    if (parsed.data.base_url) await assertPublicUrl(parsed.data.base_url)
    const { api_key, ...rest } = parsed.data
    const update = { ...rest, updated_at: new Date().toISOString() }
    if (api_key !== undefined) update.api_key = api_key ? encrypt(api_key) : null

    const row = await withTenant(req.user.tenantId, async (client) => {
      const columns = Object.keys(update)
      const setClauses = columns.map((c, i) => `${c} = ${columnPlaceholder(c, i + 1)}`)
      const values = columns.map((c) => columnValue(c, update[c]))
      values.push(req.params.id, req.user.tenantId)
      const r = await client.query(
        `UPDATE custom_apis SET ${setClauses.join(', ')}
         WHERE id = $${columns.length + 1} AND tenant_id = $${columns.length + 2}
         RETURNING id, name, base_url, model, headers, provider, active, updated_at`,
        values
      )
      return r.rows[0]
    })
    res.json({ api: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/custom-apis/:id
customApisRouter.delete('/:id', async (req, res) => {
  try {
    await withTenant(req.user.tenantId, (client) =>
      client.query('DELETE FROM custom_apis WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
    )
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/custom-apis/:id/test
customApisRouter.post('/:id/test', async (req, res) => {
  const { message = 'Olá! Isso é um teste de conexão.' } = req.body

  try {
    const apiCfg = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT * FROM custom_apis WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      return r.rows[0]
    })
    if (!apiCfg) return res.status(404).json({ error: 'API não encontrada.' })

    await assertPublicUrl(apiCfg.base_url)

    const apiKey = apiCfg.api_key ? decryptJSON(apiCfg.api_key) : null

    const headers = {
      'Content-Type': 'application/json',
      ...(apiCfg.headers || {}),
    }
    if (apiKey) {
      if (apiCfg.provider === 'claude') {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`
      }
    }

    let body
    let endpoint = apiCfg.base_url

    if (apiCfg.provider === 'claude') {
      endpoint = endpoint.replace(/\/$/, '') + '/messages'
      body = {
        model: apiCfg.model || 'claude-3-haiku-20240307',
        max_tokens: 256,
        messages: [{ role: 'user', content: message }],
      }
    } else {
      endpoint = endpoint.replace(/\/$/, '') + '/chat/completions'
      body = {
        model: apiCfg.model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: message }],
        max_tokens: 256,
      }
    }

    const r = await safeFetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`)

    let reply = ''
    if (apiCfg.provider === 'claude') {
      reply = data.content?.[0]?.text || ''
    } else {
      reply = data.choices?.[0]?.message?.content || ''
    }

    res.json({ reply, status: r.status })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
