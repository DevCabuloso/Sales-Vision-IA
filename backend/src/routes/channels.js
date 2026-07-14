import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config/index.js'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { getOrCreateChannelWebhookSecret } from '../utils/channelWebhookSecret.js'

export const channelsRouter = Router()

function evoFetch(path, options = {}) {
  const { apiUrl, apiKey } = config.evolution
  if (!apiUrl) throw new Error('EVOLUTION_API_URL não configurado no .env')
  return fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { apikey: apiKey, 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(10_000),
  })
}

function instanceName(tenantId, channelId) {
  return `sdr_${tenantId.replace(/-/g, '').slice(0, 8)}_${channelId.replace(/-/g, '').slice(0, 8)}`
}

// GET /api/channels
channelsRouter.get('/', requireAuth, requireTenant, async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('channels').select('*')
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: false })
    )
    res.json({ channels: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/channels
const createSchema = z.object({ name: z.string().min(1).max(60) })

channelsRouter.post('/', requireAuth, requireTenant, async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })

  try {
    const rows = unwrap(
      await supabase.from('channels').insert({
        tenant_id: req.user.tenantId,
        name: parsed.data.name,
        status: 'disconnected',
      }).select()
    )
    const channel = rows[0]
    const instance = instanceName(req.user.tenantId, channel.id)

    unwrap(
      await supabase.from('channels').update({ instance_name: instance }).eq('id', channel.id)
    )

    const r = await evoFetch('/instance/create', {
      method: 'POST',
      body: JSON.stringify({ instanceName: instance, integration: 'WHATSAPP-BAILEYS' }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.message || `Evolution erro ${r.status}`)
    }

    // Registra o webhook já na criação — sem isso a instância cai no webhook global da
    // Evolution (sem o header do EVOLUTION_WEBHOOK_SECRET) e fica surda em produção.
    const webhookUrl = `${config.backendUrl}/webhooks/evolution/${req.user.tenantId}`
    await evoFetch(`/webhook/set/${instance}`, {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: true,
          headers: config.evolution.webhookSecret ? { apikey: config.evolution.webhookSecret } : null,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE', 'SEND_MESSAGE'],
        },
      }),
    }).catch((e) => console.error('[channels] falha ao registrar webhook na criação:', e.message))

    res.json({ channel: { ...channel, instance_name: instance } })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/channels/:id/qr
channelsRouter.get('/:id/qr', requireAuth, requireTenant, async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('channels').select('*')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Canal não encontrado.' })
    const channel = rows[0]

    // Após logout a instância fica em estado inconsistente — reinicia antes de gerar novo QR
    if (channel.status === 'disconnected') {
      const restartRes = await evoFetch(`/instance/restart/${channel.instance_name}`, { method: 'POST' }).catch(() => null)
      // Se restart falhou pode ser que a instância não existe mais — recria
      if (!restartRes || !restartRes.ok) {
        await evoFetch('/instance/create', {
          method: 'POST',
          body: JSON.stringify({ instanceName: channel.instance_name, integration: 'WHATSAPP-BAILEYS' }),
        }).catch((e) => console.warn('[channels/qr] falha ao recriar instância:', e.message))
      }
      // Aguarda a instância estabilizar antes de pedir o QR
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }

    const r = await evoFetch(`/instance/connect/${channel.instance_name}`)
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.message || `Evolution erro ${r.status}`)
    }
    const data = await r.json()
    res.json({ qr: data.base64 || data.qrcode?.base64 || null, pairingCode: data.code || null })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/channels/:id/status
channelsRouter.get('/:id/status', requireAuth, requireTenant, async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('channels').select('*')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Canal não encontrado.' })
    const channel = rows[0]

    const r = await evoFetch(`/instance/connectionState/${channel.instance_name}`)
    if (!r.ok) return res.json({ status: 'disconnected', phone: null })

    const data = await r.json()
    const state = data.instance?.state || data.state || 'close'
    const connected = state === 'open'
    const phone = data.instance?.profileName || data.instance?.me?.user || null

    if (connected && channel.status !== 'connected') {
      await supabase.from('channels').update({
        status: 'connected', phone, updated_at: new Date().toISOString(),
      }).eq('id', channel.id)
    } else if (!connected && channel.status === 'connected') {
      await supabase.from('channels').update({
        status: 'disconnected', phone: null, updated_at: new Date().toISOString(),
      }).eq('id', channel.id)
    }

    res.json({ status: connected ? 'connected' : 'disconnected', phone })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/channels/:id/settings — salvar configurações completas
const settingsSchema = z.object({
  name:              z.string().max(60).optional().nullable(),
  goodbye_message:   z.string().max(1000).optional().nullable(),
  assigned_user_id:  z.string().optional().nullable(),
  assigned_queue_id: z.string().optional().nullable(),
})
channelsRouter.patch('/:id/settings', requireAuth, requireTenant, async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { name, goodbye_message, assigned_user_id, assigned_queue_id } = parsed.data
  try {
    const update = { updated_at: new Date().toISOString() }
    if (name              !== undefined) update.name               = name?.trim() || null
    if (goodbye_message   !== undefined) update.goodbye_message    = goodbye_message || null
    if (assigned_user_id  !== undefined) update.assigned_user_id   = assigned_user_id || null
    if (assigned_queue_id !== undefined) update.assigned_queue_id  = assigned_queue_id || null

    const rows = unwrap(
      await supabase.from('channels')
        .update(update)
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
        .select()
    )
    if (!rows.length) return res.status(404).json({ error: 'Canal não encontrado.' })
    res.json({ channel: rows[0] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH /api/channels/:id — renomear canal
channelsRouter.patch('/:id', requireAuth, requireTenant, async (req, res) => {
  const parsed = createSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'Nome obrigatório.' })
  const { name } = parsed.data
  try {
    const rows = unwrap(
      await supabase.from('channels')
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
        .select()
    )
    if (!rows.length) return res.status(404).json({ error: 'Canal não encontrado.' })
    res.json({ channel: rows[0] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/channels/:id/default — definir como padrão
channelsRouter.patch('/:id/default', requireAuth, requireTenant, async (req, res) => {
  try {
    // Remove padrão de todos do tenant, depois define o selecionado
    await supabase.from('channels').update({ is_default: false }).eq('tenant_id', req.user.tenantId)
    const rows = unwrap(
      await supabase.from('channels')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
        .select()
    )
    if (!rows.length) return res.status(404).json({ error: 'Canal não encontrado.' })
    res.json({ channel: rows[0] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/channels/:id/close-tickets — fechar tickets abertos ou pendentes
channelsRouter.post('/:id/close-tickets', requireAuth, requireTenant, async (req, res) => {
  const { status } = req.body || {}
  const allowed = ['open', 'pending', 'all']
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido. Use: open, pending, all.' })
  try {
    let q = supabase.from('leads')
      .update({ conversation_status: 'resolved', human_takeover: false, assigned_to: null, updated_at: new Date().toISOString() })
      .eq('tenant_id', req.user.tenantId)
      .eq('channel_id', req.params.id)
    if (status !== 'all') q = q.eq('conversation_status', status)
    else q = q.in('conversation_status', ['open', 'pending'])
    const { count } = await q.select('id', { count: 'exact', head: true })
    await q
    res.json({ closed: count ?? 0 })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/channels/:id/revalidate-webhook — reregistra webhook na Evolution
channelsRouter.post('/:id/revalidate-webhook', requireAuth, requireTenant, async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('channels').select('instance_name')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Canal não encontrado.' })

    const webhookUrl = `${config.backendUrl}/webhooks/evolution/${req.user.tenantId}`
    // Segredo próprio deste canal (gerado na hora se ainda não existir) — a
    // Evolution passa a mandar ESSE valor no header, e routes/webhooks.js
    // passa a exigir ele em vez do EVOLUTION_WEBHOOK_SECRET global compartilhado
    // entre todos os tenants (ver utils/channelWebhookSecret.js).
    const webhookSecret = await getOrCreateChannelWebhookSecret(req.params.id)
    // Evolution API v2 espera body aninhado em { webhook: { ... } } com camelCase.
    const r = await evoFetch(`/webhook/set/${rows[0].instance_name}`, {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: true,
          headers: { apikey: webhookSecret },
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE', 'SEND_MESSAGE'],
        },
      }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.message || err.error || `Evolution erro ${r.status}`)
    }
    res.json({ revalidated: true, webhookUrl })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/channels/:id/disconnect
channelsRouter.post('/:id/disconnect', requireAuth, requireTenant, async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('channels').select('instance_name')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Canal não encontrado.' })

    const { instance_name } = rows[0]

    // Logout da sessão WhatsApp
    await evoFetch(`/instance/logout/${instance_name}`, { method: 'DELETE' })
      .catch((e) => console.warn('[channels/disconnect] falha ao fazer logout na Evolution:', e.message))

    // Reinicia a instância imediatamente para deixá-la pronta para novo QR
    await evoFetch(`/instance/restart/${instance_name}`, { method: 'POST' })
      .catch((e) => console.warn('[channels/disconnect] falha ao reiniciar instância:', e.message))

    unwrap(await supabase.from('channels').update({
      status: 'disconnected', phone: null, updated_at: new Date().toISOString(),
    }).eq('id', req.params.id))

    res.json({ disconnected: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/channels/:id
channelsRouter.delete('/:id', requireAuth, requireTenant, async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('channels').select('instance_name')
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Canal não encontrado.' })

    // a Evolution recusa excluir uma instância ainda conectada — desconecta antes de excluir
    const { instance_name } = rows[0]
    await evoFetch(`/instance/logout/${instance_name}`, { method: 'DELETE' })
      .catch((e) => console.warn('[channels/delete] falha ao fazer logout na Evolution:', e.message))
    await evoFetch(`/instance/delete/${instance_name}`, { method: 'DELETE' })
      .catch((e) => console.warn('[channels/delete] falha ao remover instância na Evolution:', e.message))

    unwrap(await supabase.from('channels').delete().eq('id', req.params.id))
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
