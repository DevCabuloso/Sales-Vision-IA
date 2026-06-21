import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { logUsage } from '../services/usage.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024 } })

export const chatRouter = Router()
chatRouter.use(requireAuth, requireTenant)

const isManager = (role) => role === 'owner' || role === 'admin'

// GET /api/chat — lista conversas
chatRouter.get('/', async (req, res) => {
  try {
    const { stage, assigned_to } = req.query

    let q = supabase.from('leads')
      .select('id, name, phone, stage, human_takeover, conversation_status, assigned_to, updated_at')
      .eq('tenant_id', req.user.tenantId)
      .order('updated_at', { ascending: false })
      .limit(300)

    if (stage) q = q.eq('stage', stage)
    if (assigned_to) q = q.eq('assigned_to', assigned_to)

    const leads = unwrap(await q)
    if (!leads.length) return res.json({ leads: [] })

    const leadIds = leads.map((l) => l.id)
    const msgs = unwrap(
      await supabase.from('messages').select('lead_id, text, role, created_at')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
    )

    const lastByLead = {}
    for (const m of msgs) {
      if (!lastByLead[m.lead_id]) lastByLead[m.lead_id] = m
    }

    // operadores só veem seus próprios atendimentos abertos + todos os pendentes/fechados
    let result = leads.map((l) => ({ ...l, lastMessage: lastByLead[l.id] || null }))
    if (!isManager(req.user.role)) {
      result = result.filter((l) =>
        l.conversation_status !== 'open' || l.assigned_to === req.user.id
      )
    }

    res.json({ leads: result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/chat/operators — lista operadores para o filtro
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

    // garante status correto se lead já existia
    await supabase.from('leads').update({
      conversation_status: 'open',
      human_takeover: true,
      assigned_to: req.user.id,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id)

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
  const { limit = 50, before } = req.query
  try {
    let q = supabase.from('messages').select('id, role, text, provider, is_human_takeover, created_at')
      .eq('lead_id', req.params.leadId)
      .eq('tenant_id', req.user.tenantId)
      .order('created_at', { ascending: false })
      .limit(Number(limit))
    if (before) q = q.lt('id', Number(before))
    const rows = unwrap(await q)
    res.json({ messages: rows.reverse() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat/:leadId/messages
const msgSchema = z.object({ text: z.string().min(1).max(4000) })

chatRouter.post('/:leadId/messages', async (req, res) => {
  const parsed = msgSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const leadRows = unwrap(
      await supabase.from('leads').select('id, phone, human_takeover')
        .eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!leadRows.length) return res.status(404).json({ error: 'Lead não encontrado.' })
    const lead = leadRows[0]

    const row = unwrap(
      await supabase.from('messages').insert({
        tenant_id: req.user.tenantId,
        lead_id: lead.id,
        role: 'agent',
        text: parsed.data.text,
        is_human_takeover: lead.human_takeover,
      }).select('*').single()
    )

    if (lead.phone) {
      try {
        const { sendText } = await import('../services/whatsapp/index.js')
        await sendText(req.user.tenantId, lead.phone, parsed.data.text)
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

// POST /api/chat/:leadId/media — envia arquivo/áudio
chatRouter.post('/:leadId/media', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
  try {
    const leadRows = unwrap(
      await supabase.from('leads').select('id, phone, human_takeover')
        .eq('id', req.params.leadId).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!leadRows.length) return res.status(404).json({ error: 'Lead não encontrado.' })
    const lead = leadRows[0]

    const caption = req.body.caption || ''
    const filename = req.file.originalname || 'arquivo'
    const label = `[Arquivo: ${filename}]${caption ? ' ' + caption : ''}`

    const row = unwrap(
      await supabase.from('messages').insert({
        tenant_id: req.user.tenantId,
        lead_id: lead.id,
        role: 'agent',
        text: label,
        is_human_takeover: lead.human_takeover,
      }).select('*').single()
    )

    if (lead.phone) {
      try {
        const { sendMedia } = await import('../services/whatsapp/index.js')
        await sendMedia(req.user.tenantId, lead.phone, {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          filename,
          caption,
        })
      } catch (e) {
        console.warn('[chat/media] WhatsApp:', e.message)
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
    if (human_takeover) await logUsage(req.user.tenantId, req.user.id, 'human_takeover', { lead_id: req.params.leadId })
    res.json({ lead: row })
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
      role: 'agent',
      text: '— Atendimento iniciado —',
      is_human_takeover: true,
    })
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
      role: 'agent',
      text: '— Ticket retornado à fila de pendentes —',
      is_human_takeover: false,
    })
    res.json({ lead: row })
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
      role: 'agent',
      text: '— Atendimento finalizado —',
      is_human_takeover: false,
    })
    res.json({ lead: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
