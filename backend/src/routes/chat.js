import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant, requirePermission } from '../middleware/auth.js'
import { logUsage } from '../services/usage.js'
import { uploadChatMedia } from '../services/mediaStorage.js'
import { getTenantTimezone } from './business-hours.js'
import { safeFetch } from '../utils/ssrfGuard.js'
import { normalizePhone } from '../utils/phone.js'

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

export const chatRouter = Router()
chatRouter.use(requireAuth, requireTenant, requirePermission('chat'))

const isManager = (role) => role === 'owner' || role === 'admin'

async function logTicketEvent(client, tenantId, leadId, userId, userName, action, toUserId = null, toUserName = null) {
  await client.query(
    `INSERT INTO ticket_logs (tenant_id, lead_id, user_id, user_name, action, to_user_id, to_user_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [tenantId, leadId, userId, userName, action, toUserId, toUserName]
  )
}

// GET /api/chat — lista conversas
chatRouter.get('/', async (req, res) => {
  try {
    const { stage, assigned_to, type } = req.query
    const limit = Math.min(parseInt(req.query.limit, 10) || 300, 1000)
    const offset = parseInt(req.query.offset, 10) || 0

    const result = await withTenant(req.user.tenantId, async (client) => {
      const conditions = ['tenant_id = $1']
      const values = [req.user.tenantId]
      if (stage) { values.push(stage); conditions.push(`stage = $${values.length}`) }
      if (assigned_to) { values.push(assigned_to); conditions.push(`assigned_to = $${values.length}`) }
      if (type === 'group') conditions.push('is_group = true')
      if (type === 'private') conditions.push('is_group = false')
      values.push(limit, offset)

      const leadsR = await client.query(
        `SELECT id, name, phone, stage, human_takeover, conversation_status, assigned_to, channel_id, queue_id, is_group, group_subject, updated_at
         FROM leads WHERE ${conditions.join(' AND ')}
         ORDER BY updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      )
      const leads = leadsR.rows
      if (!leads.length) return { leads: [] }

      const leadIds = leads.map((l) => l.id)

      // Limita a 1500 mensagens (5 por lead em média) para obter a última de cada um.
      // tenant_id é redundante aqui na prática (leadIds já vem de uma consulta de
      // `leads` scoped ao tenant), mas fica como defesa em profundidade.
      const msgsR = await client.query(
        `SELECT lead_id, text, role, created_at FROM messages
         WHERE tenant_id = $1 AND lead_id = ANY($2::uuid[])
         ORDER BY created_at DESC LIMIT 1500`,
        [req.user.tenantId, leadIds]
      )

      const lastByLead = {}
      for (const m of msgsR.rows) {
        if (!lastByLead[m.lead_id]) lastByLead[m.lead_id] = m
      }

      const channelsR = await client.query('SELECT id, name FROM channels WHERE tenant_id = $1', [req.user.tenantId])
      const channelById = Object.fromEntries(channelsR.rows.map((c) => [c.id, c.name]))

      let result = leads.map((l) => ({
        ...l,
        lastMessage: lastByLead[l.id] || null,
        channel_name: l.channel_id ? (channelById[l.channel_id] || null) : null,
        unread: lastByLead[l.id]?.role === 'lead' ? 1 : 0,
      }))

      if (!isManager(req.user.role)) {
        const hasGroups = result.some((l) => l.is_group)
        let groupAccessByLead = {}

        const [myQueueR, tenantR] = await Promise.all([
          client.query('SELECT queue_id FROM queue_operators WHERE user_id = $1', [req.user.id]),
          client.query('SELECT op_settings FROM tenants WHERE id = $1 LIMIT 1', [req.user.tenantId]),
        ])
        const myQueueIds = new Set(myQueueR.rows.map((r) => r.queue_id))
        const opSettings = tenantR.rows[0]?.op_settings || {}
        const showGroupsToAll = opSettings.show_groups_to_all !== false
        const showUnassigned = opSettings.show_unassigned_tickets !== false

        if (hasGroups) {
          const groupLeadIds = result.filter((l) => l.is_group).map((l) => l.id)
          const accessR = await client.query(
            'SELECT lead_id, user_id FROM whatsapp_group_access WHERE lead_id = ANY($1::uuid[])',
            [groupLeadIds]
          )
          for (const row of accessR.rows) {
            (groupAccessByLead[row.lead_id] ||= []).push(row.user_id)
          }
        }

        result = result.filter((l) => {
          if (l.is_group) {
            const granted = groupAccessByLead[l.id]
            if (granted?.length) return granted.includes(req.user.id)
            return showGroupsToAll
          }
          if (l.assigned_to === req.user.id) return true
          if (l.conversation_status !== 'pending') return false
          if (!l.queue_id) return showUnassigned
          return myQueueIds.has(l.queue_id)
        })
      }

      return { leads: result }
    })

    res.json({ leads: result.leads, limit, offset })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/operators
chatRouter.get('/operators', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        "SELECT id, name, email, role FROM users WHERE tenant_id = $1 AND active = true ORDER BY name",
        [req.user.tenantId]
      )
      return r.rows
    })
    res.json({ operators: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/start — iniciar conversa avulsa
const startSchema = z.object({
  phone: z.string().min(1, 'Telefone obrigatório.'),
  name: z.string().max(200).optional().nullable(),
  message: z.string().max(4000).optional().nullable(),
})
chatRouter.post('/start', async (req, res) => {
  const parsed = startSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { phone, name, message } = parsed.data
  try {
    const clean = normalizePhone(phone)

    const lead = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO leads (tenant_id, phone, name, stage, conversation_status, human_takeover, assigned_to, updated_at)
         VALUES ($1, $2, $3, 'Novo Lead', 'open', true, $4, $5)
         ON CONFLICT (tenant_id, phone) DO UPDATE SET
           name = EXCLUDED.name, stage = EXCLUDED.stage, conversation_status = EXCLUDED.conversation_status,
           human_takeover = EXCLUDED.human_takeover, assigned_to = EXCLUDED.assigned_to, updated_at = EXCLUDED.updated_at
         RETURNING id, name, phone, stage, conversation_status, assigned_to`,
        [req.user.tenantId, clean, name || null, req.user.id, new Date().toISOString()]
      )
      const lead = r.rows[0]
      await logTicketEvent(client, req.user.tenantId, lead.id, req.user.id, req.user.name, 'opened')
      return lead
    })

    if (message?.trim()) {
      let sent = null
      let sendError = null
      try {
        const { sendText } = await import('../services/whatsapp/index.js')
        sent = await sendText(req.user.tenantId, clean, message.trim())
      } catch (e) {
        console.warn('[chat/start] WhatsApp:', e.message)
        sendError = e.message
      }
      await withTenant(req.user.tenantId, (client) =>
        client.query(
          `INSERT INTO messages (tenant_id, lead_id, role, text, is_human_takeover, wa_message_id, provider, send_status, send_error)
           VALUES ($1, $2, 'agent', $3, true, $4, $5, $6, $7)`,
          [req.user.tenantId, lead.id, message.trim(), sent?.id || null, sent?.provider || null, sendError ? 'failed' : 'sent', sendError]
        )
      )
    }

    res.status(201).json({ lead })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/:leadId/messages
chatRouter.get('/:leadId/messages', async (req, res) => {
  const { limit = 50, before, after } = req.query
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const conditions = ['lead_id = $1', 'tenant_id = $2']
      const values = [req.params.leadId, req.user.tenantId]
      if (before) { values.push(Number(before)); conditions.push(`id < $${values.length}`) }
      if (after) { values.push(after); conditions.push(`created_at > $${values.length}`) }
      values.push(Number(limit))
      const orderDir = after ? 'ASC' : 'DESC'

      const r = await client.query(
        `SELECT id, role, text, provider, is_human_takeover, media_url, media_type, media_mimetype, media_filename,
                reply_to_id, sender_jid, sender_name, created_at, edited_at, deleted_at, forwarded_from_id, location_lat, location_lng
         FROM messages WHERE ${conditions.join(' AND ')}
         ORDER BY created_at ${orderDir} LIMIT $${values.length}`,
        values
      )
      return r.rows
    })
    res.json({ messages: after ? rows : rows.reverse() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/:leadId/logs
chatRouter.get('/:leadId/logs', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, user_id, user_name, action, to_user_id, to_user_name, created_at
         FROM ticket_logs WHERE lead_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT 50`,
        [req.params.leadId, req.user.tenantId]
      )
      return r.rows
    })
    res.json({ logs: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/:leadId/group-access — lista operadores do tenant + quem já tem acesso ao grupo
chatRouter.get('/:leadId/group-access', async (req, res) => {
  if (!isManager(req.user.role)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const leadR = await client.query(
        'SELECT id, is_group FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.leadId, req.user.tenantId]
      )
      if (!leadR.rows.length) return { status: 404, error: 'Conversa não encontrada.' }
      if (!leadR.rows[0].is_group) return { status: 400, error: 'Esta conversa não é um grupo.' }

      const [operatorsR, accessR] = await Promise.all([
        client.query("SELECT id, name, email FROM users WHERE tenant_id = $1 AND active = true ORDER BY name", [req.user.tenantId]),
        client.query('SELECT user_id FROM whatsapp_group_access WHERE lead_id = $1', [req.params.leadId]),
      ])
      return {
        operators: operatorsR.rows,
        granted_user_ids: accessR.rows.map((r) => r.user_id),
      }
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/chat/:leadId/group-access — substitui a lista de usuários com acesso ao grupo
chatRouter.put('/:leadId/group-access', async (req, res) => {
  if (!isManager(req.user.role)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  const userIds = Array.isArray(req.body?.user_ids) ? req.body.user_ids : null
  if (!userIds) return res.status(400).json({ error: 'user_ids deve ser um array.' })
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const leadR = await client.query(
        'SELECT id, is_group FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.leadId, req.user.tenantId]
      )
      if (!leadR.rows.length) return { status: 404, error: 'Conversa não encontrada.' }
      if (!leadR.rows[0].is_group) return { status: 400, error: 'Esta conversa não é um grupo.' }

      await client.query('DELETE FROM whatsapp_group_access WHERE lead_id = $1', [req.params.leadId])
      if (userIds.length) {
        const values = []
        const placeholders = userIds.map((uid, i) => {
          values.push(req.user.tenantId, req.params.leadId, uid)
          return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
        })
        await client.query(
          `INSERT INTO whatsapp_group_access (tenant_id, lead_id, user_id) VALUES ${placeholders.join(', ')}`,
          values
        )
      }
      return { granted_user_ids: userIds }
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/messages
const msgSchema = z.object({
  text: z.string().min(1).max(4000),
  replyToId: z.coerce.number().int().positive().optional().nullable(),
})

chatRouter.post('/:leadId/messages', async (req, res) => {
  const parsed = msgSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const { lead, quoted } = await withTenant(req.user.tenantId, async (client) => {
      const leadR = await client.query(
        'SELECT id, phone, human_takeover, conversation_status FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.leadId, req.user.tenantId]
      )
      const lead = leadR.rows[0]
      if (!lead) return { lead: null }

      let quoted = null
      if (parsed.data.replyToId) {
        const quotedR = await client.query(
          'SELECT id, role, text, wa_message_id FROM messages WHERE id = $1 AND lead_id = $2 AND tenant_id = $3 LIMIT 1',
          [parsed.data.replyToId, lead.id, req.user.tenantId]
        )
        quoted = quotedR.rows[0] || null
        if (quoted && !quoted.wa_message_id) {
          console.warn(`[chat] mensagem citada id=${quoted.id} não tem wa_message_id — resposta vai sair sem citação nativa no WhatsApp`)
        }
      }
      return { lead, quoted }
    })
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })

    if (lead.conversation_status !== 'open') {
      return res.status(403).json({ error: 'Ticket não está aberto. Atenda ou reabra antes de enviar mensagens.' })
    }

    // Envia ANTES de persistir — sem essa ordem, a mensagem aparecia como
    // "enviada" no Chat mesmo quando o envio ao WhatsApp falhava de verdade
    // (a falha virava só um console.warn). Continua sempre gravando a
    // mensagem (o atendente não perde o que digitou), mas com send_status
    // explícito pra a UI poder mostrar a falha em vez de escondê-la.
    let sent = null
    let sendError = null
    if (lead.phone) {
      try {
        const { sendText } = await import('../services/whatsapp/index.js')
        const { markSentByPlatform } = await import('../services/orchestrator.js')
        markSentByPlatform(req.user.tenantId, lead.phone, parsed.data.text)
        sent = await sendText(req.user.tenantId, lead.phone, parsed.data.text, {
          quotedWaId: quoted?.wa_message_id || undefined,
          quotedFromMe: quoted ? quoted.role !== 'lead' : undefined,
          quotedText: quoted?.text || undefined,
        })
      } catch (e) {
        console.warn('[chat] falha ao enviar WhatsApp:', e.message)
        sendError = e.message
      }
    }

    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO messages (tenant_id, lead_id, role, text, is_human_takeover, reply_to_id, wa_message_id, provider, wa_remote_jid, send_status, send_error)
         VALUES ($1, $2, 'agent', $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          req.user.tenantId, lead.id, parsed.data.text, lead.human_takeover, quoted?.id || null,
          sent?.id || null, sent?.provider || null, sent?.remoteJid || null,
          sendError ? 'failed' : 'sent', sendError,
        ]
      )
      return r.rows[0]
    })

    await logUsage(req.user.tenantId, req.user.id, 'message_sent', { by: 'agent' })
    res.status(201).json({ message: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/:leadId/schedule — lista mensagens agendadas pendentes
chatRouter.get('/:leadId/schedule', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, text, send_at, status, created_at FROM scheduled_messages
         WHERE lead_id = $1 AND tenant_id = $2 AND status = 'pending'
         ORDER BY send_at ASC`,
        [req.params.leadId, req.user.tenantId]
      )
      return r.rows
    })
    res.json({ scheduled: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/schedule — agenda uma mensagem para envio futuro
const scheduleSchema = z.object({
  text: z.string().min(1).max(4000),
  send_at: z.string().datetime(),
})

chatRouter.post('/:leadId/schedule', async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  if (new Date(parsed.data.send_at).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'A data/hora agendada precisa estar no futuro.' })
  }

  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const leadR = await client.query(
        'SELECT id FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.leadId, req.user.tenantId]
      )
      if (!leadR.rows.length) return null

      const r = await client.query(
        `INSERT INTO scheduled_messages (tenant_id, lead_id, created_by, text, send_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.user.tenantId, req.params.leadId, req.user.id, parsed.data.text, parsed.data.send_at]
      )
      return r.rows[0]
    })
    if (!row) return res.status(404).json({ error: 'Lead não encontrado.' })
    res.status(201).json({ scheduled: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/chat/:leadId/schedule/:id — cancela mensagem agendada
chatRouter.delete('/:leadId/schedule/:id', async (req, res) => {
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT status FROM scheduled_messages WHERE id = $1 AND lead_id = $2 AND tenant_id = $3 LIMIT 1',
        [req.params.id, req.params.leadId, req.user.tenantId]
      )
      if (!r.rows.length) return { status: 404, error: 'Agendamento não encontrado.' }
      if (r.rows[0].status !== 'pending') return { status: 400, error: 'Este agendamento já foi processado.' }

      await client.query(
        "UPDATE scheduled_messages SET status = 'cancelled' WHERE id = $1 AND tenant_id = $2",
        [req.params.id, req.user.tenantId]
      )
      return { cancelled: true }
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/media
chatRouter.post('/:leadId/media', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado ou tipo não permitido.' })
  try {
    const lead = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT id, phone, human_takeover, conversation_status FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.leadId, req.user.tenantId]
      )
      return r.rows[0]
    })
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })

    if (lead.conversation_status !== 'open') {
      return res.status(403).json({ error: 'Ticket não está aberto.' })
    }

    const caption = req.body.caption || ''
    const filename = req.file.originalname || 'arquivo'
    const label = `[Arquivo: ${filename}]${caption ? ' ' + caption : ''}`
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image'
      : req.file.mimetype.startsWith('video/') ? 'video'
      : req.file.mimetype.startsWith('audio/') ? 'audio'
      : 'document'

    let mediaUrl = null
    try {
      mediaUrl = await uploadChatMedia(req.user.tenantId, req.file.buffer, req.file.mimetype, filename)
    } catch (e) {
      console.warn('[chat/media] falha ao salvar no storage:', e.message)
    }

    // Duração real do áudio, contada segundo a segundo pelo frontend durante a
    // gravação — o navegador não lê corretamente a duração de um WebM gerado
    // pelo MediaRecorder, então não dá pra confiar em nenhum valor derivado do
    // próprio arquivo aqui no backend. Só aceita valor plausível (evita lixo).
    const rawDuration = Number(req.body.duration)
    const mediaDurationSeconds = mediaType === 'audio' && Number.isFinite(rawDuration) && rawDuration > 0 && rawDuration <= 3600
      ? Math.round(rawDuration)
      : null

    const replyToId = req.body.replyToId ? Number(req.body.replyToId) : null
    const quoted = await withTenant(req.user.tenantId, async (client) => {
      if (!replyToId) return null
      const r = await client.query(
        'SELECT id, role, text, wa_message_id FROM messages WHERE id = $1 AND lead_id = $2 AND tenant_id = $3 LIMIT 1',
        [replyToId, lead.id, req.user.tenantId]
      )
      const q = r.rows[0] || null
      if (q && !q.wa_message_id) {
        console.warn(`[chat/media] mensagem citada id=${q.id} não tem wa_message_id — resposta vai sair sem citação nativa no WhatsApp`)
      }
      return q
    })

    // Envia ANTES de persistir (ver comentário equivalente na rota de texto acima).
    let sent = null
    let sendError = null
    if (lead.phone) {
      try {
        const { sendMedia } = await import('../services/whatsapp/index.js')
        const { markSentByPlatform } = await import('../services/orchestrator.js')
        // Evolution ecoa a própria mensagem enviada via webhook (fromMe) com esse mesmo texto —
        // marca como "já processada" para não duplicar a mensagem no histórico.
        markSentByPlatform(req.user.tenantId, lead.phone, caption || `[${mediaType}]`)
        sent = await sendMedia(req.user.tenantId, lead.phone, {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          filename,
          caption,
          quotedWaId: quoted?.wa_message_id || undefined,
          quotedFromMe: quoted ? quoted.role !== 'lead' : undefined,
          quotedText: quoted?.text || undefined,
        })
      } catch (e) {
        console.warn('[chat/media] WhatsApp:', e.message)
        sendError = e.message
      }
    }

    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO messages (tenant_id, lead_id, role, text, is_human_takeover, media_url, media_type, media_mimetype,
                media_filename, media_duration_seconds, reply_to_id, wa_message_id, provider, wa_remote_jid, send_status, send_error)
         VALUES ($1, $2, 'agent', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          req.user.tenantId, lead.id, label, lead.human_takeover, mediaUrl, mediaType, req.file.mimetype,
          filename, mediaDurationSeconds, quoted?.id || null, sent?.id || null, sent?.provider || null,
          sent?.remoteJid || null, sendError ? 'failed' : 'sent', sendError,
        ]
      )
      return r.rows[0]
    })

    res.status(201).json({ message: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/chat/:leadId/messages/:messageId — edita mensagem já enviada
// Só funciona em canais Evolution (a Cloud API da Meta não tem endpoint de edição)
// e só para mensagens que a própria plataforma enviou (role='agent').
const editMsgSchema = z.object({ text: z.string().min(1).max(4000) })
chatRouter.patch('/:leadId/messages/:messageId', async (req, res) => {
  const parsed = editMsgSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const check = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT id, role, provider, wa_message_id, wa_remote_jid, deleted_at FROM messages WHERE id = $1 AND lead_id = $2 AND tenant_id = $3 LIMIT 1',
        [req.params.messageId, req.params.leadId, req.user.tenantId]
      )
      const msg = r.rows[0]
      if (!msg) return { status: 404, error: 'Mensagem não encontrada.' }
      if (msg.deleted_at) return { status: 400, error: 'Mensagem já foi apagada.' }
      if (msg.role !== 'agent') return { status: 403, error: 'Só é possível editar mensagens enviadas pela plataforma.' }
      if (msg.provider !== 'evolution') return { status: 400, error: 'Editar mensagem só está disponível em canais Evolution.' }
      if (!msg.wa_message_id) {
        return { status: 400, error: 'Mensagem antiga (enviada antes desta atualização) — não é possível editar.' }
      }

      // prefere o remoteJid do LEAD (capturado de mensagens recebidas, mais confiável em
      // conversas no modo LID) e só cai pro remoteJid gravado na própria mensagem se o lead
      // ainda não tiver um (ex: lead que só recebeu mensagens nossas, nunca respondeu).
      const leadR = await client.query('SELECT wa_remote_jid FROM leads WHERE id = $1 LIMIT 1', [req.params.leadId])
      const remoteJid = leadR.rows[0]?.wa_remote_jid || msg.wa_remote_jid
      if (!remoteJid) {
        return { status: 400, error: 'Não sabemos o identificador dessa conversa no WhatsApp ainda — não é possível editar.' }
      }
      return { msg, remoteJid }
    })
    if (check.error) return res.status(check.status).json({ error: check.error })
    const { msg, remoteJid } = check

    const { editMessage } = await import('../services/whatsapp/index.js')
    try {
      await editMessage(req.user.tenantId, { waMessageId: msg.wa_message_id, remoteJid, newText: parsed.data.text })
    } catch (e) {
      // Bug conhecido da Evolution API: falha ao editar mensagens em conversas no modo
      // de endereçamento LID (@lid) do WhatsApp, mesmo com o remoteJid correto.
      if (/remotejid/i.test(e.message)) {
        return res.status(400).json({ error: 'Não foi possível editar esta mensagem — limitação do WhatsApp/Evolution nesta conversa. Tente apagar e enviar novamente.' })
      }
      throw e
    }

    const updated = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'UPDATE messages SET text = $1, edited_at = $2 WHERE id = $3 RETURNING *',
        [parsed.data.text, new Date().toISOString(), msg.id]
      )
      return r.rows[0]
    })
    res.json({ message: updated })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/chat/:leadId/messages/:messageId — apaga uma mensagem "para todos"
// (diferente de DELETE /:leadId, que apaga a conversa inteira). Só Evolution, só mensagens próprias.
chatRouter.delete('/:leadId/messages/:messageId', async (req, res) => {
  try {
    const check = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT id, role, provider, wa_message_id, wa_remote_jid, deleted_at FROM messages WHERE id = $1 AND lead_id = $2 AND tenant_id = $3 LIMIT 1',
        [req.params.messageId, req.params.leadId, req.user.tenantId]
      )
      const msg = r.rows[0]
      if (!msg) return { status: 404, error: 'Mensagem não encontrada.' }
      if (msg.deleted_at) return { done: true } // idempotente
      if (msg.role !== 'agent') return { status: 403, error: 'Só é possível apagar mensagens enviadas pela plataforma.' }
      if (msg.provider !== 'evolution') return { status: 400, error: 'Apagar mensagem só está disponível em canais Evolution.' }

      const leadR = await client.query('SELECT wa_remote_jid FROM leads WHERE id = $1 LIMIT 1', [req.params.leadId])
      const remoteJid = leadR.rows[0]?.wa_remote_jid || msg.wa_remote_jid
      return { msg, remoteJid }
    })
    if (check.error) return res.status(check.status).json({ error: check.error })
    if (check.done) return res.json({ deleted: true })
    const { msg, remoteJid } = check

    if (msg.wa_message_id && remoteJid) {
      const { deleteMessage } = await import('../services/whatsapp/index.js')
      try {
        await deleteMessage(req.user.tenantId, { waMessageId: msg.wa_message_id, remoteJid })
      } catch (e) {
        // Mesma limitação conhecida da Evolution API em conversas no modo LID — ver PATCH acima.
        if (/remotejid/i.test(e.message)) {
          return res.status(400).json({ error: 'Não foi possível apagar esta mensagem no WhatsApp — limitação do WhatsApp/Evolution nesta conversa.' })
        }
        throw e
      }
    }

    await withTenant(req.user.tenantId, (client) =>
      client.query(
        "UPDATE messages SET text = '', media_url = NULL, deleted_at = $1 WHERE id = $2",
        [new Date().toISOString(), msg.id]
      )
    )
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/messages/:messageId/forward — encaminha uma mensagem para outro lead
const forwardSchema = z.object({ toLeadId: z.string().min(1) })
chatRouter.post('/:leadId/messages/:messageId/forward', async (req, res) => {
  const parsed = forwardSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Selecione um lead de destino.' })
  try {
    const check = await withTenant(req.user.tenantId, async (client) => {
      const msgR = await client.query(
        'SELECT * FROM messages WHERE id = $1 AND lead_id = $2 AND tenant_id = $3 LIMIT 1',
        [req.params.messageId, req.params.leadId, req.user.tenantId]
      )
      const original = msgR.rows[0]
      if (!original || original.deleted_at) return { status: 404, error: 'Mensagem não encontrada.' }

      const destR = await client.query(
        'SELECT id, phone, human_takeover, conversation_status FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [parsed.data.toLeadId, req.user.tenantId]
      )
      const dest = destR.rows[0]
      if (!dest) return { status: 404, error: 'Lead de destino não encontrado.' }
      if (dest.conversation_status !== 'open') return { status: 403, error: 'Ticket de destino não está aberto.' }

      return { original, dest }
    })
    if (check.error) return res.status(check.status).json({ error: check.error })
    const { original, dest } = check

    const { sendText, sendMedia, sendLocation } = await import('../services/whatsapp/index.js')

    const insertPayload = {
      tenant_id: req.user.tenantId,
      lead_id: dest.id,
      role: 'agent',
      is_human_takeover: dest.human_takeover,
      forwarded_from_id: original.id,
      text: original.text,
    }
    let sent = null
    let sendError = null

    // Cada branch fica no seu próprio try/catch: uma falha no reenvio não pode
    // derrubar a rota inteira com 500 (o encaminhamento em si é uma ação
    // válida mesmo se o envio ao WhatsApp falhar) nem virar uma mensagem
    // "fantasma" gravada como se tivesse sido entregue.
    if (original.location_lat != null) {
      insertPayload.location_lat = original.location_lat
      insertPayload.location_lng = original.location_lng
      if (dest.phone) {
        try {
          sent = await sendLocation(req.user.tenantId, dest.phone, { latitude: original.location_lat, longitude: original.location_lng })
        } catch (e) {
          console.warn('[chat/forward] falha ao reenviar localização:', e.message)
          sendError = e.message
        }
      }
    } else if (original.media_url) {
      insertPayload.media_url = original.media_url
      insertPayload.media_type = original.media_type
      insertPayload.media_mimetype = original.media_mimetype
      insertPayload.media_filename = original.media_filename
      if (dest.phone) {
        try {
          const buf = await safeFetch(original.media_url).then((r) => r.arrayBuffer())
          sent = await sendMedia(req.user.tenantId, dest.phone, {
            buffer: Buffer.from(buf), mimetype: original.media_mimetype, filename: original.media_filename, caption: '',
          })
        } catch (e) {
          console.warn('[chat/forward] falha ao reenviar mídia:', e.message)
          sendError = e.message
        }
      }
    } else if (dest.phone) {
      try {
        sent = await sendText(req.user.tenantId, dest.phone, original.text || '')
      } catch (e) {
        console.warn('[chat/forward] falha ao reenviar texto:', e.message)
        sendError = e.message
      }
    }

    if (sent?.id) {
      insertPayload.wa_message_id = sent.id
      insertPayload.provider = sent.provider
    }
    insertPayload.send_status = sendError ? 'failed' : 'sent'
    insertPayload.send_error = sendError

    const row = await withTenant(req.user.tenantId, async (client) => {
      const columns = Object.keys(insertPayload)
      const placeholders = columns.map((_, i) => `$${i + 1}`)
      const values = columns.map((c) => insertPayload[c])
      const r = await client.query(
        `INSERT INTO messages (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        values
      )
      return r.rows[0]
    })
    res.status(201).json({ message: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/location — envia localização (funciona em Meta e Evolution)
const locationSchema = z.object({ latitude: z.number(), longitude: z.number() })
chatRouter.post('/:leadId/location', async (req, res) => {
  const parsed = locationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Localização inválida.' })
  try {
    const lead = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT id, phone, human_takeover, conversation_status FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.leadId, req.user.tenantId]
      )
      return r.rows[0]
    })
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })
    if (lead.conversation_status !== 'open') return res.status(403).json({ error: 'Ticket não está aberto.' })

    let sent = null
    let sendError = null
    if (lead.phone) {
      try {
        const { sendLocation } = await import('../services/whatsapp/index.js')
        sent = await sendLocation(req.user.tenantId, lead.phone, { latitude: parsed.data.latitude, longitude: parsed.data.longitude })
      } catch (e) {
        console.warn('[chat] falha ao enviar localização:', e.message)
        sendError = e.message
      }
    }

    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO messages (tenant_id, lead_id, role, text, is_human_takeover, location_lat, location_lng, wa_message_id, provider, wa_remote_jid, send_status, send_error)
         VALUES ($1, $2, 'agent', 'Localização compartilhada', $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          req.user.tenantId, lead.id, lead.human_takeover, parsed.data.latitude, parsed.data.longitude,
          sent?.id || null, sent?.provider || null, sent?.remoteJid || null, sendError ? 'failed' : 'sent', sendError,
        ]
      )
      return r.rows[0]
    })

    res.status(201).json({ message: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/transfer
const transferSchema = z.object({ human_takeover: z.boolean() })
chatRouter.post('/:leadId/transfer', async (req, res) => {
  const parsed = transferSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'human_takeover deve ser true ou false.' })
  const { human_takeover } = parsed.data
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `UPDATE leads SET human_takeover = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4
         RETURNING id, human_takeover`,
        [!!human_takeover, new Date().toISOString(), req.params.leadId, req.user.tenantId]
      )
      await client.query(
        `INSERT INTO messages (tenant_id, lead_id, role, text, is_human_takeover) VALUES ($1, $2, 'agent', $3, $4)`,
        [req.user.tenantId, req.params.leadId, human_takeover ? '— Atendimento transferido para humano —' : '— IA retomou o atendimento —', !!human_takeover]
      )
      if (human_takeover) {
        await client.query(
          "UPDATE flow_sessions SET status = 'transferred' WHERE lead_id = $1 AND tenant_id = $2 AND status = 'active'",
          [req.params.leadId, req.user.tenantId]
        )
      }
      return r.rows[0]
    })
    if (human_takeover) {
      await logUsage(req.user.tenantId, req.user.id, 'human_takeover', { lead_id: req.params.leadId })
    }
    res.json({ lead: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/transfer-to
const transferToSchema = z.object({ userId: z.string().min(1, 'userId obrigatório.') })
chatRouter.post('/:leadId/transfer-to', async (req, res) => {
  const parsed = transferToSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { userId } = parsed.data
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const opR = await client.query(
        'SELECT id, name, email FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [userId, req.user.tenantId]
      )
      if (!opR.rows.length) return { status: 404, error: 'Operador não encontrado.' }
      const toUser = opR.rows[0]

      const leadR = await client.query(
        `UPDATE leads SET assigned_to = $1, conversation_status = 'open', human_takeover = true, updated_at = $2
         WHERE id = $3 AND tenant_id = $4
         RETURNING id, conversation_status, assigned_to`,
        [userId, new Date().toISOString(), req.params.leadId, req.user.tenantId]
      )

      await client.query(
        `INSERT INTO messages (tenant_id, lead_id, role, text) VALUES ($1, $2, 'system', $3)`,
        [req.user.tenantId, req.params.leadId, `— Atendimento transferido para ${toUser.name || toUser.email} —`]
      )

      await logTicketEvent(
        client, req.user.tenantId, req.params.leadId,
        req.user.id, req.user.name,
        'transferred',
        toUser.id, toUser.name || toUser.email
      )

      return { lead: leadR.rows[0], to: toUser }
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/attend
chatRouter.post('/:leadId/attend', async (req, res) => {
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `UPDATE leads SET conversation_status = 'open', human_takeover = true, assigned_to = $1, updated_at = $2
         WHERE id = $3 AND tenant_id = $4
         RETURNING id, conversation_status, assigned_to`,
        [req.user.id, new Date().toISOString(), req.params.leadId, req.user.tenantId]
      )
      await client.query(
        `INSERT INTO messages (tenant_id, lead_id, role, text, is_human_takeover) VALUES ($1, $2, 'system', $3, true)`,
        [req.user.tenantId, req.params.leadId, `— Atendimento iniciado por ${req.user.name} —`]
      )
      await logTicketEvent(client, req.user.tenantId, req.params.leadId, req.user.id, req.user.name, 'opened')
      return r.rows[0]
    })
    res.json({ lead: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/reopen
chatRouter.post('/:leadId/reopen', async (req, res) => {
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `UPDATE leads SET conversation_status = 'open', human_takeover = true, assigned_to = $1, updated_at = $2
         WHERE id = $3 AND tenant_id = $4
         RETURNING id, conversation_status`,
        [req.user.id, new Date().toISOString(), req.params.leadId, req.user.tenantId]
      )
      await client.query(
        `INSERT INTO messages (tenant_id, lead_id, role, text) VALUES ($1, $2, 'system', $3)`,
        [req.user.tenantId, req.params.leadId, `— Ticket reaberto por ${req.user.name} —`]
      )
      await logTicketEvent(client, req.user.tenantId, req.params.leadId, req.user.id, req.user.name, 'reopened')
      return r.rows[0]
    })
    res.json({ lead: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/return-to-queue
chatRouter.post('/:leadId/return-to-queue', async (req, res) => {
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `UPDATE leads SET conversation_status = 'pending', human_takeover = false, assigned_to = NULL, updated_at = $1
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, conversation_status`,
        [new Date().toISOString(), req.params.leadId, req.user.tenantId]
      )
      await client.query(
        `INSERT INTO messages (tenant_id, lead_id, role, text, is_human_takeover) VALUES ($1, $2, 'system', $3, false)`,
        [req.user.tenantId, req.params.leadId, `— Ticket retornado à fila por ${req.user.name} —`]
      )
      await logTicketEvent(client, req.user.tenantId, req.params.leadId, req.user.id, req.user.name, 'pending')
      return r.rows[0]
    })
    res.json({ lead: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/chat/:leadId
chatRouter.delete('/:leadId', async (req, res) => {
  if (!isManager(req.user.role)) {
    return res.status(403).json({ error: 'Apenas administradores podem deletar conversas.' })
  }
  try {
    const found = await withTenant(req.user.tenantId, async (client) => {
      const leadR = await client.query(
        'SELECT id FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.leadId, req.user.tenantId]
      )
      if (!leadR.rows.length) return false

      await client.query('DELETE FROM messages WHERE lead_id = $1 AND tenant_id = $2', [req.params.leadId, req.user.tenantId])
      await client.query('DELETE FROM ticket_logs WHERE lead_id = $1 AND tenant_id = $2', [req.params.leadId, req.user.tenantId])
      await client.query('DELETE FROM leads WHERE id = $1 AND tenant_id = $2', [req.params.leadId, req.user.tenantId])
      return true
    })
    if (!found) return res.status(404).json({ error: 'Conversa não encontrada.' })
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/resolve
chatRouter.post('/:leadId/resolve', async (req, res) => {
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `UPDATE leads SET conversation_status = 'resolved', human_takeover = false, assigned_to = NULL, updated_at = $1
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, conversation_status`,
        [new Date().toISOString(), req.params.leadId, req.user.tenantId]
      )
      await client.query(
        `INSERT INTO messages (tenant_id, lead_id, role, text, is_human_takeover) VALUES ($1, $2, 'system', $3, false)`,
        [req.user.tenantId, req.params.leadId, `— Atendimento finalizado por ${req.user.name} —`]
      )
      await logTicketEvent(client, req.user.tenantId, req.params.leadId, req.user.id, req.user.name, 'closed')
      return r.rows[0]
    })
    res.json({ lead: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── ACOMPANHAMENTOS (sequências de mensagens automáticas) ──────

// ─── cálculo do horário de envio (respeitando o fuso horário do tenant) ───
function ymdInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type) => Number(parts.find((p) => p.type === type).value)
  return { y: get('year'), m: get('month'), d: get('day') }
}

function addDaysToYmd({ y, m, d }, days) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

// Converte um horário de parede (ano/mês/dia/hora/min) num fuso horário específico para um instante UTC real
function zonedTimeToUtc({ y, m, d }, hh, mm, timeZone) {
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm)
  const asIfLocal = new Date(new Date(utcGuess).toLocaleString('en-US', { timeZone }))
  const diff = utcGuess - asIfLocal.getTime()
  return new Date(utcGuess + diff)
}

async function materializeFollowupMessages(client, tenantId, leadId, enrollmentId, sequence, startedAt) {
  const stepsR = await client.query(
    'SELECT * FROM followup_steps WHERE sequence_id = $1 AND tenant_id = $2 ORDER BY order_index ASC',
    [sequence.id, tenantId]
  )
  const steps = stepsR.rows
  if (!steps.length) return []

  const startedDate = new Date(startedAt)
  const timezone = await getTenantTimezone(tenantId)
  const baseYmd = ymdInTimezone(startedDate, timezone)

  const rows = steps.map((s) => {
    // "Enviar imediatamente" (dia 0) mantém o horário exato do início do acompanhamento
    let sendAt = startedDate
    if (s.delay_days > 0) {
      const dayYmd = addDaysToYmd(baseYmd, s.delay_days)
      const timeStr = (sequence.time_mode === 'individual' ? s.send_time : null) || sequence.default_send_time || '09:00'
      const [hh, mm] = timeStr.split(':').map(Number)
      sendAt = zonedTimeToUtc(dayYmd, hh, mm, timezone)
    }
    return [tenantId, enrollmentId, leadId, s.id, s.order_index, s.text, s.media_url, s.media_type, s.media_mimetype, s.media_filename, sendAt.toISOString()]
  })

  const COLS = ['tenant_id', 'enrollment_id', 'lead_id', 'step_id', 'order_index', 'text', 'media_url', 'media_type', 'media_mimetype', 'media_filename', 'send_at']
  const values = []
  const placeholders = rows.map((row, ri) => {
    const base = ri * COLS.length
    values.push(...row)
    return `(${row.map((_, ci) => `$${base + ci + 1}`).join(', ')})`
  })
  const r = await client.query(
    `INSERT INTO followup_enrollment_messages (${COLS.join(', ')}) VALUES ${placeholders.join(', ')} RETURNING *`,
    values
  )
  return r.rows
}

async function loadActiveFollowup(client, tenantId, leadId) {
  const enrollmentR = await client.query(
    "SELECT * FROM followup_enrollments WHERE lead_id = $1 AND tenant_id = $2 AND status = 'active' LIMIT 1",
    [leadId, tenantId]
  )
  const enrollment = enrollmentR.rows[0]
  if (!enrollment) return null

  const [seqR, messagesR] = await Promise.all([
    client.query('SELECT name FROM followup_sequences WHERE id = $1 AND tenant_id = $2 LIMIT 1', [enrollment.sequence_id, tenantId]),
    client.query(
      'SELECT order_index, status, send_at FROM followup_enrollment_messages WHERE enrollment_id = $1 AND tenant_id = $2 ORDER BY order_index ASC',
      [enrollment.id, tenantId]
    ),
  ])
  const sequenceName = seqR.rows[0]?.name || '—'
  const msgs = messagesR.rows
  const sentCount = msgs.filter((m) => m.status === 'sent').length
  const nextPending = msgs.find((m) => m.status === 'pending')

  return {
    id: enrollment.id,
    sequence_id: enrollment.sequence_id,
    sequence_name: sequenceName,
    status: enrollment.status,
    started_at: enrollment.started_at,
    total_steps: msgs.length,
    sent_count: sentCount,
    next_send_at: nextPending?.send_at || null,
  }
}

// GET /api/chat/:leadId/followup — acompanhamento ativo do lead (ou null)
chatRouter.get('/:leadId/followup', async (req, res) => {
  try {
    const active = await withTenant(req.user.tenantId, (client) => loadActiveFollowup(client, req.user.tenantId, req.params.leadId))
    res.json({ followup: active })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/followup/start — inicia um acompanhamento para o lead
chatRouter.post('/:leadId/followup/start', async (req, res) => {
  const { sequence_id } = req.body
  if (!sequence_id) return res.status(400).json({ error: 'sequence_id obrigatório.' })

  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const existing = await loadActiveFollowup(client, req.user.tenantId, req.params.leadId)
      if (existing) return { status: 409, error: 'Este contato já tem um acompanhamento ativo.', followup: existing }

      const leadR = await client.query(
        'SELECT id FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.leadId, req.user.tenantId]
      )
      if (!leadR.rows.length) return { status: 404, error: 'Lead não encontrado.' }

      const seqR = await client.query(
        'SELECT id, name, time_mode, default_send_time FROM followup_sequences WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [sequence_id, req.user.tenantId]
      )
      if (!seqR.rows.length) return { status: 404, error: 'Acompanhamento não encontrado.' }

      const startedAt = new Date().toISOString()
      const enrollR = await client.query(
        `INSERT INTO followup_enrollments (tenant_id, sequence_id, lead_id, created_by, started_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.user.tenantId, sequence_id, req.params.leadId, req.user.id, startedAt]
      )
      const enrollment = enrollR.rows[0]
      await materializeFollowupMessages(client, req.user.tenantId, req.params.leadId, enrollment.id, seqR.rows[0], startedAt)

      return { followup: await loadActiveFollowup(client, req.user.tenantId, req.params.leadId) }
    })
    if (result.error) return res.status(result.status).json(result.followup ? { error: result.error, followup: result.followup } : { error: result.error })
    res.status(201).json(result)
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Este contato já tem um acompanhamento ativo.' })
    res.status(500).json({ error: e.message })
  }
})

async function stopEnrollment(client, tenantId, leadId, enrollmentId, finalStatus) {
  const r = await client.query(
    "SELECT id FROM followup_enrollments WHERE id = $1 AND lead_id = $2 AND tenant_id = $3 AND status = 'active' LIMIT 1",
    [enrollmentId, leadId, tenantId]
  )
  if (!r.rows.length) return false

  await client.query(
    'UPDATE followup_enrollments SET status = $1, finished_at = $2 WHERE id = $3 AND tenant_id = $4',
    [finalStatus, new Date().toISOString(), enrollmentId, tenantId]
  )

  await client.query(
    "UPDATE followup_enrollment_messages SET status = 'cancelled' WHERE enrollment_id = $1 AND tenant_id = $2 AND status = 'pending'",
    [enrollmentId, tenantId]
  )

  return true
}

// POST /api/chat/:leadId/followup/:enrollmentId/cancel
chatRouter.post('/:leadId/followup/:enrollmentId/cancel', async (req, res) => {
  try {
    const stopped = await withTenant(req.user.tenantId, (client) =>
      stopEnrollment(client, req.user.tenantId, req.params.leadId, req.params.enrollmentId, 'cancelled')
    )
    if (!stopped) return res.status(404).json({ error: 'Acompanhamento ativo não encontrado.' })
    res.json({ cancelled: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/followup/:enrollmentId/finish
chatRouter.post('/:leadId/followup/:enrollmentId/finish', async (req, res) => {
  try {
    const stopped = await withTenant(req.user.tenantId, (client) =>
      stopEnrollment(client, req.user.tenantId, req.params.leadId, req.params.enrollmentId, 'completed')
    )
    if (!stopped) return res.status(404).json({ error: 'Acompanhamento ativo não encontrado.' })
    res.json({ finished: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/followup/:enrollmentId/restart
chatRouter.post('/:leadId/followup/:enrollmentId/restart', async (req, res) => {
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const enrollR = await client.query(
        'SELECT sequence_id FROM followup_enrollments WHERE id = $1 AND lead_id = $2 AND tenant_id = $3 LIMIT 1',
        [req.params.enrollmentId, req.params.leadId, req.user.tenantId]
      )
      if (!enrollR.rows.length) return { status: 404, error: 'Acompanhamento não encontrado.' }
      const sequenceId = enrollR.rows[0].sequence_id

      const seqR = await client.query(
        'SELECT id, name, time_mode, default_send_time FROM followup_sequences WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [sequenceId, req.user.tenantId]
      )
      if (!seqR.rows.length) return { status: 404, error: 'Acompanhamento não encontrado.' }

      await stopEnrollment(client, req.user.tenantId, req.params.leadId, req.params.enrollmentId, 'cancelled')

      const startedAt = new Date().toISOString()
      const newEnrollR = await client.query(
        `INSERT INTO followup_enrollments (tenant_id, sequence_id, lead_id, created_by, started_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.user.tenantId, sequenceId, req.params.leadId, req.user.id, startedAt]
      )
      const enrollment = newEnrollR.rows[0]
      await materializeFollowupMessages(client, req.user.tenantId, req.params.leadId, enrollment.id, seqR.rows[0], startedAt)

      return { followup: await loadActiveFollowup(client, req.user.tenantId, req.params.leadId) }
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.status(201).json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
