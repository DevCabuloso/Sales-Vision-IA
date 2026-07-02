import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const broadcastRouter = Router()
broadcastRouter.use(requireAuth, requireTenant)

const campaignSchema = z.object({
  name:         z.string().min(1).max(200),
  content:      z.string().min(1).max(4000),
  template_id:  z.string().uuid().optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
})

// ─── CAMPAIGNS ───

// GET /api/broadcast/campaigns
broadcastRouter.get('/campaigns', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('broadcast_campaigns').select('*')
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: false })
    )
    res.json({ campaigns: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/broadcast/campaigns
broadcastRouter.post('/campaigns', async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const row = unwrap(
      await supabase.from('broadcast_campaigns').insert({
        tenant_id: req.user.tenantId,
        ...parsed.data,
      }).select('*').single()
    )
    res.status(201).json({ campaign: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/broadcast/campaigns/:id
broadcastRouter.patch('/campaigns/:id', async (req, res) => {
  const partial = campaignSchema.partial().safeParse(req.body)
  if (!partial.success) return res.status(400).json({ error: partial.error.issues[0].message })

  try {
    const row = unwrap(
      await supabase.from('broadcast_campaigns').update({
        ...partial.data,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.id).eq('tenant_id', req.user.tenantId).select('*').single()
    )
    res.json({ campaign: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/broadcast/campaigns/:id
broadcastRouter.delete('/campaigns/:id', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('broadcast_campaigns').select('status')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (rows[0]?.status === 'sending') {
      return res.status(400).json({ error: 'Não é possível excluir uma campanha em andamento.' })
    }
    await supabase.from('broadcast_campaigns').delete()
      .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── CONTACTS ───

// GET /api/broadcast/campaigns/:id/contacts
broadcastRouter.get('/campaigns/:id/contacts', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('broadcast_contacts').select('*')
        .eq('campaign_id', req.params.id)
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: true })
        .limit(2000)
    )
    res.json({ contacts: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const contactSchema = z.object({
  contacts: z.array(z.object({
    name:  z.string().optional(),
    phone: z.string().min(8).max(20),
  })).min(1).max(5000),
})

// POST /api/broadcast/campaigns/:id/contacts
broadcastRouter.post('/campaigns/:id/contacts', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const rows = parsed.data.contacts.map((c) => ({
      campaign_id: req.params.id,
      tenant_id:   req.user.tenantId,
      name:        c.name || null,
      phone:       c.phone.replace(/\D/g, ''),
    }))

    await supabase.from('broadcast_contacts').insert(rows)
    res.status(201).json({ imported: rows.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/broadcast/campaigns/:id/send — inicia envio
broadcastRouter.post('/campaigns/:id/send', async (req, res) => {
  try {
    const campRows = unwrap(
      await supabase.from('broadcast_campaigns').select('*')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!campRows.length) return res.status(404).json({ error: 'Campanha não encontrada.' })
    const camp = campRows[0]

    if (['sending', 'completed'].includes(camp.status)) {
      return res.status(400).json({ error: `Campanha já está ${camp.status}.` })
    }

    // marca como sending
    await supabase.from('broadcast_campaigns').update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', camp.id)

    // retorna imediatamente; envio roda em background
    res.json({ started: true })

    // envio assíncrono
    processBroadcast(req.user.tenantId, camp).catch((e) =>
      console.error('[broadcast] erro:', e.message)
    )
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

async function processBroadcast(tenantId, campaign) {
  const { sendText } = await import('../services/whatsapp/index.js')

  const contacts = unwrap(
    await supabase.from('broadcast_contacts').select('id, phone, name')
      .eq('campaign_id', campaign.id).eq('status', 'pending')
      .order('id').limit(5000)
  )

  let sent = 0
  let idx = 0
  for (const c of contacts) {
    // a cada 10 envios verifica se a campanha foi cancelada
    if (idx++ % 10 === 0) {
      const { data: campCheck } = await supabase.from('broadcast_campaigns').select('status').eq('id', campaign.id).single()
      if (campCheck?.status !== 'sending') break
    }
    try {
      await sendText(tenantId, c.phone, campaign.content)
      await supabase.from('broadcast_contacts').update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', c.id)
      sent++
      // throttle: 1 por segundo para evitar bloqueio
      await new Promise((r) => setTimeout(r, 1000))
    } catch (e) {
      await supabase.from('broadcast_contacts').update({ status: 'failed', error: e.message })
        .eq('id', c.id)
    }
  }

  // só marca completed se ainda estava sending (não foi cancelada)
  const { data: finalStatus } = await supabase.from('broadcast_campaigns').select('status').eq('id', campaign.id).single()
  if (finalStatus?.status === 'sending') {
    await supabase.from('broadcast_campaigns').update({
      status: 'completed',
      sent_count: sent,
      updated_at: new Date().toISOString(),
    }).eq('id', campaign.id)
  }
}

// POST /api/broadcast/campaigns/:id/cancel
broadcastRouter.post('/campaigns/:id/cancel', async (req, res) => {
  try {
    await supabase.from('broadcast_campaigns').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
    res.json({ cancelled: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
