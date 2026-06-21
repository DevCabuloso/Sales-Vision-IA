import { Router } from 'express'
import { config } from '../config/index.js'
import { supabase, unwrap } from '../db/supabase.js'
import { meta, evolution } from '../services/whatsapp/index.js'
import { handleInboundMessage } from '../services/orchestrator.js'

export const webhooksRouter = Router()

// ════════════════════════════════════════════════
// META — verificação do webhook (GET) e recebimento (POST)
// O tenant é resolvido pelo phone_number_id da credencial salva.
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

webhooksRouter.post('/meta', async (req, res) => {
  res.sendStatus(200) // responde rápido; processa em seguida
  try {
    const msgs = meta.parseWebhook(req.body)
    for (const m of msgs) {
      // descobre o tenant pelo phoneNumberId guardado em integrations.meta
      const rows = unwrap(
        await supabase.from('integrations')
          .select('tenant_id, meta')
          .eq('provider', 'meta_whatsapp').eq('status', 'connected')
      )
      const match = rows.find((r) => r.meta?.phoneNumberId === m.phoneNumberId)
      if (!match) continue
      await handleInboundMessage({
        tenantId: match.tenant_id,
        from: m.from,
        text: m.text,
        provider: 'meta_whatsapp',
      })
    }
  } catch (e) {
    console.error('[webhook meta]', e.message)
  }
})

// ════════════════════════════════════════════════
// EVOLUTION — recebimento. O tenant vem na URL: /webhooks/evolution/:tenantId
// (configure essa URL no painel da sua Evolution para cada instância)
// ════════════════════════════════════════════════
webhooksRouter.post('/evolution/:tenantId', async (req, res) => {
  res.sendStatus(200)
  try {
    const parsed = evolution.parseWebhook(req.body)
    if (!parsed) return
    await handleInboundMessage({
      tenantId: req.params.tenantId,
      from: parsed.from,
      text: parsed.text,
      provider: 'evolution',
    })
  } catch (e) {
    console.error('[webhook evolution]', e.message)
  }
})
