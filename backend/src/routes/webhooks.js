import { Router } from 'express'
import express from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { config } from '../config/index.js'
import { supabase, unwrap } from '../db/supabase.js'
import { meta, evolution } from '../services/whatsapp/index.js'
import { handleInboundMessage, handleOutboundMessage } from '../services/orchestrator.js'
import { timingSafeStringEqual } from '../utils/timingSafeCompare.js'
import { matchTenantWebhookSecret, matchInstanceWebhookSecret } from '../utils/channelWebhookSecret.js'

export const webhooksRouter = Router()

// Query de verificação do GET /meta — valida que cada campo veio como string
// única (não array/objeto, o que a Meta nunca envia mas um cliente HTTP
// arbitrário poderia via `?hub.challenge=a&hub.challenge=b`).
const hubVerifyQuerySchema = z.object({
  'hub.mode':          z.string().optional(),
  'hub.verify_token':  z.string().optional(),
  'hub.challenge':     z.string().optional(),
})

// Formato exato de um header X-Hub-Signature-256 válido (sha256=<64 hex>).
// Validar isso ANTES de comparar com crypto.timingSafeEqual é obrigatório:
// timingSafeEqual lança se os dois buffers não tiverem o mesmo tamanho, e um
// header maior que o esperado (totalmente controlado pelo requisitante, já
// que esta rota não exige autenticação) lançava dentro de um handler async —
// em Express 4 isso vira uma promise rejeitada sem catch, que derruba o
// processo Node inteiro. Rejeitar o formato aqui evita chegar nesse ponto.
const metaSignatureSchema = z.string().regex(/^sha256=[0-9a-f]{64}$/)

// Recalcula os contadores agregados da campanha (evita race condition de
// incrementos concorrentes vindos de múltiplos webhooks). Usa COUNT com
// head:true (2 queries leves que só devolvem um número) em vez de puxar o
// `status` de TODOS os contatos da campanha a cada evento — antes, uma
// campanha de 5.000 contatos, recebendo até 3 eventos de status por contato
// (sent→delivered→read), podia gerar até ~75 milhões de leituras de linha só
// pra manter esses dois contadores atualizados.
async function recomputeBroadcastCounts(campaignId) {
  const [deliveredRes, readRes] = await Promise.all([
    supabase.from('broadcast_contacts').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId).in('status', ['delivered', 'read']),
    supabase.from('broadcast_contacts').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId).eq('status', 'read'),
  ])
  await supabase.from('broadcast_campaigns').update({
    delivered_count: deliveredRes.count ?? 0,
    read_count: readRes.count ?? 0,
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
  const parsed = hubVerifyQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.sendStatus(403)
  const mode = parsed.data['hub.mode']
  const token = parsed.data['hub.verify_token']
  const challenge = parsed.data['hub.challenge']
  if (mode === 'subscribe' && token === config.meta.verifyToken) {
    return res.status(200).send(challenge)
  }
  res.sendStatus(403)
})

// Usa express.raw() para ter acesso ao body bruto e verificar HMAC X-Hub-Signature-256
webhooksRouter.post('/meta',
  express.raw({ type: 'application/json', limit: '10mb' }),
  async (req, res) => {
    // Em produção a verificação HMAC é obrigatória: sem META_APP_SECRET configurado,
    // qualquer requisição não assinada seria aceita como se viesse da Meta (forjar
    // mensagens/leads em qualquer tenant). Em dev, sem a secret, a rota fica aberta
    // de propósito para facilitar testes locais sem precisar configurar tudo.
    if (process.env.NODE_ENV === 'production' && !config.meta.appSecret) {
      console.error('[webhook meta] META_APP_SECRET ausente em produção — recusando requisição')
      return res.sendStatus(403)
    }
    if (config.meta.appSecret) {
      const sigParsed = metaSignatureSchema.safeParse(req.headers['x-hub-signature-256'])
      if (!sigParsed.success) {
        console.warn('[webhook meta] assinatura ausente ou malformada — rejeitando requisição')
        return res.sendStatus(403)
      }
      const expected = 'sha256=' + crypto
        .createHmac('sha256', config.meta.appSecret)
        .update(req.body)
        .digest('hex')
      // sigParsed.data e expected têm sempre o mesmo formato (sha256= + 64 hex),
      // então os buffers já nascem do mesmo tamanho — sem precisar de padEnd.
      if (!crypto.timingSafeEqual(Buffer.from(sigParsed.data), Buffer.from(expected))) {
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
    const provided = req.headers['apikey'] || req.headers['authorization']?.replace('Bearer ', '')
    // Segredo por-canal tem prioridade: se o canal dono desta instância já
    // tem um webhook_secret próprio (ver channelWebhookSecret.js), só ele
    // vale — não cai no fallback global, senão o segredo por-canal não
    // protegeria nada contra alguém que só tenha a secret global antiga.
    const instanceName = req.body?.instance || req.body?.instanceName || null
    const perInstance = instanceName ? await matchInstanceWebhookSecret(instanceName, provided) : 'none-set'
    if (perInstance === 'mismatch') {
      console.warn('[webhook evolution] secret por-canal inválido')
      return res.sendStatus(403)
    }
    if (perInstance === 'none-set') {
      // Mesma lógica de fail-closed do webhook da Meta acima: em produção, sem
      // EVOLUTION_WEBHOOK_SECRET configurado, esta rota resolve o tenant só pelo
      // nome da instância vindo do payload — sem a secret, qualquer requisição
      // externa conseguiria injetar mensagens/leads falsos em qualquer tenant.
      if (process.env.NODE_ENV === 'production' && !config.evolution.webhookSecret) {
        console.error('[webhook evolution] EVOLUTION_WEBHOOK_SECRET ausente em produção — recusando requisição')
        return res.sendStatus(403)
      }
      if (config.evolution.webhookSecret && !timingSafeStringEqual(provided, config.evolution.webhookSecret)) {
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
    const provided = req.headers['apikey'] || req.headers['authorization']?.replace('Bearer ', '')
    // Segredo por-tenant (ver channelWebhookSecret.js) tem prioridade sobre o
    // EVOLUTION_WEBHOOK_SECRET global — sem isso, quem detivesse a secret
    // global forjava eventos pra QUALQUER tenant só trocando o :tenantId da
    // URL. Uma vez que o tenant tem um segredo próprio, o fallback global
    // para de valer pra ele (senão o segredo por-tenant não protegeria nada).
    const perTenant = await matchTenantWebhookSecret(req.params.tenantId, provided)
    if (perTenant === 'mismatch') {
      console.warn(`[webhook evolution] secret por-tenant inválido para tenant=${req.params.tenantId}`)
      return res.sendStatus(403)
    }
    if (perTenant === 'none-set') {
      // Mesma lógica de fail-closed das outras rotas de webhook acima.
      if (process.env.NODE_ENV === 'production' && !config.evolution.webhookSecret) {
        console.error('[webhook evolution] EVOLUTION_WEBHOOK_SECRET ausente em produção — recusando requisição')
        return res.sendStatus(403)
      }
      if (config.evolution.webhookSecret && !timingSafeStringEqual(provided, config.evolution.webhookSecret)) {
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
