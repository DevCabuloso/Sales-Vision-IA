import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant, requirePermission } from '../middleware/auth.js'
import { analyzeLead } from '../services/ai/analyze.js'
import { logUsage } from '../services/usage.js'
import { normalizePhone } from '../utils/phone.js'

export const leadsRouter = Router()
leadsRouter.use(requireAuth, requireTenant, requirePermission('leads', 'kanban'))

// ─── GET /api/leads ───
leadsRouter.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000)
    const offset = parseInt(req.query.offset, 10) || 0

    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, name, phone, stage, score, intention, interests, created_at, updated_at
         FROM leads WHERE tenant_id = $1
         ORDER BY updated_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.tenantId, limit, offset]
      )
      return r.rows
    })
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
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const d = parsed.data

  try {
    const lead = await withTenant(req.user.tenantId, async (client) => {
      const countRes = await client.query(
        'SELECT count(*)::int AS count FROM leads WHERE tenant_id = $1',
        [req.user.tenantId]
      )
      const tenantRes = await client.query(
        'SELECT max_leads FROM tenants WHERE id = $1 LIMIT 1',
        [req.user.tenantId]
      )
      const count = countRes.rows[0]?.count ?? 0
      const maxLeads = tenantRes.rows[0]?.max_leads ?? 1000
      if (count >= maxLeads) {
        const limitError = new Error('Limite de leads do plano atingido.')
        limitError.isLimitError = true
        throw limitError
      }

      const insertRes = await client.query(
        `INSERT INTO leads (tenant_id, name, phone, stage, intention, interests)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          req.user.tenantId,
          d.name || null,
          normalizePhone(d.phone),
          d.stage || 'Novo Lead',
          d.intention || null,
          d.interests || [],
        ]
      )
      return insertRes.rows[0]
    })
    await logUsage(req.user.tenantId, req.user.id, 'lead_created', { phone: d.phone })
    res.status(201).json({ lead })
  } catch (e) {
    if (e.isLimitError) return res.status(403).json({ error: e.message })
    if (e.code === '23505') return res.status(409).json({ error: 'Já existe um lead com esse telefone.' })
    res.status(500).json({ error: e.message })
  }
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
    const { lead, previousStage } = await withTenant(req.user.tenantId, async (client) => {
      const currentRes = await client.query(
        'SELECT stage FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )

      const fields = { ...parsed.data, updated_at: new Date().toISOString() }
      const setClauses = []
      const values = []
      let i = 1
      for (const [key, value] of Object.entries(fields)) {
        setClauses.push(`${key} = $${i}`)
        values.push(value)
        i++
      }
      values.push(req.params.id, req.user.tenantId)
      const updateRes = await client.query(
        `UPDATE leads SET ${setClauses.join(', ')}
         WHERE id = $${i} AND tenant_id = $${i + 1}
         RETURNING *`,
        values
      )
      return { lead: updateRes.rows[0] || null, previousStage: currentRes.rows[0]?.stage || null }
    })
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })

    if (parsed.data.stage && previousStage !== parsed.data.stage) {
      withTenant(req.user.tenantId, (client) =>
        client.query(
          `INSERT INTO lead_stage_history (tenant_id, lead_id, from_stage, to_stage, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.tenantId, req.params.id, previousStage, parsed.data.stage, req.user.id]
        )
      ).catch((e) => console.warn('[leads] falha ao salvar histórico de estágio:', e.message))
    }

    res.json({ lead })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── DELETE /api/leads/:id ───
leadsRouter.delete('/:id', async (req, res) => {
  try {
    await withTenant(req.user.tenantId, (client) =>
      client.query('DELETE FROM leads WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
    )
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── GET /api/leads/:id/history ───
leadsRouter.get('/:id/history', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, from_stage, to_stage, notes, changed_at, changed_by
         FROM lead_stage_history WHERE lead_id = $1 AND tenant_id = $2
         ORDER BY changed_at DESC`,
        [req.params.id, req.user.tenantId]
      )
      return r.rows
    })
    res.json({ history: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Teto de mensagens retornadas/analisadas por lead — sem isso, uma conversa
// muito longa vira uma query e um payload/prompt sem limite.
const MESSAGES_HARD_LIMIT = 500

// ─── GET /api/leads/:id/messages ───
leadsRouter.get('/:id/messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || MESSAGES_HARD_LIMIT, MESSAGES_HARD_LIMIT)
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT role, text, provider, created_at
         FROM messages WHERE lead_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT $3`,
        [req.params.id, req.user.tenantId, limit]
      )
      return r.rows
    })
    res.json({ messages: rows.reverse() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── POST /api/leads/:id/analyze ───
leadsRouter.post('/:id/analyze', async (req, res) => {
  try {
    const msgs = (
      await withTenant(req.user.tenantId, async (client) => {
        const r = await client.query(
          `SELECT role, text FROM messages WHERE lead_id = $1 AND tenant_id = $2
           ORDER BY created_at DESC LIMIT $3`,
          [req.params.id, req.user.tenantId, MESSAGES_HARD_LIMIT]
        )
        return r.rows
      })
    ).reverse()

    let analysis
    try {
      analysis = await analyzeLead(msgs)
    } catch (e) {
      return res.status(502).json({ error: 'Falha na análise de IA: ' + e.message })
    }

    const lead = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `UPDATE leads SET score = $1, intention = $2, stage = $3, interests = $4, updated_at = $5
         WHERE id = $6 AND tenant_id = $7
         RETURNING *`,
        [analysis.score, analysis.intention, analysis.stage, analysis.interests, new Date().toISOString(), req.params.id, req.user.tenantId]
      )
      return r.rows[0] || null
    })
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })
    res.json({ lead, analysis })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
