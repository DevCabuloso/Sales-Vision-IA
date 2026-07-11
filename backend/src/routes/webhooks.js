import { Router } from 'express'
import express from 'express'
import crypto from 'node:crypto'
import { config } from '../config/index.js'
import { supabase, unwrap } from '../db/supabase.js'
import { meta, evolution } from '../services/whatsapp/index.js'
import { handleInboundMessage, handleOutboundMessage } from '../services/orchestrator.js'

export const webhooksRouter = Router()

// Recalcula os contadores agregados da campanha a partir dos contatos (evita
// race condition de incrementos concorrentes vindos de múltiplos webhooks).
async function recomputeBroadcastCounts(campaignId) {
  const rows = unwrap(
    await supabase.from('broadcast_contacts').select('status').eq('campaign_id', campaignId)
  )
  const delivered = rows.filter((r) => r.status === 'delivered' || r.status === 'read').length
  const read = rows.filter((r) => r.status === 'read').length
  await supabase.from('broadcast_campaigns').update({
    delivered_count: delivered,
    read_count: read,
    updated_at: new Date().toISOString(),
  }).eq('id', campaignId)
}

// Aplica um evento de status (sent/delivered/read) a um contato de campanha,
// casando pelo wa_message_id salvo no envio. Se não achar (mensagem de
// conversa normal, não de campanha), simplesmente não faz nada.
async function applyBroadcastStatus(tenantId, messageId, status) {
  if (!messageId || !['delivered', 'read'].includes(status)) return
  const patch = { status }
  if (status === 'delivered') patch.delivered_at = new Date().toISOString()
  if (status === 'read') patch.read_at = new Date().toISOString()

  const rows = unwrap(
    await supabase.from('broadcast_contacts')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('wa_message_id', messageId)
      .neq('status', 'read') // não regride de 'read' para 'delivered' em evento fora de ordem
      .select('campaign_id')
  )
  if (!rows?.length) return
  await recomputeBroadcastCounts(rows[0].campaign_id)
}

// Resolve o tenant a partir do nome da instância Evolution (channels ou,
// em fallback, integrations legado por-tenant).
async function resolveEvolutionTenant(instanceName) {
  if (!instanceName) return null
  const chRows = unwrap(
    await supabase.from('channels').select('tenant_id')
      .eq('instance_name', instanceName).limit(1)
  )
  if (chRows?.[0]?.tenant_id) return chRows[0].tenant_id

  const intRows = unwrap(
    await supabase.from('integrations').select('tenant_id, meta')
      .eq('provider', 'evolution').eq('status', 'connected')
  )
  return intRows?.find((r) => r.meta?.instanceName === instanceName)?.tenant_id || null
}

// GET /webhooks/ping
webhooksRouter.get('/ping', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// ════════════════════════════════════════════════
// META — verificação (GET) e recebimento (POST)
// ════════════════════════════════════════════════
webhooksRouter.get('/meta', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  if (mode === 'subscribe' && token === config.meta.verifyToken) {
    return res.status(200).send(challenge)
  }
  res.sendStatus(403)
})

// Usa express.raw() para ter acesso ao body bruto e verificar HMAC X-Hub-Signature-256
webhooksRouter.post('/meta',
  express.raw({ type: 'application/json', limit: '10mb' }),
  async (req, res) => {
    // Verificação HMAC — obrigatória quando META_APP_SECRET estiver configurado
    if (config.meta.appSecret) {
      const sig = req.headers['x-hub-signature-256'] || ''
      const expected = 'sha256=' + crypto
        .createHmac('sha256', config.meta.appSecret)
        .update(req.body)
        .digest('hex')
      if (!crypto.timingSafeEqual(Buffer.from(sig.padEnd(expected.length)), Buffer.from(expected))) {
        console.warn('[webhook meta] assinatura inválida — rejeitando requisição')
        return res.sendStatus(403)
      }
    }

    res.sendStatus(200)

    try {
      const body = JSON.parse(req.body.toString())
      const msgs     = meta.parseWebhook(body)
      const statuses = meta.parseWebhookStatuses(body)

      const hasActivity = msgs.length || statuses.length
      if (!hasActivity) return

      // Busca integrações UMA vez fora do loop — evita N+1
      const rows = unwrap(
        await supabase.from('integrations')
          .select('tenant_id, meta')
          .eq('provider', 'meta_whatsapp').eq('status', 'connected')
      )

      // Mensagens recebidas
      for (const m of msgs) {
        const match = rows.find((r) => r.meta?.phoneNumberId === m.phoneNumberId)
        if (!match) continue
        await handleInboundMessage({
          tenantId: match.tenant_id,
          from:      m.from,
          text:      m.text,
          mediaType: m.mediaType || null,
          mediaId:   m.mediaId || null,
          mediaMimeType: m.mediaMimeType || null,
          mediaFilename: m.mediaFilename || null,
          provider:  'meta_whatsapp',
          pushName:  m.pushName || null,
          waMessageId: m.waMessageId || null,
          replyToWaId: m.replyToWaId || null,
        })
      }

      // Status de entrega (sent / delivered / read / failed)
      for (const s of statuses) {
        if (s.status === 'failed') {
          console.error(`[webhook meta] mensagem ${s.messageId} falhou para ${s.recipientId}: ${s.error}`)
          continue
        }
        const match = rows.find((r) => r.meta?.phoneNumberId === s.phoneNumberId)
        if (!match) continue
        await applyBroadcastStatus(match.tenant_id, s.messageId, s.status)
      }
    } catch (e) {
      console.error('[webhook meta]', e.message)
    }
  }
)

// ════════════════════════════════════════════════
// EVOLUTION — rota universal (sem tenantId na URL)
// Resolve o tenant pelo nome da instância → tabela channels
// ════════════════════════════════════════════════
webhooksRouter.post('/evolution',
  express.json({ limit: '10mb' }),
  async (req, res) => {
    if (config.evolution.webhookSecret) {
      const provided = req.headers['apikey'] || req.headers['authorization']?.replace('Bearer ', '')
      if (provided !== config.evolution.webhookSecret) {
        console.warn('[webhook evolution] secret inválido')
        return res.sendStatus(403)
      }
    }

    res.sendStatus(200)

    try {
      const event = req.body?.event || '(sem event)'

      // Status de entrega (sent/delivered/read) — evento messages.update
      const statuses = evolution.parseWebhookStatus(req.body)
      if (statuses.length) {
        for (const s of statuses) {
          const tId = await resolveEvolutionTenant(s.instanceName)
          if (!tId) continue
          await applyBroadcastStatus(tId, s.messageId, s.status)
        }
      }

      const parsed = evolution.parseWebhook(req.body)
      if (!parsed) return

      const instanceName = parsed.instanceName
      console.log(`[webhook evolution] event=${event} instance=${instanceName}`)

      const tenantId = await resolveEvolutionTenant(instanceName)
      if (!tenantId) {
        console.warn(`[webhook evolution] instância não reconhecida: ${instanceName}`)
        return
      }

      console.log(`[webhook evolution] tenant resolvido: ${tenantId}`)

      if (parsed.fromMe) {
        await handleOutboundMessage({
          tenantId, to: parsed.from, text: parsed.text,
          mediaType: parsed.mediaType, mediaMimeType: parsed.mediaMimeType, mediaFilename: parsed.mediaFilename,
          mediaMessageId: parsed.mediaMessageId, mediaRemoteJid: parsed.mediaRemoteJid, mediaFromMe: parsed.mediaFromMe,
          provider: 'evolution', instanceName,
          waMessageId: parsed.waMessageId, replyToWaId: parsed.replyToWaId,
          isGroup: parsed.isGroup,
        })
        return
      }

      await handleInboundMessage({
        tenantId, from: parsed.from, text: parsed.text,
        mediaType: parsed.mediaType, mediaMimeType: parsed.mediaMimeType, mediaFilename: parsed.mediaFilename,
        mediaMessageId: parsed.mediaMessageId, mediaRemoteJid: parsed.mediaRemoteJid, mediaFromMe: parsed.mediaFromMe,
        provider: 'evolution', instanceName, pushName: parsed.pushName,
        waMessageId: parsed.waMessageId, replyToWaId: parsed.replyToWaId,
        isGroup: parsed.isGroup, senderJid: parsed.senderJid,
      })
    } catch (e) {
      console.error('[webhook evolution]', e.message)
    }
  }
)

// ════════════════════════════════════════════════
// EVOLUTION — rota com tenantId explícito (compatibilidade)
// ════════════════════════════════════════════════
webhooksRouter.post('/evolution/:tenantId',
  express.json({ limit: '10mb' }),
  async (req, res) => {
    // Verificação do secret da Evolution via header apikey
    if (config.evolution.webhookSecret) {
      const provided = req.headers['apikey'] || req.headers['authorization']?.replace('Bearer ', '')
      if (provided !== config.evolution.webhookSecret) {
        console.warn(`[webhook evolution] secret inválido para tenant=${req.params.tenantId}`)
        return res.sendStatus(403)
      }
    }

    res.sendStatus(200)

    try {
      const event = req.body?.event || '(sem event)'
      console.log(`[webhook evolution] tenant=${req.params.tenantId} event=${event}`)

      // Status de entrega (sent/delivered/read) — evento messages.update
      const statuses = evolution.parseWebhookStatus(req.body)
      if (statuses.length) {
        for (const s of statuses) {
          await applyBroadcastStatus(req.params.tenantId, s.messageId, s.status)
        }
      }

      const parsed = evolution.parseWebhook(req.body)
      if (!parsed) return

      const fromMasked = parsed.from ? `${parsed.from.slice(0, 3)}***${parsed.from.slice(-2)}` : '??'
      console.log(`[webhook evolution] msg de ${fromMasked} via ${parsed.instanceName || 'default'}`)

      if (parsed.fromMe) {
        await handleOutboundMessage({
          tenantId: req.params.tenantId,
          to: parsed.from,
          text: parsed.text,
          mediaType: parsed.mediaType,
          mediaMimeType: parsed.mediaMimeType,
          mediaFilename: parsed.mediaFilename,
          mediaMessageId: parsed.mediaMessageId,
          mediaRemoteJid: parsed.mediaRemoteJid,
          mediaFromMe: parsed.mediaFromMe,
          provider: 'evolution',
          instanceName: parsed.instanceName,
          waMessageId: parsed.waMessageId,
          replyToWaId: parsed.replyToWaId,
          isGroup: parsed.isGroup,
        })
        return
      }

      await handleInboundMessage({
        tenantId: req.params.tenantId,
        from: parsed.from,
        text: parsed.text,
        mediaType: parsed.mediaType,
        mediaMimeType: parsed.mediaMimeType,
        mediaFilename: parsed.mediaFilename,
        mediaMessageId: parsed.mediaMessageId,
        mediaRemoteJid: parsed.mediaRemoteJid,
        mediaFromMe: parsed.mediaFromMe,
        provider: 'evolution',
        instanceName: parsed.instanceName,
        pushName: parsed.pushName,
        waMessageId: parsed.waMessageId,
        replyToWaId: parsed.replyToWaId,
        isGroup: parsed.isGroup,
        senderJid: parsed.senderJid,
      })
    } catch (e) {
      console.error('[webhook evolution]', e.message)
    }
  }
)
