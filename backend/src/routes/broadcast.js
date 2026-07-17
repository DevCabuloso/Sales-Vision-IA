import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant, requirePermission } from '../middleware/auth.js'
import { normalizePhone } from '../utils/phone.js'

export const broadcastRouter = Router()
broadcastRouter.use(requireAuth, requireTenant, requirePermission('broadcast', 'view'))

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
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT * FROM broadcast_campaigns WHERE tenant_id = $1 ORDER BY created_at DESC',
        [req.user.tenantId]
      )
      return r.rows
    })
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
broadcastRouter.post('/campaigns', requirePermission('broadcast', 'create'), async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const columns = ['tenant_id', ...Object.keys(parsed.data), 'status']
      const values = [req.user.tenantId, ...Object.values(parsed.data), statusForSchedule(parsed.data.scheduled_at)]
      const placeholders = columns.map((_, i) => `$${i + 1}`)
      const r = await client.query(
        `INSERT INTO broadcast_campaigns (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        values
      )
      return r.rows[0]
    })
    res.status(201).json({ campaign: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const campaignPatchSchema = campaignBaseSchema.partial().refine(intervalRefine, intervalRefineOpts)

// PATCH /api/broadcast/campaigns/:id
broadcastRouter.patch('/campaigns/:id', requirePermission('broadcast', 'edit'), async (req, res) => {
  const partial = campaignPatchSchema.safeParse(req.body)
  if (!partial.success) return res.status(400).json({ error: partial.error.issues[0].message })

  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const currentR = await client.query(
        'SELECT status, scheduled_at FROM broadcast_campaigns WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      if (!currentR.rows.length) return null

      const patch = { ...partial.data, updated_at: new Date().toISOString() }
      // só reavalia o status automaticamente se a campanha ainda não começou a enviar
      if ('scheduled_at' in partial.data && ['draft', 'scheduled'].includes(currentR.rows[0].status)) {
        patch.status = statusForSchedule(partial.data.scheduled_at)
      }

      const columns = Object.keys(patch)
      const setClauses = columns.map((c, i) => `${c} = $${i + 1}`)
      const values = columns.map((c) => patch[c])
      values.push(req.params.id, req.user.tenantId)
      const r = await client.query(
        `UPDATE broadcast_campaigns SET ${setClauses.join(', ')}
         WHERE id = $${columns.length + 1} AND tenant_id = $${columns.length + 2} RETURNING *`,
        values
      )
      return r.rows[0]
    })
    if (!row) return res.status(404).json({ error: 'Campanha não encontrada.' })
    res.json({ campaign: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/broadcast/campaigns/:id
broadcastRouter.delete('/campaigns/:id', requirePermission('broadcast', 'delete'), async (req, res) => {
  try {
    const blocked = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT status FROM broadcast_campaigns WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      if (r.rows[0]?.status === 'sending') return true

      // broadcast_contacts referencia campaign_id via FK sem ON DELETE CASCADE —
      // sem apagar os contatos antes, o DELETE da campanha falharia (violação de FK)
      // sempre que já houvesse algum contato importado/enviado.
      await client.query('DELETE FROM broadcast_contacts WHERE campaign_id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
      await client.query('DELETE FROM broadcast_campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
      return false
    })
    if (blocked) return res.status(400).json({ error: 'Não é possível excluir uma campanha em andamento.' })
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

    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT * FROM broadcast_contacts WHERE campaign_id = $1 AND tenant_id = $2
         ORDER BY created_at ASC LIMIT $3 OFFSET $4`,
        [req.params.id, req.user.tenantId, limit, offset]
      )
      return r.rows
    })
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
broadcastRouter.post('/campaigns/:id/contacts', requirePermission('broadcast', 'create'), async (req, res) => {
  const parsed = contactSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const rows = parsed.data.contacts.map((c) => ({
      campaign_id: req.params.id,
      tenant_id:   req.user.tenantId,
      name:        c.name || null,
      phone:       normalizePhone(c.phone),
    }))

    await withTenant(req.user.tenantId, (client) => insertContactsBatch(client, rows))
    res.status(201).json({ imported: rows.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

async function insertContactsBatch(client, rows) {
  if (!rows.length) return
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK)
    const values = []
    const placeholders = batch.map((r, ri) => {
      const base = ri * 4
      values.push(r.campaign_id, r.tenant_id, r.name, r.phone)
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`
    })
    await client.query(
      `INSERT INTO broadcast_contacts (campaign_id, tenant_id, name, phone) VALUES ${placeholders.join(', ')}`,
      values
    )
  }
}

async function assertCampaignEditable(client, tenantId, campaignId) {
  const r = await client.query(
    'SELECT status FROM broadcast_campaigns WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [campaignId, tenantId]
  )
  if (!r.rows.length) return 'Campanha não encontrada.'
  if (!['draft', 'scheduled'].includes(r.rows[0].status)) {
    return 'Só é possível remover contatos de campanhas ainda não enviadas.'
  }
  return null
}

// DELETE /api/broadcast/campaigns/:id/contacts/:contactId — remove um contato da lista
broadcastRouter.delete('/campaigns/:id/contacts/:contactId', requirePermission('broadcast', 'delete'), async (req, res) => {
  try {
    const err = await withTenant(req.user.tenantId, async (client) => {
      const editErr = await assertCampaignEditable(client, req.user.tenantId, req.params.id)
      if (editErr) return editErr
      await client.query(
        'DELETE FROM broadcast_contacts WHERE id = $1 AND campaign_id = $2 AND tenant_id = $3',
        [req.params.contactId, req.params.id, req.user.tenantId]
      )
      return null
    })
    if (err) return res.status(err === 'Campanha não encontrada.' ? 404 : 400).json({ error: err })
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/broadcast/campaigns/:id/contacts — limpa toda a lista de contatos
broadcastRouter.delete('/campaigns/:id/contacts', requirePermission('broadcast', 'delete'), async (req, res) => {
  try {
    const err = await withTenant(req.user.tenantId, async (client) => {
      const editErr = await assertCampaignEditable(client, req.user.tenantId, req.params.id)
      if (editErr) return editErr
      await client.query(
        'DELETE FROM broadcast_contacts WHERE campaign_id = $1 AND tenant_id = $2',
        [req.params.id, req.user.tenantId]
      )
      return null
    })
    if (err) return res.status(err === 'Campanha não encontrada.' ? 404 : 400).json({ error: err })
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
broadcastRouter.post('/campaigns/:id/import-leads', requirePermission('broadcast', 'create'), async (req, res) => {
  const parsed = importLeadsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const campR = await client.query(
        'SELECT id FROM broadcast_campaigns WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      if (!campR.rows.length) return null

      const { stages, queueIds, tags, leadIds } = parsed.data
      const conditions = ['tenant_id = $1', 'phone IS NOT NULL']
      const values = [req.user.tenantId]
      if (leadIds?.length) {
        // seleção manual de contatos específicos — ignora os demais filtros
        values.push(leadIds)
        conditions.push(`id = ANY($${values.length}::uuid[])`)
      } else {
        if (stages?.length) { values.push(stages); conditions.push(`stage = ANY($${values.length}::text[])`) }
        if (queueIds?.length) { values.push(queueIds); conditions.push(`queue_id = ANY($${values.length}::uuid[])`) }
        if (tags?.length) { values.push(tags); conditions.push(`tags && $${values.length}::text[]`) }
      }

      const leadsR = await client.query(
        `SELECT name, phone FROM leads WHERE ${conditions.join(' AND ')} LIMIT 5000`,
        values
      )
      const leads = leadsR.rows
      if (!leads.length) return { matched: 0, imported: 0, skipped: 0 }

      // não duplica contatos já importados nesta campanha
      const existingR = await client.query(
        'SELECT phone FROM broadcast_contacts WHERE campaign_id = $1 LIMIT 20000',
        [req.params.id]
      )
      const existingPhones = new Set(existingR.rows.map((c) => c.phone))

      const rows = leads
        .filter((l) => l.phone && !existingPhones.has(l.phone))
        .map((l) => ({ campaign_id: req.params.id, tenant_id: req.user.tenantId, name: l.name || null, phone: l.phone }))

      if (rows.length) await insertContactsBatch(client, rows)

      return { matched: leads.length, imported: rows.length, skipped: leads.length - rows.length }
    })
    if (!result) return res.status(404).json({ error: 'Campanha não encontrada.' })
    res.status(201).json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/broadcast/campaigns/:id/send — inicia envio
broadcastRouter.post('/campaigns/:id/send', requirePermission('broadcast', 'edit'), async (req, res) => {
  try {
    const camp = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT * FROM broadcast_campaigns WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [req.params.id, req.user.tenantId]
      )
      return r.rows[0]
    })
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada.' })

    if (['sending', 'completed'].includes(camp.status)) {
      return res.status(400).json({ error: `Campanha já está ${camp.status}.` })
    }

    // marca como sending
    await withTenant(req.user.tenantId, (client) =>
      client.query(
        "UPDATE broadcast_campaigns SET status = 'sending', updated_at = $1 WHERE id = $2",
        [new Date().toISOString(), camp.id]
      )
    )

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

// Cada operação abaixo usa seu PRÓPRIO withTenant curto (não uma transação
// única pro envio inteiro) — uma campanha pode levar minutos/horas (até 5000
// contatos com 2-5s de intervalo cada), e segurar uma conexão do pool
// (max: 10) e uma transação aberta por todo esse tempo esgotaria o pool e
// causaria bloat/lock no Postgres. Cada query pega e devolve sua própria
// conexão rapidamente, como uma chamada HTTP normal faria.
export async function processBroadcast(tenantId, campaign) {
  const { sendText } = await import('../services/whatsapp/index.js')

  const contacts = await withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT id, phone, name FROM broadcast_contacts
       WHERE campaign_id = $1 AND status = 'pending' ORDER BY id LIMIT 5000`,
      [campaign.id]
    )
    return r.rows
  })

  // intervalo aleatório entre envios (evita padrão uniforme de robô); default 2-5s
  const minSec = campaign.min_interval_seconds || 2
  const maxSec = Math.max(campaign.max_interval_seconds || 5, minSec)
  const nextDelayMs = () => (minSec + Math.random() * (maxSec - minSec)) * 1000

  let sent = 0
  let idx = 0
  for (const c of contacts) {
    // a cada 10 envios verifica se a campanha foi cancelada
    if (idx++ % 10 === 0) {
      const stillSending = await withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT status FROM broadcast_campaigns WHERE id = $1 LIMIT 1', [campaign.id])
        return r.rows[0]?.status === 'sending'
      })
      if (!stillSending) break
    }
    try {
      const result = await sendText(tenantId, c.phone, campaign.content)
      await withTenant(tenantId, (client) =>
        client.query(
          "UPDATE broadcast_contacts SET status = 'sent', sent_at = $1, wa_message_id = $2 WHERE id = $3",
          [new Date().toISOString(), result?.id || null, c.id]
        )
      )
      sent++
      // throttle: intervalo aleatório configurado na campanha, para simular envio humano
      await new Promise((r) => setTimeout(r, nextDelayMs()))
    } catch (e) {
      await withTenant(tenantId, (client) =>
        client.query("UPDATE broadcast_contacts SET status = 'failed', error = $1 WHERE id = $2", [e.message, c.id])
      )
    }
  }

  // só marca completed se ainda estava sending (não foi cancelada)
  await withTenant(tenantId, async (client) => {
    const r = await client.query('SELECT status FROM broadcast_campaigns WHERE id = $1 LIMIT 1', [campaign.id])
    if (r.rows[0]?.status === 'sending') {
      await client.query(
        "UPDATE broadcast_campaigns SET status = 'completed', sent_count = $1, updated_at = $2 WHERE id = $3",
        [sent, new Date().toISOString(), campaign.id]
      )
    }
  })
}

// POST /api/broadcast/campaigns/:id/cancel
broadcastRouter.post('/campaigns/:id/cancel', requirePermission('broadcast', 'edit'), async (req, res) => {
  try {
    await withTenant(req.user.tenantId, (client) =>
      client.query(
        "UPDATE broadcast_campaigns SET status = 'cancelled', updated_at = $1 WHERE id = $2 AND tenant_id = $3",
        [new Date().toISOString(), req.params.id, req.user.tenantId]
      )
    )
    res.json({ cancelled: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
