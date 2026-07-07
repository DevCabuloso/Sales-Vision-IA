import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import XLSX from 'xlsx'
import { PDFParse } from 'pdf-parse'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { chat } from '../services/ai/openai.js'
import { buildSystemContent } from '../services/ai/agent.js'

export const aiConfigRouter = Router()
aiConfigRouter.use(requireAuth, requireTenant)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// Limite de caracteres do texto extraído, para não estourar a janela de contexto da IA.
const KNOWLEDGE_BASE_MAX_CHARS = 15000

async function extractText(file) {
  const ext = file.originalname.split('.').pop().toLowerCase()

  if (ext === 'pdf') {
    const parser = new PDFParse({ data: file.buffer })
    try {
      const result = await parser.getText()
      return result.text
    } finally {
      await parser.destroy()
    }
  }
  if (ext === 'csv' || ext === 'txt') {
    return file.buffer.toString('utf-8').replace(/^﻿/, '')
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(file.buffer, { type: 'buffer' })
    return wb.SheetNames
      .map((name) => XLSX.utils.sheet_to_csv(wb.Sheets[name]))
      .join('\n\n')
  }
  throw new Error('Formato não suportado. Envie PDF, XLSX, CSV ou TXT.')
}

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

    const messages = [
      { role: 'system', content: buildSystemContent(cfg, null) },
      { role: 'user', content: message },
    ]

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

// POST /api/ai-config/knowledge-base — upload de documento (catálogo de produtos/serviços)
aiConfigRouter.post('/knowledge-base', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })

  try {
    let text = (await extractText(req.file)).trim().replace(/\n{3,}/g, '\n\n')
    if (!text) return res.status(400).json({ error: 'Não foi possível extrair texto do arquivo.' })

    const truncated = text.length > KNOWLEDGE_BASE_MAX_CHARS
    if (truncated) text = text.slice(0, KNOWLEDGE_BASE_MAX_CHARS)

    const rows = unwrap(
      await supabase.from('ai_configs').upsert({
        tenant_id: req.user.tenantId,
        knowledge_base: text,
        knowledge_base_filename: req.file.originalname,
        knowledge_base_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' }).select('*').single()
    )
    res.json({ config: rows, truncated })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// DELETE /api/ai-config/knowledge-base
aiConfigRouter.delete('/knowledge-base', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('ai_configs').upsert({
        tenant_id: req.user.tenantId,
        knowledge_base: null,
        knowledge_base_filename: null,
        knowledge_base_updated_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' }).select('*').single()
    )
    res.json({ config: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
