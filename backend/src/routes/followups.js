import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { uploadChatMedia } from '../services/mediaStorage.js'

const ALLOWED_MIMETYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm',
  'video/mp4', 'video/webm',
  'application/pdf',
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIMETYPES.has(file.mimetype))
  },
})

export const followupsRouter = Router()
followupsRouter.use(requireAuth, requireTenant)

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const stepSchema = z.object({
  delay_days:     z.number().int().min(0).max(3650),
  text:           z.string().min(1).max(4000),
  media_url:      z.string().url().optional().nullable(),
  media_type:     z.string().optional().nullable(),
  media_mimetype: z.string().optional().nullable(),
  media_filename: z.string().optional().nullable(),
  send_time:      z.string().regex(TIME_RE).optional().nullable(),
})

const sequenceSchema = z.object({
  name:               z.string().min(1).max(200),
  description:        z.string().max(2000).optional().nullable(),
  time_mode:          z.enum(['general', 'individual']).default('general'),
  default_send_time:  z.string().regex(TIME_RE).default('09:00'),
  steps:              z.array(stepSchema).min(1).max(50),
})

const STEP_COLUMNS = ['sequence_id', 'tenant_id', 'order_index', 'delay_days', 'text', 'media_url', 'media_type', 'media_mimetype', 'media_filename', 'send_time']

async function insertSteps(client, sequenceId, tenantId, steps) {
  const rows = steps.map((s, i) => [
    sequenceId, tenantId, i, s.delay_days, s.text,
    s.media_url || null, s.media_type || null, s.media_mimetype || null, s.media_filename || null, s.send_time || null,
  ])
  const values = []
  const placeholders = rows.map((row, ri) => {
    const base = ri * STEP_COLUMNS.length
    values.push(...row)
    return `(${row.map((_, ci) => `$${base + ci + 1}`).join(', ')})`
  })
  const r = await client.query(
    `INSERT INTO followup_steps (${STEP_COLUMNS.join(', ')}) VALUES ${placeholders.join(', ')} RETURNING *`,
    values
  )
  return r.rows
}

// GET /api/followups — lista sequências + contagem de etapas e de contatos ativos
followupsRouter.get('/', async (req, res) => {
  try {
    const { sequences, stepCounts, activeCounts } = await withTenant(req.user.tenantId, async (client) => {
      const seqR = await client.query(
        'SELECT * FROM followup_sequences WHERE tenant_id = $1 ORDER BY created_at DESC',
        [req.user.tenantId]
      )
      const sequences = seqR.rows
      if (!sequences.length) return { sequences, stepCounts: {}, activeCounts: {} }

      const ids = sequences.map((s) => s.id)
      const [stepsR, enrollmentsR] = await Promise.all([
        client.query('SELECT sequence_id FROM followup_steps WHERE tenant_id = $1 AND sequence_id = ANY($2::uuid[])', [req.user.tenantId, ids]),
        client.query("SELECT sequence_id FROM followup_enrollments WHERE tenant_id = $1 AND status = 'active' AND sequence_id = ANY($2::uuid[])", [req.user.tenantId, ids]),
      ])
      const stepCounts = {}
      for (const row of stepsR.rows) stepCounts[row.sequence_id] = (stepCounts[row.sequence_id] || 0) + 1
      const activeCounts = {}
      for (const row of enrollmentsR.rows) activeCounts[row.sequence_id] = (activeCounts[row.sequence_id] || 0) + 1
      return { sequences, stepCounts, activeCounts }
    })
    if (!sequences.length) return res.json({ sequences: [] })

    res.json({
      sequences: sequences.map((s) => ({
        ...s,
        steps_count: stepCounts[s.id] || 0,
        active_count: activeCounts[s.id] || 0,
      })),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/followups/:id — detalhe com etapas
followupsRouter.get('/:id', async (req, res) => {
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const seqR = await client.query(
        'SELECT * FROM followup_sequences WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      if (!seqR.rows.length) return null
      const stepsR = await client.query(
        'SELECT * FROM followup_steps WHERE sequence_id = $1 AND tenant_id = $2 ORDER BY order_index ASC',
        [req.params.id, req.user.tenantId]
      )
      return { sequence: seqR.rows[0], steps: stepsR.rows }
    })
    if (!result) return res.status(404).json({ error: 'Acompanhamento não encontrado.' })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/followups — cria sequência + etapas
followupsRouter.post('/', async (req, res) => {
  const parsed = sequenceSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const seqR = await client.query(
        `INSERT INTO followup_sequences (tenant_id, created_by, name, description, time_mode, default_send_time)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.user.tenantId, req.user.id, parsed.data.name, parsed.data.description || null, parsed.data.time_mode, parsed.data.default_send_time]
      )
      const sequence = seqR.rows[0]
      const steps = await insertSteps(client, sequence.id, req.user.tenantId, parsed.data.steps)
      return { sequence, steps }
    })
    res.status(201).json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/followups/:id — atualiza nome/descrição e substitui as etapas
followupsRouter.patch('/:id', async (req, res) => {
  const parsed = sequenceSchema.partial({ steps: true }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const existsR = await client.query(
        'SELECT id FROM followup_sequences WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      if (!existsR.rows.length) return null

      const setClauses = []
      const values = []
      let i = 1
      if (parsed.data.name !== undefined) { setClauses.push(`name = $${i++}`); values.push(parsed.data.name) }
      if (parsed.data.description !== undefined) { setClauses.push(`description = $${i++}`); values.push(parsed.data.description || null) }
      setClauses.push(`time_mode = $${i++}`); values.push(parsed.data.time_mode)
      setClauses.push(`default_send_time = $${i++}`); values.push(parsed.data.default_send_time)
      setClauses.push(`updated_at = $${i++}`); values.push(new Date().toISOString())
      values.push(req.params.id, req.user.tenantId)

      const seqR = await client.query(
        `UPDATE followup_sequences SET ${setClauses.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1} RETURNING *`,
        values
      )
      const sequence = seqR.rows[0]

      let steps
      if (parsed.data.steps) {
        await client.query('DELETE FROM followup_steps WHERE sequence_id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
        steps = await insertSteps(client, req.params.id, req.user.tenantId, parsed.data.steps)
      } else {
        const stepsR = await client.query(
          'SELECT * FROM followup_steps WHERE sequence_id = $1 AND tenant_id = $2 ORDER BY order_index ASC',
          [req.params.id, req.user.tenantId]
        )
        steps = stepsR.rows
      }
      return { sequence, steps }
    })
    if (!result) return res.status(404).json({ error: 'Acompanhamento não encontrado.' })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/followups/:id — apaga sequência (bloqueada se houver inscrições, ativas ou
// concluídas — followup_enrollments.sequence_id e followup_steps.sequence_id referenciam
// esta linha via FK sem ON DELETE CASCADE, então apagar a sequência com histórico
// associado falharia por violação de FK; sem inscrições, apaga as etapas antes)
followupsRouter.delete('/:id', async (req, res) => {
  try {
    const blocked = await withTenant(req.user.tenantId, async (client) => {
      const enrollmentsR = await client.query(
        'SELECT id FROM followup_enrollments WHERE sequence_id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      if (enrollmentsR.rows.length) return true

      await client.query('DELETE FROM followup_steps WHERE sequence_id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
      await client.query('DELETE FROM followup_sequences WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
      return false
    })
    if (blocked) {
      return res.status(400).json({ error: 'Não é possível excluir uma sequência com contatos inscritos. Duplique-a ou remova as inscrições antes.' })
    }
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/followups/:id/duplicate
followupsRouter.post('/:id/duplicate', async (req, res) => {
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const srcR = await client.query(
        'SELECT * FROM followup_sequences WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      if (!srcR.rows.length) return null
      const src = srcR.rows[0]

      const srcStepsR = await client.query(
        'SELECT * FROM followup_steps WHERE sequence_id = $1 AND tenant_id = $2 ORDER BY order_index ASC',
        [req.params.id, req.user.tenantId]
      )
      const srcSteps = srcStepsR.rows

      const seqR = await client.query(
        `INSERT INTO followup_sequences (tenant_id, created_by, name, description, time_mode, default_send_time)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.user.tenantId, req.user.id, `${src.name} (cópia)`, src.description, src.time_mode, src.default_send_time]
      )
      const sequence = seqR.rows[0]

      let steps = []
      if (srcSteps.length) {
        steps = await insertSteps(client, sequence.id, req.user.tenantId, srcSteps.map((s) => ({
          delay_days: s.delay_days,
          text: s.text,
          media_url: s.media_url,
          media_type: s.media_type,
          media_mimetype: s.media_mimetype,
          media_filename: s.media_filename,
          send_time: s.send_time,
        })))
      }
      return { sequence, steps }
    })
    if (!result) return res.status(404).json({ error: 'Acompanhamento não encontrado.' })
    res.status(201).json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/followups/:id/steps/:stepId/media — anexa arquivo a uma etapa
followupsRouter.post('/:id/steps/:stepId/media', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado ou tipo não permitido.' })
  try {
    const exists = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT id FROM followup_steps WHERE id = $1 AND sequence_id = $2 AND tenant_id = $3 LIMIT 1',
        [req.params.stepId, req.params.id, req.user.tenantId]
      )
      return r.rows.length > 0
    })
    if (!exists) return res.status(404).json({ error: 'Etapa não encontrada.' })

    const filename = req.file.originalname || 'arquivo'
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image'
      : req.file.mimetype.startsWith('video/') ? 'video'
      : req.file.mimetype.startsWith('audio/') ? 'audio'
      : 'document'

    const mediaUrl = await uploadChatMedia(req.user.tenantId, req.file.buffer, req.file.mimetype, filename)

    const step = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `UPDATE followup_steps SET media_url = $1, media_type = $2, media_mimetype = $3, media_filename = $4
         WHERE id = $5 AND tenant_id = $6 RETURNING *`,
        [mediaUrl, mediaType, req.file.mimetype, filename, req.params.stepId, req.user.tenantId]
      )
      return r.rows[0]
    })
    res.json({ step })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
