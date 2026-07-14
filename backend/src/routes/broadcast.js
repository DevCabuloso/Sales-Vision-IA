import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant, requirePermission } from '../middleware/auth.js'
import { normalizePhone } from '../utils/phone.js'

export const broadcastRouter = Router()
broadcastRouter.use(requireAuth, requireTenant, requirePermission('broadcast'))

const campaignBaseSchema = z.object({
  name:         z.string().min(1).max(200),
  content:      z.string().min(1).max(4000),
  template_id:  z.string().uuid().optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
  min_interval_seconds: z.number().int().min(1).max(600).optional(),
  max_interval_seconds: z.number().int().min(1).max(600).optional(),
})
const intervalRefine = (d) =>
  d.min_interval_seconds == null || d.max_interval_seconds == null || d.max_interval_seconds >= d.min_interval_seconds
const intervalRefineOpts = { message: 'O intervalo máximo deve ser maior ou igual ao mínimo.', path: ['max_interval_seconds'] }

const campaignSchema = campaignBaseSchema.refine(intervalRefine, intervalRefineOpts)

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

// se scheduled_at está no futuro, a campanha entra automaticamente no
// status 'scheduled' para o scheduler em background pegá-la na hora certa
function statusForSchedule(scheduledAt) {
  if (!scheduledAt) return 'draft'
  return new Date(scheduledAt).getTime() > Date.now() ? 'scheduled' : 'draft'
}

// POST /api/broadcast/campaigns
broadcastRouter.post('/campaigns', async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const row = unwrap(
      await supabase.from('broadcast_campaigns').insert({
        tenant_id: req.user.tenantId,
        ...parsed.data,
        status: statusForSchedule(parsed.data.scheduled_at),
      }).select('*').single()
    )
    res.status(201).json({ campaign: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const campaignPatchSchema = campaignBaseSchema.partial().refine(intervalRefine, intervalRefineOpts)

// PATCH /api/broadcast/campaigns/:id
broadcastRouter.patch('/campaigns/:id', async (req, res) => {
  const partial = campaignPatchSchema.safeParse(req.body)
  if (!partial.success) return res.status(400).json({ error: partial.error.issues[0].message })

  try {
    const current = unwrap(
      await supabase.from('broadcast_campaigns').select('status, scheduled_at')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!current.length) return res.status(404).json({ error: 'Campanha não encontrada.' })

    const patch = { ...partial.data, updated_at: new Date().toISOString() }
    // só reavalia o status automaticamente se a campanha ainda não começou a enviar
    if ('scheduled_at' in partial.data && ['draft', 'scheduled'].includes(current[0].status)) {
      patch.status = statusForSchedule(partial.data.scheduled_at)
    }

    const row = unwrap(
      await supabase.from('broadcast_campaigns').update(patch)
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).select('*').single()
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
    // broadcast_contacts referencia campaign_id via FK sem ON DELETE CASCADE —
    // sem apagar os contatos antes, o DELETE da campanha falharia (violação de FK)
    // sempre que já houvesse algum contato importado/enviado.
    await supabase.from('broadcast_contacts').delete()
      .eq('campaign_id', req.params.id).eq('tenant_id', req.user.tenantId)
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
    const limit = Math.min(parseInt(req.query.limit, 10) || 2000, 5000)
    const offset = parseInt(req.query.offset, 10) || 0

    const rows = unwrap(
      await supabase.from('broadcast_contacts').select('*')
        .eq('campaign_id', req.params.id)
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1)
    )
    res.json({ contacts: rows, limit, offset })
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
      phone:       normalizePhone(c.phone),
    }))

    await supabase.from('broadcast_contacts').insert(rows)
    res.status(201).json({ imported: rows.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

async function assertCampaignEditable(tenantId, campaignId) {
  const rows = unwrap(
    await supabase.from('broadcast_campaigns').select('status')
      .eq('id', campaignId).eq('tenant_id', tenantId).limit(1)
  )
  if (!rows.length) return 'Campanha não encontrada.'
  if (!['draft', 'scheduled'].includes(rows[0].status)) {
    return 'Só é possível remover contatos de campanhas ainda não enviadas.'
  }
  return null
}

// DELETE /api/broadcast/campaigns/:id/contacts/:contactId — remove um contato da lista
broadcastRouter.delete('/campaigns/:id/contacts/:contactId', async (req, res) => {
  try {
    const err = await assertCampaignEditable(req.user.tenantId, req.params.id)
    if (err) return res.status(err === 'Campanha não encontrada.' ? 404 : 400).json({ error: err })

    await supabase.from('broadcast_contacts').delete()
      .eq('id', req.params.contactId).eq('campaign_id', req.params.id).eq('tenant_id', req.user.tenantId)
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/broadcast/campaigns/:id/contacts — limpa toda a lista de contatos
broadcastRouter.delete('/campaigns/:id/contacts', async (req, res) => {
  try {
    const err = await assertCampaignEditable(req.user.tenantId, req.params.id)
    if (err) return res.status(err === 'Campanha não encontrada.' ? 404 : 400).json({ error: err })

    await supabase.from('broadcast_contacts').delete()
      .eq('campaign_id', req.params.id).eq('tenant_id', req.user.tenantId)
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const importLeadsSchema = z.object({
  stages:   z.array(z.string()).optional(),
  queueIds: z.array(z.string().uuid()).optional(),
  tags:     z.array(z.string()).optional(),
  leadIds:  z.array(z.string().uuid()).optional(),
})

// POST /api/broadcast/campaigns/:id/import-leads — importa da base de contatos/leads,
// opcionalmente filtrando por fila, etiqueta e etapa. Sem filtros, importa todos os leads do tenant.
broadcastRouter.post('/campaigns/:id/import-leads', async (req, res) => {
  const parsed = importLeadsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const campRows = unwrap(
      await supabase.from('broadcast_campaigns').select('id')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!campRows.length) return res.status(404).json({ error: 'Campanha não encontrada.' })

    const { stages, queueIds, tags, leadIds } = parsed.data
    let q = supabase.from('leads').select('name, phone')
      .eq('tenant_id', req.user.tenantId)
      .not('phone', 'is', null)
    if (leadIds?.length) {
      // seleção manual de contatos específicos — ignora os demais filtros
      q = q.in('id', leadIds)
    } else {
      if (stages?.length) q = q.in('stage', stages)
      if (queueIds?.length) q = q.in('queue_id', queueIds)
      if (tags?.length) q = q.overlaps('tags', tags)
    }

    const leads = unwrap(await q.limit(5000))
    if (!leads.length) return res.json({ matched: 0, imported: 0, skipped: 0 })

    // não duplica contatos já importados nesta campanha
    const existing = unwrap(
      await supabase.from('broadcast_contacts').select('phone').eq('campaign_id', req.params.id).limit(20000)
    )
    const existingPhones = new Set(existing.map((c) => c.phone))

    const rows = leads
      .filter((l) => l.phone && !existingPhones.has(l.phone))
      .map((l) => ({ campaign_id: req.params.id, tenant_id: req.user.tenantId, name: l.name || null, phone: l.phone }))

    if (rows.length) await supabase.from('broadcast_contacts').insert(rows)

    res.status(201).json({ matched: leads.length, imported: rows.length, skipped: leads.length - rows.length })
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

export async function processBroadcast(tenantId, campaign) {
  const { sendText } = await import('../services/whatsapp/index.js')

  const contacts = unwrap(
    await supabase.from('broadcast_contacts').select('id, phone, name')
      .eq('campaign_id', campaign.id).eq('status', 'pending')
      .order('id').limit(5000)
  )

  // intervalo aleatório entre envios (evita padrão uniforme de robô); default 2-5s
  const minSec = campaign.min_interval_seconds || 2
  const maxSec = Math.max(campaign.max_interval_seconds || 5, minSec)
  const nextDelayMs = () => (minSec + Math.random() * (maxSec - minSec)) * 1000

  let sent = 0
  let idx = 0
  for (const c of contacts) {
    // a cada 10 envios verifica se a campanha foi cancelada
    if (idx++ % 10 === 0) {
      const { data: campCheck } = await supabase.from('broadcast_campaigns').select('status').eq('id', campaign.id).single()
      if (campCheck?.status !== 'sending') break
    }
    try {
      const result = await sendText(tenantId, c.phone, campaign.content)
      await supabase.from('broadcast_contacts').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        wa_message_id: result?.id || null,
      }).eq('id', c.id)
      sent++
      // throttle: intervalo aleatório configurado na campanha, para simular envio humano
      await new Promise((r) => setTimeout(r, nextDelayMs()))
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
