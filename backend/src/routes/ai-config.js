import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { chat } from '../services/ai/openai.js'

export const aiConfigRouter = Router()
aiConfigRouter.use(requireAuth, requireTenant)

const schema = z.object({
  name:          z.string().min(1).max(100).optional(),
  model:         z.string().min(1).optional(),
  system_prompt: z.string().max(8000).optional().nullable(),
  main_prompt:   z.string().max(8000).optional().nullable(),
  temperature:   z.number().min(0).max(2).optional(),
  max_tokens:    z.number().int().min(100).max(32000).optional(),
})

// GET /api/ai-config
aiConfigRouter.get('/', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('ai_configs').select('*')
        .eq('tenant_id', req.user.tenantId).limit(1)
    )
    res.json({ config: rows[0] || null })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/ai-config
aiConfigRouter.put('/', async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const rows = unwrap(
      await supabase.from('ai_configs').upsert({
        tenant_id: req.user.tenantId,
        ...parsed.data,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' }).select('*').single()
    )
    res.json({ config: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/ai-config/status — retorna se a IA está ligada
aiConfigRouter.get('/status', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('tenants').select('ai_enabled')
        .eq('id', req.user.tenantId).limit(1)
    )
    res.json({ ai_enabled: rows[0]?.ai_enabled ?? true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/ai-config/toggle — liga/desliga a IA globalmente
// Aceita { ai_enabled: bool } no body para ser idempotente e evitar race condition.
// Sem body, faz leitura-inversão (comportamento legado).
aiConfigRouter.post('/toggle', async (req, res) => {
  try {
    if (typeof req.body?.ai_enabled === 'boolean') {
      unwrap(
        await supabase.from('tenants')
          .update({ ai_enabled: req.body.ai_enabled })
          .eq('id', req.user.tenantId)
      )
      return res.json({ ai_enabled: req.body.ai_enabled })
    }
    const rows = unwrap(
      await supabase.from('tenants').select('ai_enabled')
        .eq('id', req.user.tenantId).limit(1)
    )
    const current = rows[0]?.ai_enabled ?? true
    unwrap(
      await supabase.from('tenants').update({ ai_enabled: !current })
        .eq('id', req.user.tenantId)
    )
    res.json({ ai_enabled: !current })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/ai-config/test
aiConfigRouter.post('/test', async (req, res) => {
  const { message = 'Olá! Me fale sobre como vocês podem me ajudar.' } = req.body

  try {
    const rows = unwrap(
      await supabase.from('ai_configs').select('*')
        .eq('tenant_id', req.user.tenantId).limit(1)
    )
    const cfg = rows[0]

    const messages = []
    if (cfg?.system_prompt) messages.push({ role: 'system', content: cfg.system_prompt })
    if (cfg?.main_prompt)   messages.push({ role: 'system', content: `Prompt principal: ${cfg.main_prompt}` })
    messages.push({ role: 'user', content: message })

    const response = await chat({
      messages,
      temperature: cfg?.temperature ?? 0.7,
      maxTokens:   cfg?.max_tokens ?? 1000,
      model:       cfg?.model,
    })

    res.json({ reply: response?.content || '' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
