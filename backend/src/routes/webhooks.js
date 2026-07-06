import { Router } from 'express'
import express from 'express'
import crypto from 'node:crypto'
import { config } from '../config/index.js'
import { supabase, unwrap } from '../db/supabase.js'
import { meta, evolution } from '../services/whatsapp/index.js'
import { handleInboundMessage, handleOutboundMessage } from '../services/orchestrator.js'

export const webhooksRouter = Router()

// GET /webhooks/ping
webhooksRouter.get('/ping', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// GET /webhooks/debug-msgs?key=sdr2025 — diagnóstico sem login
webhooksRouter.get('/debug-msgs', async (req, res) => {
  if (req.query.key !== 'sdr2025') return res.status(403).json({ error: 'Chave inválida.' })
  try {
    const msgs = unwrap(
      await supabase.from('messages')
        .select('id, tenant_id, lead_id, role, text, media_url, media_type, media_mimetype, media_filename, created_at')
        .order('created_at', { ascending: false })
        .limit(20)
    )
    const leads = unwrap(
      await supabase.from('leads')
        .select('id, tenant_id, name, phone, conversation_status, updated_at')
        .order('updated_at', { ascending: false })
        .limit(20)
    )
    res.json({ messages: msgs, leads })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

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
  express.raw({ type: 'application/json' }),
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
        })
      }

      // Status de entrega (sent / delivered / read / failed)
      for (const s of statuses) {
        if (s.status === 'failed') {
          console.error(`[webhook meta] mensagem ${s.messageId} falhou para ${s.recipientId}: ${s.error}`)
        }
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
  express.json(),
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
      const parsed = evolution.parseWebhook(req.body)
      if (!parsed) return

      const instanceName = parsed.instanceName
      console.log(`[webhook evolution] event=${event} instance=${instanceName}`)

      // Resolve tenant pelo nome da instância (channels ou integrations)
      let tenantId = null
      if (instanceName) {
        const chRows = unwrap(
          await supabase.from('channels').select('tenant_id')
            .eq('instance_name', instanceName).limit(1)
        )
        tenantId = chRows?.[0]?.tenant_id || null
      }
      if (!tenantId) {
        // fallback: busca em integrations pelo instance_name no campo meta
        const intRows = unwrap(
          await supabase.from('integrations').select('tenant_id, meta')
            .eq('provider', 'evolution').eq('status', 'connected')
        )
        const match = intRows?.find((r) => r.meta?.instanceName === instanceName)
        tenantId = match?.tenant_id || null
      }

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
        })
        return
      }

      await handleInboundMessage({
        tenantId, from: parsed.from, text: parsed.text,
        mediaType: parsed.mediaType, mediaMimeType: parsed.mediaMimeType, mediaFilename: parsed.mediaFilename,
        mediaMessageId: parsed.mediaMessageId, mediaRemoteJid: parsed.mediaRemoteJid, mediaFromMe: parsed.mediaFromMe,
        provider: 'evolution', instanceName, pushName: parsed.pushName,
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
  express.json(),
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
      })
    } catch (e) {
      console.error('[webhook evolution]', e.message)
    }
  }
)
