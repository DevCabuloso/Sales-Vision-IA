import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { logUsage } from '../services/usage.js'
import { uploadChatMedia } from '../services/mediaStorage.js'
import { getTenantTimezone } from './business-hours.js'
import { safeFetch } from '../utils/ssrfGuard.js'

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
chatRouter.use(requireAuth, requireTenant)

const isManager = (role) => role === 'owner' || role === 'admin'

async function logTicketEvent(tenantId, leadId, userId, userName, action, toUserId = null, toUserName = null) {
  await supabase.from('ticket_logs').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    user_id: userId,
    user_name: userName,
    action,
    to_user_id: toUserId,
    to_user_name: toUserName,
  })
}

// GET /api/chat — lista conversas
chatRouter.get('/', async (req, res) => {
  try {
    const { stage, assigned_to, type } = req.query

    let q = supabase.from('leads')
      .select('id, name, phone, stage, human_takeover, conversation_status, assigned_to, channel_id, queue_id, is_group, group_subject, updated_at')
      .eq('tenant_id', req.user.tenantId)
      .order('updated_at', { ascending: false })
      .limit(300)

    if (stage) q = q.eq('stage', stage)
    if (assigned_to) q = q.eq('assigned_to', assigned_to)
    if (type === 'group') q = q.eq('is_group', true)
    if (type === 'private') q = q.eq('is_group', false)

    const leads = unwrap(await q)
    if (!leads.length) return res.json({ leads: [] })

    const leadIds = leads.map((l) => l.id)

    // Limita a 1500 mensagens (5 por lead em média) para obter a última de cada um
    const msgs = unwrap(
      await supabase.from('messages').select('lead_id, text, role, created_at')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
        .limit(1500)
    )

    const lastByLead = {}
    for (const m of msgs) {
      if (!lastByLead[m.lead_id]) lastByLead[m.lead_id] = m
    }

    const channels = unwrap(
      await supabase.from('channels').select('id, name').eq('tenant_id', req.user.tenantId)
    )
    const channelById = Object.fromEntries((channels || []).map((c) => [c.id, c.name]))

    let result = leads.map((l) => ({
      ...l,
      lastMessage: lastByLead[l.id] || null,
      channel_name: l.channel_id ? (channelById[l.channel_id] || null) : null,
      unread: lastByLead[l.id]?.role === 'lead' ? 1 : 0,
    }))

    if (!isManager(req.user.role)) {
      const hasGroups = result.some((l) => l.is_group)
      let groupAccessByLead = {}

      const [myQueueRows, tenantRow] = await Promise.all([
        supabase.from('queue_operators').select('queue_id').eq('user_id', req.user.id),
        supabase.from('tenants').select('op_settings').eq('id', req.user.tenantId).limit(1),
      ])
      const myQueueIds = new Set(unwrap(myQueueRows).map((r) => r.queue_id))
      const opSettings = unwrap(tenantRow)?.[0]?.op_settings || {}
      const showGroupsToAll = opSettings.show_groups_to_all !== false
      const showUnassigned = opSettings.show_unassigned_tickets !== false

      if (hasGroups) {
        const groupLeadIds = result.filter((l) => l.is_group).map((l) => l.id)
        const accessRows = unwrap(
          await supabase.from('whatsapp_group_access').select('lead_id, user_id').in('lead_id', groupLeadIds)
        )
        for (const row of accessRows) {
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

    res.json({ leads: result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/debug-recent — últimas 20 mensagens do tenant (debug)
chatRouter.get('/debug-recent', async (req, res) => {
  try {
    const msgs = unwrap(
      await supabase.from('messages')
        .select('id, lead_id, role, text, created_at')
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: false })
        .limit(20)
    )
    const leads = unwrap(
      await supabase.from('leads')
        .select('id, name, phone, conversation_status')
        .eq('tenant_id', req.user.tenantId)
        .order('updated_at', { ascending: false })
        .limit(20)
    )
    res.json({ messages: msgs, leads })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/operators
chatRouter.get('/operators', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('users').select('id, name, email, role')
        .eq('tenant_id', req.user.tenantId)
        .eq('active', true)
        .order('name')
    )
    res.json({ operators: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/start — iniciar conversa avulsa
chatRouter.post('/start', async (req, res) => {
  const { phone, name, message } = req.body
  if (!phone) return res.status(400).json({ error: 'Telefone obrigatório.' })
  try {
    const clean = phone.replace(/\D/g, '')
    const lead = unwrap(
      await supabase.from('leads').upsert({
        tenant_id: req.user.tenantId,
        phone: clean,
        name: name || null,
        stage: 'Novo Lead',
        conversation_status: 'open',
        human_takeover: true,
        assigned_to: req.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone', ignoreDuplicates: false })
        .select('id, name, phone, stage, conversation_status, assigned_to').single()
    )

    await logTicketEvent(req.user.tenantId, lead.id, req.user.id, req.user.name, 'opened')

    if (message?.trim()) {
      await supabase.from('messages').insert({
        tenant_id: req.user.tenantId,
        lead_id: lead.id,
        role: 'agent',
        text: message.trim(),
        is_human_takeover: true,
      })
      try {
        const { sendText } = await import('../services/whatsapp/index.js')
        await sendText(req.user.tenantId, clean, message.trim())
      } catch (e) {
        console.warn('[chat/start] WhatsApp:', e.message)
      }
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
    let q = supabase.from('messages').select('id, role, text, provider, is_human_takeover, media_url, media_type, media_mimetype, media_filename, reply_to_id, sender_jid, sender_name, created_at, edited_at, deleted_at, forwarded_from_id, location_lat, location_lng')
      .eq('lead_id', req.params.leadId)
      .eq('tenant_id', req.user.tenantId)
      .order('created_at', { ascending: !!after })
      .limit(Number(limit))
    if (before) q = q.lt('id', Number(before))
    if (after) q = q.gt('created_at', after)
    const rows = unwrap(await q)
    res.json({ messages: after ? rows : rows.reverse() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/:leadId/logs
chatRouter.get('/:leadId/logs', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('ticket_logs')
        .select('id, user_id, user_name, action, to_user_id, to_user_name, created_at')
        .eq('lead_id', req.params.leadId)
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
    )
    res.json({ logs: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/:leadId/group-access — lista operadores do tenant + quem já tem acesso ao grupo
chatRouter.get('/:leadId/group-access', async (req, res) => {
  if (!isManager(req.user.role)) return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  try {
    const leadRows = unwrap(
      await supabase.from('leads').select('id, is_group')
        .eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!leadRows.length) return res.status(404).json({ error: 'Conversa não encontrada.' })
    if (!leadRows[0].is_group) return res.status(400).json({ error: 'Esta conversa não é um grupo.' })

    const [operators, access] = await Promise.all([
      supabase.from('users').select('id, name, email').eq('tenant_id', req.user.tenantId).eq('active', true).order('name'),
      supabase.from('whatsapp_group_access').select('user_id').eq('lead_id', req.params.leadId),
    ])
    res.json({
      operators: unwrap(operators),
      granted_user_ids: unwrap(access).map((r) => r.user_id),
    })
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
    const leadRows = unwrap(
      await supabase.from('leads').select('id, is_group')
        .eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!leadRows.length) return res.status(404).json({ error: 'Conversa não encontrada.' })
    if (!leadRows[0].is_group) return res.status(400).json({ error: 'Esta conversa não é um grupo.' })

    await supabase.from('whatsapp_group_access').delete().eq('lead_id', req.params.leadId)
    if (userIds.length) {
      await supabase.from('whatsapp_group_access').insert(
        userIds.map((uid) => ({ tenant_id: req.user.tenantId, lead_id: req.params.leadId, user_id: uid }))
      )
    }
    res.json({ granted_user_ids: userIds })
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
    const leadRows = unwrap(
      await supabase.from('leads').select('id, phone, human_takeover, conversation_status')
        .eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!leadRows.length) return res.status(404).json({ error: 'Lead não encontrado.' })
    const lead = leadRows[0]

    if (lead.conversation_status !== 'open') {
      return res.status(403).json({ error: 'Ticket não está aberto. Atenda ou reabra antes de enviar mensagens.' })
    }

    let quoted = null
    if (parsed.data.replyToId) {
      const quotedRows = unwrap(
        await supabase.from('messages').select('id, role, text, wa_message_id')
          .eq('id', parsed.data.replyToId).eq('lead_id', lead.id).eq('tenant_id', req.user.tenantId).limit(1)
      )
      quoted = quotedRows?.[0] || null
      if (quoted && !quoted.wa_message_id) {
        console.warn(`[chat] mensagem citada id=${quoted.id} não tem wa_message_id — resposta vai sair sem citação nativa no WhatsApp`)
      }
    }

    const row = unwrap(
      await supabase.from('messages').insert({
        tenant_id: req.user.tenantId,
        lead_id: lead.id,
        role: 'agent',
        text: parsed.data.text,
        is_human_takeover: lead.human_takeover,
        reply_to_id: quoted?.id || null,
      }).select('*').single()
    )

    if (lead.phone) {
      try {
        const { sendText } = await import('../services/whatsapp/index.js')
        const { markSentByPlatform } = await import('../services/orchestrator.js')
        markSentByPlatform(req.user.tenantId, lead.phone, parsed.data.text)
        const sent = await sendText(req.user.tenantId, lead.phone, parsed.data.text, {
          quotedWaId: quoted?.wa_message_id || undefined,
          quotedFromMe: quoted ? quoted.role !== 'lead' : undefined,
          quotedText: quoted?.text || undefined,
        })
        if (sent?.id) {
          await supabase.from('messages').update({ wa_message_id: sent.id, provider: sent.provider, wa_remote_jid: sent.remoteJid || null }).eq('id', row.id)
          row.wa_message_id = sent.id
          row.provider = sent.provider
          row.wa_remote_jid = sent.remoteJid || null
        }
      } catch (e) {
        console.warn('[chat] falha ao enviar WhatsApp:', e.message)
      }
    }

    await logUsage(req.user.tenantId, req.user.id, 'message_sent', { by: 'agent' })
    res.status(201).json({ message: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/:leadId/schedule — lista mensagens agendadas pendentes
chatRouter.get('/:leadId/schedule', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('scheduled_messages')
        .select('id, text, send_at, status, created_at')
        .eq('lead_id', req.params.leadId)
        .eq('tenant_id', req.user.tenantId)
        .eq('status', 'pending')
        .order('send_at', { ascending: true })
    )
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
    const leadRows = unwrap(
      await supabase.from('leads').select('id')
        .eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!leadRows.length) return res.status(404).json({ error: 'Lead não encontrado.' })

    const row = unwrap(
      await supabase.from('scheduled_messages').insert({
        tenant_id: req.user.tenantId,
        lead_id: req.params.leadId,
        created_by: req.user.id,
        text: parsed.data.text,
        send_at: parsed.data.send_at,
      }).select('*').single()
    )
    res.status(201).json({ scheduled: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/chat/:leadId/schedule/:id — cancela mensagem agendada
chatRouter.delete('/:leadId/schedule/:id', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('scheduled_messages').select('status')
        .eq('id', req.params.id).eq('lead_id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Agendamento não encontrado.' })
    if (rows[0].status !== 'pending') return res.status(400).json({ error: 'Este agendamento já foi processado.' })

    await supabase.from('scheduled_messages').update({ status: 'cancelled' })
      .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
    res.json({ cancelled: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/media
chatRouter.post('/:leadId/media', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado ou tipo não permitido.' })
  try {
    const leadRows = unwrap(
      await supabase.from('leads').select('id, phone, human_takeover, conversation_status')
        .eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!leadRows.length) return res.status(404).json({ error: 'Lead não encontrado.' })
    const lead = leadRows[0]

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
    let quoted = null
    if (replyToId) {
      const quotedRows = unwrap(
        await supabase.from('messages').select('id, role, text, wa_message_id')
          .eq('id', replyToId).eq('lead_id', lead.id).eq('tenant_id', req.user.tenantId).limit(1)
      )
      quoted = quotedRows?.[0] || null
      if (quoted && !quoted.wa_message_id) {
        console.warn(`[chat/media] mensagem citada id=${quoted.id} não tem wa_message_id — resposta vai sair sem citação nativa no WhatsApp`)
      }
    }

    const row = unwrap(
      await supabase.from('messages').insert({
        tenant_id: req.user.tenantId,
        lead_id: lead.id,
        role: 'agent',
        text: label,
        is_human_takeover: lead.human_takeover,
        media_url: mediaUrl,
        media_type: mediaType,
        media_mimetype: req.file.mimetype,
        media_filename: filename,
        media_duration_seconds: mediaDurationSeconds,
        reply_to_id: quoted?.id || null,
      }).select('*').single()
    )

    if (lead.phone) {
      try {
        const { sendMedia } = await import('../services/whatsapp/index.js')
        const { markSentByPlatform } = await import('../services/orchestrator.js')
        // Evolution ecoa a própria mensagem enviada via webhook (fromMe) com esse mesmo texto —
        // marca como "já processada" para não duplicar a mensagem no histórico.
        markSentByPlatform(req.user.tenantId, lead.phone, caption || `[${mediaType}]`)
        const sent = await sendMedia(req.user.tenantId, lead.phone, {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          filename,
          caption,
          quotedWaId: quoted?.wa_message_id || undefined,
          quotedFromMe: quoted ? quoted.role !== 'lead' : undefined,
          quotedText: quoted?.text || undefined,
        })
        if (sent?.id) {
          await supabase.from('messages').update({ wa_message_id: sent.id, provider: sent.provider, wa_remote_jid: sent.remoteJid || null }).eq('id', row.id)
          row.wa_message_id = sent.id
          row.provider = sent.provider
          row.wa_remote_jid = sent.remoteJid || null
        }
      } catch (e) {
        console.warn('[chat/media] WhatsApp:', e.message)
      }
    }

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
    const rows = unwrap(
      await supabase.from('messages').select('id, role, provider, wa_message_id, wa_remote_jid, deleted_at')
        .eq('id', req.params.messageId).eq('lead_id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    const msg = rows?.[0]
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' })
    if (msg.deleted_at) return res.status(400).json({ error: 'Mensagem já foi apagada.' })
    if (msg.role !== 'agent') return res.status(403).json({ error: 'Só é possível editar mensagens enviadas pela plataforma.' })
    if (msg.provider !== 'evolution') return res.status(400).json({ error: 'Editar mensagem só está disponível em canais Evolution.' })
    if (!msg.wa_message_id) {
      return res.status(400).json({ error: 'Mensagem antiga (enviada antes desta atualização) — não é possível editar.' })
    }

    // prefere o remoteJid do LEAD (capturado de mensagens recebidas, mais confiável em
    // conversas no modo LID) e só cai pro remoteJid gravado na própria mensagem se o lead
    // ainda não tiver um (ex: lead que só recebeu mensagens nossas, nunca respondeu).
    const leadRows = unwrap(await supabase.from('leads').select('wa_remote_jid').eq('id', req.params.leadId).limit(1))
    const remoteJid = leadRows?.[0]?.wa_remote_jid || msg.wa_remote_jid
    if (!remoteJid) {
      return res.status(400).json({ error: 'Não sabemos o identificador dessa conversa no WhatsApp ainda — não é possível editar.' })
    }

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

    const updated = unwrap(
      await supabase.from('messages')
        .update({ text: parsed.data.text, edited_at: new Date().toISOString() })
        .eq('id', msg.id).select('*').single()
    )
    res.json({ message: updated })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/chat/:leadId/messages/:messageId — apaga uma mensagem "para todos"
// (diferente de DELETE /:leadId, que apaga a conversa inteira). Só Evolution, só mensagens próprias.
chatRouter.delete('/:leadId/messages/:messageId', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('messages').select('id, role, provider, wa_message_id, wa_remote_jid, deleted_at')
        .eq('id', req.params.messageId).eq('lead_id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    const msg = rows?.[0]
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' })
    if (msg.deleted_at) return res.json({ deleted: true }) // idempotente
    if (msg.role !== 'agent') return res.status(403).json({ error: 'Só é possível apagar mensagens enviadas pela plataforma.' })
    if (msg.provider !== 'evolution') return res.status(400).json({ error: 'Apagar mensagem só está disponível em canais Evolution.' })

    const leadRowsDel = unwrap(await supabase.from('leads').select('wa_remote_jid').eq('id', req.params.leadId).limit(1))
    const remoteJidDel = leadRowsDel?.[0]?.wa_remote_jid || msg.wa_remote_jid

    if (msg.wa_message_id && remoteJidDel) {
      const { deleteMessage } = await import('../services/whatsapp/index.js')
      try {
        await deleteMessage(req.user.tenantId, { waMessageId: msg.wa_message_id, remoteJid: remoteJidDel })
      } catch (e) {
        // Mesma limitação conhecida da Evolution API em conversas no modo LID — ver PATCH acima.
        if (/remotejid/i.test(e.message)) {
          return res.status(400).json({ error: 'Não foi possível apagar esta mensagem no WhatsApp — limitação do WhatsApp/Evolution nesta conversa.' })
        }
        throw e
      }
    }

    unwrap(
      await supabase.from('messages')
        .update({ text: '', media_url: null, deleted_at: new Date().toISOString() })
        .eq('id', msg.id)
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
    const msgRows = unwrap(
      await supabase.from('messages').select('*')
        .eq('id', req.params.messageId).eq('lead_id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    const original = msgRows?.[0]
    if (!original || original.deleted_at) return res.status(404).json({ error: 'Mensagem não encontrada.' })

    const destRows = unwrap(
      await supabase.from('leads').select('id, phone, human_takeover, conversation_status')
        .eq('id', parsed.data.toLeadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    const dest = destRows?.[0]
    if (!dest) return res.status(404).json({ error: 'Lead de destino não encontrado.' })
    if (dest.conversation_status !== 'open') return res.status(403).json({ error: 'Ticket de destino não está aberto.' })

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

    if (original.location_lat != null) {
      insertPayload.location_lat = original.location_lat
      insertPayload.location_lng = original.location_lng
      if (dest.phone) {
        sent = await sendLocation(req.user.tenantId, dest.phone, { latitude: original.location_lat, longitude: original.location_lng })
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
        }
      }
    } else if (dest.phone) {
      sent = await sendText(req.user.tenantId, dest.phone, original.text || '')
    }

    if (sent?.id) {
      insertPayload.wa_message_id = sent.id
      insertPayload.provider = sent.provider
    }

    const row = unwrap(await supabase.from('messages').insert(insertPayload).select('*').single())
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
    const leadRows = unwrap(
      await supabase.from('leads').select('id, phone, human_takeover, conversation_status')
        .eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    const lead = leadRows?.[0]
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })
    if (lead.conversation_status !== 'open') return res.status(403).json({ error: 'Ticket não está aberto.' })

    const row = unwrap(
      await supabase.from('messages').insert({
        tenant_id: req.user.tenantId,
        lead_id: lead.id,
        role: 'agent',
        text: 'Localização compartilhada',
        is_human_takeover: lead.human_takeover,
        location_lat: parsed.data.latitude,
        location_lng: parsed.data.longitude,
      }).select('*').single()
    )

    if (lead.phone) {
      try {
        const { sendLocation } = await import('../services/whatsapp/index.js')
        const sent = await sendLocation(req.user.tenantId, lead.phone, { latitude: parsed.data.latitude, longitude: parsed.data.longitude })
        if (sent?.id) {
          await supabase.from('messages').update({ wa_message_id: sent.id, provider: sent.provider, wa_remote_jid: sent.remoteJid || null }).eq('id', row.id)
          row.wa_message_id = sent.id
          row.provider = sent.provider
          row.wa_remote_jid = sent.remoteJid || null
        }
      } catch (e) {
        console.warn('[chat] falha ao enviar localização:', e.message)
      }
    }

    res.status(201).json({ message: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/transfer
chatRouter.post('/:leadId/transfer', async (req, res) => {
  const { human_takeover } = req.body
  try {
    const row = unwrap(
      await supabase.from('leads').update({
        human_takeover: !!human_takeover,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).select('id, human_takeover').single()
    )
    await supabase.from('messages').insert({
      tenant_id: req.user.tenantId,
      lead_id: req.params.leadId,
      role: 'agent',
      text: human_takeover ? '— Atendimento transferido para humano —' : '— IA retomou o atendimento —',
      is_human_takeover: !!human_takeover,
    })
    if (human_takeover) {
      await logUsage(req.user.tenantId, req.user.id, 'human_takeover', { lead_id: req.params.leadId })
      // encerra sessão ativa do chatbot ao assumir atendimento
      await supabase.from('flow_sessions')
        .update({ status: 'transferred' })
        .eq('lead_id', req.params.leadId).eq('tenant_id', req.user.tenantId).eq('status', 'active')
    }
    res.json({ lead: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/transfer-to
chatRouter.post('/:leadId/transfer-to', async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId obrigatório.' })
  try {
    const opRows = unwrap(
      await supabase.from('users').select('id, name, email')
        .eq('id', userId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!opRows.length) return res.status(404).json({ error: 'Operador não encontrado.' })
    const toUser = opRows[0]

    const row = unwrap(
      await supabase.from('leads').update({
        assigned_to: userId,
        conversation_status: 'open',
        human_takeover: true,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId)
        .select('id, conversation_status, assigned_to').single()
    )

    await supabase.from('messages').insert({
      tenant_id: req.user.tenantId,
      lead_id: req.params.leadId,
      role: 'system',
      text: `— Atendimento transferido para ${toUser.name || toUser.email} —`,
    })

    await logTicketEvent(
      req.user.tenantId, req.params.leadId,
      req.user.id, req.user.name,
      'transferred',
      toUser.id, toUser.name || toUser.email
    )

    res.json({ lead: row, to: toUser })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/attend
chatRouter.post('/:leadId/attend', async (req, res) => {
  try {
    const row = unwrap(
      await supabase.from('leads').update({
        conversation_status: 'open',
        human_takeover: true,
        assigned_to: req.user.id,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).select('id, conversation_status, assigned_to').single()
    )
    await supabase.from('messages').insert({
      tenant_id: req.user.tenantId,
      lead_id: req.params.leadId,
      role: 'system',
      text: `— Atendimento iniciado por ${req.user.name} —`,
      is_human_takeover: true,
    })
    await logTicketEvent(req.user.tenantId, req.params.leadId, req.user.id, req.user.name, 'opened')
    res.json({ lead: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/reopen
chatRouter.post('/:leadId/reopen', async (req, res) => {
  try {
    const row = unwrap(
      await supabase.from('leads').update({
        conversation_status: 'open',
        human_takeover: true,
        assigned_to: req.user.id,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).select('id, conversation_status').single()
    )
    await supabase.from('messages').insert({
      tenant_id: req.user.tenantId,
      lead_id: req.params.leadId,
      role: 'system',
      text: `— Ticket reaberto por ${req.user.name} —`,
    })
    await logTicketEvent(req.user.tenantId, req.params.leadId, req.user.id, req.user.name, 'reopened')
    res.json({ lead: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/return-to-queue
chatRouter.post('/:leadId/return-to-queue', async (req, res) => {
  try {
    const row = unwrap(
      await supabase.from('leads').update({
        conversation_status: 'pending',
        human_takeover: false,
        assigned_to: null,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).select('id, conversation_status').single()
    )
    await supabase.from('messages').insert({
      tenant_id: req.user.tenantId,
      lead_id: req.params.leadId,
      role: 'system',
      text: `— Ticket retornado à fila por ${req.user.name} —`,
      is_human_takeover: false,
    })
    await logTicketEvent(req.user.tenantId, req.params.leadId, req.user.id, req.user.name, 'pending')
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
    const leadRows = unwrap(
      await supabase.from('leads').select('id')
        .eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!leadRows.length) return res.status(404).json({ error: 'Conversa não encontrada.' })

    await supabase.from('messages').delete().eq('lead_id', req.params.leadId).eq('tenant_id', req.user.tenantId)
    await supabase.from('ticket_logs').delete().eq('lead_id', req.params.leadId).eq('tenant_id', req.user.tenantId)
    await supabase.from('leads').delete().eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId)

    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/resolve
chatRouter.post('/:leadId/resolve', async (req, res) => {
  try {
    const row = unwrap(
      await supabase.from('leads').update({
        conversation_status: 'resolved',
        human_takeover: false,
        assigned_to: null,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).select('id, conversation_status').single()
    )
    await supabase.from('messages').insert({
      tenant_id: req.user.tenantId,
      lead_id: req.params.leadId,
      role: 'system',
      text: `— Atendimento finalizado por ${req.user.name} —`,
      is_human_takeover: false,
    })
    await logTicketEvent(req.user.tenantId, req.params.leadId, req.user.id, req.user.name, 'closed')
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

async function materializeFollowupMessages(tenantId, leadId, enrollmentId, sequence, startedAt) {
  const steps = unwrap(
    await supabase.from('followup_steps').select('*')
      .eq('sequence_id', sequence.id).eq('tenant_id', tenantId)
      .order('order_index', { ascending: true })
  )
  if (!steps.length) return []

  const startedDate = new Date(startedAt)
  const timezone = await getTenantTimezone(tenantId)
  const baseYmd = ymdInTimezone(startedDate, timezone)

  return unwrap(
    await supabase.from('followup_enrollment_messages').insert(
      steps.map((s) => {
        // "Enviar imediatamente" (dia 0) mantém o horário exato do início do acompanhamento
        let sendAt = startedDate
        if (s.delay_days > 0) {
          const dayYmd = addDaysToYmd(baseYmd, s.delay_days)
          const timeStr = (sequence.time_mode === 'individual' ? s.send_time : null) || sequence.default_send_time || '09:00'
          const [hh, mm] = timeStr.split(':').map(Number)
          sendAt = zonedTimeToUtc(dayYmd, hh, mm, timezone)
        }
        return {
          tenant_id: tenantId,
          enrollment_id: enrollmentId,
          lead_id: leadId,
          step_id: s.id,
          order_index: s.order_index,
          text: s.text,
          media_url: s.media_url,
          media_type: s.media_type,
          media_mimetype: s.media_mimetype,
          media_filename: s.media_filename,
          send_at: sendAt.toISOString(),
        }
      })
    ).select('*')
  )
}

async function loadActiveFollowup(tenantId, leadId) {
  const rows = unwrap(
    await supabase.from('followup_enrollments').select('*')
      .eq('lead_id', leadId).eq('tenant_id', tenantId).eq('status', 'active').limit(1)
  )
  const enrollment = rows[0]
  if (!enrollment) return null

  const [seqRows, messages] = await Promise.all([
    supabase.from('followup_sequences').select('name').eq('id', enrollment.sequence_id).eq('tenant_id', tenantId).limit(1),
    supabase.from('followup_enrollment_messages').select('order_index, status, send_at')
      .eq('enrollment_id', enrollment.id).eq('tenant_id', tenantId)
      .order('order_index', { ascending: true }),
  ])
  const sequenceName = unwrap(seqRows)[0]?.name || '—'
  const msgs = unwrap(messages)
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
    const active = await loadActiveFollowup(req.user.tenantId, req.params.leadId)
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
    const existing = await loadActiveFollowup(req.user.tenantId, req.params.leadId)
    if (existing) return res.status(409).json({ error: 'Este contato já tem um acompanhamento ativo.', followup: existing })

    const leadRows = unwrap(
      await supabase.from('leads').select('id')
        .eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!leadRows.length) return res.status(404).json({ error: 'Lead não encontrado.' })

    const seqRows = unwrap(
      await supabase.from('followup_sequences').select('id, name, time_mode, default_send_time')
        .eq('id', sequence_id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!seqRows.length) return res.status(404).json({ error: 'Acompanhamento não encontrado.' })

    const startedAt = new Date().toISOString()
    const enrollment = unwrap(
      await supabase.from('followup_enrollments').insert({
        tenant_id: req.user.tenantId,
        sequence_id,
        lead_id: req.params.leadId,
        created_by: req.user.id,
        started_at: startedAt,
      }).select('*').single()
    )
    await materializeFollowupMessages(req.user.tenantId, req.params.leadId, enrollment.id, seqRows[0], startedAt)

    res.status(201).json({ followup: await loadActiveFollowup(req.user.tenantId, req.params.leadId) })
  } catch (e) {
    if (e.message?.includes('23505')) return res.status(409).json({ error: 'Este contato já tem um acompanhamento ativo.' })
    res.status(500).json({ error: e.message })
  }
})

async function stopEnrollment(tenantId, leadId, enrollmentId, finalStatus) {
  const rows = unwrap(
    await supabase.from('followup_enrollments').select('id')
      .eq('id', enrollmentId).eq('lead_id', leadId).eq('tenant_id', tenantId).eq('status', 'active').limit(1)
  )
  if (!rows.length) return false

  await supabase.from('followup_enrollments').update({
    status: finalStatus,
    finished_at: new Date().toISOString(),
  }).eq('id', enrollmentId).eq('tenant_id', tenantId)

  await supabase.from('followup_enrollment_messages').update({ status: 'cancelled' })
    .eq('enrollment_id', enrollmentId).eq('tenant_id', tenantId).eq('status', 'pending')

  return true
}

// POST /api/chat/:leadId/followup/:enrollmentId/cancel
chatRouter.post('/:leadId/followup/:enrollmentId/cancel', async (req, res) => {
  try {
    const stopped = await stopEnrollment(req.user.tenantId, req.params.leadId, req.params.enrollmentId, 'cancelled')
    if (!stopped) return res.status(404).json({ error: 'Acompanhamento ativo não encontrado.' })
    res.json({ cancelled: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/followup/:enrollmentId/finish
chatRouter.post('/:leadId/followup/:enrollmentId/finish', async (req, res) => {
  try {
    const stopped = await stopEnrollment(req.user.tenantId, req.params.leadId, req.params.enrollmentId, 'completed')
    if (!stopped) return res.status(404).json({ error: 'Acompanhamento ativo não encontrado.' })
    res.json({ finished: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/followup/:enrollmentId/restart
chatRouter.post('/:leadId/followup/:enrollmentId/restart', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('followup_enrollments').select('sequence_id')
        .eq('id', req.params.enrollmentId).eq('lead_id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Acompanhamento não encontrado.' })
    const sequenceId = rows[0].sequence_id

    const seqRows = unwrap(
      await supabase.from('followup_sequences').select('id, name, time_mode, default_send_time')
        .eq('id', sequenceId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!seqRows.length) return res.status(404).json({ error: 'Acompanhamento não encontrado.' })

    await stopEnrollment(req.user.tenantId, req.params.leadId, req.params.enrollmentId, 'cancelled')

    const startedAt = new Date().toISOString()
    const enrollment = unwrap(
      await supabase.from('followup_enrollments').insert({
        tenant_id: req.user.tenantId,
        sequence_id: sequenceId,
        lead_id: req.params.leadId,
        created_by: req.user.id,
        started_at: startedAt,
      }).select('*').single()
    )
    await materializeFollowupMessages(req.user.tenantId, req.params.leadId, enrollment.id, seqRows[0], startedAt)

    res.status(201).json({ followup: await loadActiveFollowup(req.user.tenantId, req.params.leadId) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
