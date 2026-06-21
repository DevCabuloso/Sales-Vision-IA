import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { encrypt, decryptJSON } from '../services/crypto.js'

export const customApisRouter = Router()
customApisRouter.use(requireAuth, requireTenant)

const PROVIDERS = ['openai', 'claude', 'gemini', 'deepseek', 'custom']

const schema = z.object({
  name:     z.string().min(1).max(100),
  base_url: z.string().url('URL base inválida'),
  api_key:  z.string().optional().nullable(),
  model:    z.string().optional().nullable(),
  headers:  z.record(z.string()).optional().default({}),
  provider: z.enum(['openai', 'claude', 'gemini', 'deepseek', 'custom']).default('custom'),
  active:   z.boolean().optional().default(true),
})

// GET /api/custom-apis
customApisRouter.get('/', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('custom_apis').select('id, name, base_url, model, headers, provider, active, created_at, updated_at')
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: false })
    )
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
    const { api_key, ...rest } = parsed.data
    const row = unwrap(
      await supabase.from('custom_apis').insert({
        tenant_id: req.user.tenantId,
        ...rest,
        api_key: api_key ? encrypt(api_key) : null,
      }).select('id, name, base_url, model, headers, provider, active, created_at').single()
    )
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
    const { api_key, ...rest } = parsed.data
    const update = { ...rest, updated_at: new Date().toISOString() }
    if (api_key !== undefined) update.api_key = api_key ? encrypt(api_key) : null

    const row = unwrap(
      await supabase.from('custom_apis').update(update)
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
        .select('id, name, base_url, model, headers, provider, active, updated_at').single()
    )
    res.json({ api: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/custom-apis/:id
customApisRouter.delete('/:id', async (req, res) => {
  try {
    await supabase.from('custom_apis').delete()
      .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/custom-apis/:id/test
customApisRouter.post('/:id/test', async (req, res) => {
  const { message = 'Olá! Isso é um teste de conexão.' } = req.body

  try {
    const rows = unwrap(
      await supabase.from('custom_apis').select('*')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'API não encontrada.' })
    const apiCfg = rows[0]

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

    const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) })
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
