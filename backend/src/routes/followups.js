import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { supabase, unwrap } from '../db/supabase.js'
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

const stepSchema = z.object({
  delay_days:     z.number().int().min(0).max(3650),
  text:           z.string().min(1).max(4000),
  media_url:      z.string().url().optional().nullable(),
  media_type:     z.string().optional().nullable(),
  media_mimetype: z.string().optional().nullable(),
  media_filename: z.string().optional().nullable(),
})

const sequenceSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  steps:       z.array(stepSchema).min(1).max(50),
})

async function insertSteps(sequenceId, tenantId, steps) {
  return unwrap(
    await supabase.from('followup_steps').insert(
      steps.map((s, i) => ({
        sequence_id: sequenceId,
        tenant_id: tenantId,
        order_index: i,
        delay_days: s.delay_days,
        text: s.text,
        media_url: s.media_url || null,
        media_type: s.media_type || null,
        media_mimetype: s.media_mimetype || null,
        media_filename: s.media_filename || null,
      }))
    ).select('*')
  )
}

// GET /api/followups — lista sequências + contagem de etapas e de contatos ativos
followupsRouter.get('/', async (req, res) => {
  try {
    const sequences = unwrap(
      await supabase.from('followup_sequences').select('*')
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: false })
    )
    if (!sequences.length) return res.json({ sequences: [] })

    const ids = sequences.map((s) => s.id)
    const [steps, enrollments] = await Promise.all([
      supabase.from('followup_steps').select('sequence_id').eq('tenant_id', req.user.tenantId).in('sequence_id', ids),
      supabase.from('followup_enrollments').select('sequence_id').eq('tenant_id', req.user.tenantId).eq('status', 'active').in('sequence_id', ids),
    ])
    const stepCounts = {}
    for (const row of unwrap(steps)) stepCounts[row.sequence_id] = (stepCounts[row.sequence_id] || 0) + 1
    const activeCounts = {}
    for (const row of unwrap(enrollments)) activeCounts[row.sequence_id] = (activeCounts[row.sequence_id] || 0) + 1

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
    const rows = unwrap(
      await supabase.from('followup_sequences').select('*')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Acompanhamento não encontrado.' })

    const steps = unwrap(
      await supabase.from('followup_steps').select('*')
        .eq('sequence_id', req.params.id).eq('tenant_id', req.user.tenantId)
        .order('order_index', { ascending: true })
    )
    res.json({ sequence: rows[0], steps })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/followups — cria sequência + etapas
followupsRouter.post('/', async (req, res) => {
  const parsed = sequenceSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const sequence = unwrap(
      await supabase.from('followup_sequences').insert({
        tenant_id: req.user.tenantId,
        created_by: req.user.id,
        name: parsed.data.name,
        description: parsed.data.description || null,
      }).select('*').single()
    )
    const steps = await insertSteps(sequence.id, req.user.tenantId, parsed.data.steps)
    res.status(201).json({ sequence, steps })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/followups/:id — atualiza nome/descrição e substitui as etapas
followupsRouter.patch('/:id', async (req, res) => {
  const parsed = sequenceSchema.partial({ steps: true }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const rows = unwrap(
      await supabase.from('followup_sequences').select('id')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Acompanhamento não encontrado.' })

    const sequence = unwrap(
      await supabase.from('followup_sequences').update({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.id).eq('tenant_id', req.user.tenantId).select('*').single()
    )

    let steps
    if (parsed.data.steps) {
      await supabase.from('followup_steps').delete().eq('sequence_id', req.params.id).eq('tenant_id', req.user.tenantId)
      steps = await insertSteps(req.params.id, req.user.tenantId, parsed.data.steps)
    } else {
      steps = unwrap(
        await supabase.from('followup_steps').select('*')
          .eq('sequence_id', req.params.id).eq('tenant_id', req.user.tenantId)
          .order('order_index', { ascending: true })
      )
    }
    res.json({ sequence, steps })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/followups/:id — apaga sequência (acompanhamentos já ativos continuam normalmente)
followupsRouter.delete('/:id', async (req, res) => {
  try {
    await supabase.from('followup_sequences').delete().eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/followups/:id/duplicate
followupsRouter.post('/:id/duplicate', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('followup_sequences').select('*')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Acompanhamento não encontrado.' })
    const src = rows[0]

    const srcSteps = unwrap(
      await supabase.from('followup_steps').select('*')
        .eq('sequence_id', req.params.id).eq('tenant_id', req.user.tenantId)
        .order('order_index', { ascending: true })
    )

    const sequence = unwrap(
      await supabase.from('followup_sequences').insert({
        tenant_id: req.user.tenantId,
        created_by: req.user.id,
        name: `${src.name} (cópia)`,
        description: src.description,
      }).select('*').single()
    )

    let steps = []
    if (srcSteps.length) {
      steps = unwrap(
        await supabase.from('followup_steps').insert(
          srcSteps.map((s) => ({
            sequence_id: sequence.id,
            tenant_id: req.user.tenantId,
            order_index: s.order_index,
            delay_days: s.delay_days,
            text: s.text,
            media_url: s.media_url,
            media_type: s.media_type,
            media_mimetype: s.media_mimetype,
            media_filename: s.media_filename,
          }))
        ).select('*')
      )
    }
    res.status(201).json({ sequence, steps })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/followups/:id/steps/:stepId/media — anexa arquivo a uma etapa
followupsRouter.post('/:id/steps/:stepId/media', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado ou tipo não permitido.' })
  try {
    const rows = unwrap(
      await supabase.from('followup_steps').select('id')
        .eq('id', req.params.stepId).eq('sequence_id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Etapa não encontrada.' })

    const filename = req.file.originalname || 'arquivo'
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image'
      : req.file.mimetype.startsWith('video/') ? 'video'
      : req.file.mimetype.startsWith('audio/') ? 'audio'
      : 'document'

    const mediaUrl = await uploadChatMedia(req.user.tenantId, req.file.buffer, req.file.mimetype, filename)

    const step = unwrap(
      await supabase.from('followup_steps').update({
        media_url: mediaUrl,
        media_type: mediaType,
        media_mimetype: req.file.mimetype,
        media_filename: filename,
      }).eq('id', req.params.stepId).eq('tenant_id', req.user.tenantId).select('*').single()
    )
    res.json({ step })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

