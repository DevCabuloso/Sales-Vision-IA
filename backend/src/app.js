import express from 'express'
// Patcheia Router/Route do Express 4 para que handlers async que rejeitam
// (ex.: unwrap() lançando erro do Supabase) caiam no handler de erro global
// abaixo via next(err), em vez de virarem unhandledRejection e derrubar o
// processo inteiro (Express 4 não faz isso sozinho, só o 5).
import 'express-async-errors'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import { config } from './config/index.js'
import { requestId } from './middleware/requestId.js'
import { authRouter } from './routes/auth.js'
import { leadsRouter } from './routes/leads.js'
import { appointmentsRouter } from './routes/appointments.js'
import { integrationsRouter } from './routes/integrations.js'
import { adminRouter } from './routes/admin.js'
import { webhooksRouter } from './routes/webhooks.js'
import { aiConfigRouter } from './routes/ai-config.js'
import { templatesRouter } from './routes/templates.js'
import { chatRouter } from './routes/chat.js'
import { customApisRouter } from './routes/custom-apis.js'
import { operatorsRouter } from './routes/operators.js'
import { broadcastRouter } from './routes/broadcast.js'
import { channelsRouter } from './routes/channels.js'
import { contactsRouter } from './routes/contacts.js'
import { labelsRouter } from './routes/labels.js'
import { queuesRouter } from './routes/queues.js'
import { businessHoursRouter } from './routes/business-hours.js'
import { internalGroupsRouter } from './routes/internal-groups.js'
import { opSettingsRouter } from './routes/op-settings.js'
import { notificationsRouter } from './routes/notifications.js'
import { flowsRouter } from './routes/flows.js'
import { reportsRouter } from './routes/reports.js'
import { followupsRouter } from './routes/followups.js'
import { billingRouter } from './routes/billing.js'
import { supportRouter } from './routes/support.js'
import { adminSupportRouter } from './routes/admin-support.js'

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.' },
})

// Limite geral pra toda a API — hoje só login/registro tinham rate limit.
// Sem isso, um pico (bug de polling, script, abuso) enfileira tudo no Supabase
// pra qualquer cliente conectado, em vez de ser rejeitado rápido só pra quem
// estourou. Janela e teto generosos de propósito: uma equipe inteira pode
// estar atrás do mesmo IP de escritório (NAT), e a UI já faz polling/realtime
// com frequência normal — o alvo aqui é abuso/loop, não uso legítimo intenso.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em instantes.' },
})

// /webhooks/* não exige autenticação (é chamado pela Meta/Evolution), então
// fica de fora do apiLimiter (que só cobre /api). Sem limite nenhum, era uma
// rota aberta a flood ilimitado. Teto generoso porque picos legítimos de
// eventos (broadcast grande, campanha) podem gerar muitas chamadas em pouco
// tempo — o alvo aqui é abuso/flood, não tráfego normal do provedor.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições.' },
})

export function createApp() {
  const app = express()

  // Em produção o Express fica atrás do nginx (proxy reverso na mesma
  // máquina) — sem isso, req.ip é sempre o IP do nginx (127.0.0.1) pra
  // TODAS as requisições, e qualquer rate limit por IP (inclusive o
  // authLimiter abaixo, que já existia) vira um balde único compartilhado
  // por todo mundo em vez de um por cliente real.
  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors({ origin: config.frontendUrl, credentials: true }))
  app.use(cookieParser())
  // Correlação: um ID por requisição (req.requestId), devolvido também no header
  // X-Request-Id — ver middleware/requestId.js para o racional e limitações atuais.
  app.use(requestId)

  // Webhooks montados ANTES do express.json() para que /webhooks/meta
  // possa usar express.raw() e verificar a assinatura HMAC do Meta
  app.use('/webhooks', webhookLimiter, webhooksRouter)

  app.use(express.json({ limit: '2mb' }))

  // Em produção, substitui mensagens internas de erro por texto genérico antes
  // de chegar ao cliente — cobre todos os blocos catch que usam e.message.
  if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
      const _json = res.json.bind(res)
      res.json = (body) => {
        if (res.statusCode >= 500 && body?.error && typeof body.error === 'string') {
          return _json({ error: 'Erro interno do servidor.' })
        }
        return _json(body)
      }
      next()
    })
  }

  app.get('/api/health', async (req, res) => {
    try {
      const { supabase } = await import('./db/supabase.js')
      const { error } = await supabase.from('tenants').select('id').limit(1)
      if (error) return res.status(503).json({ ok: false, ts: Date.now(), supabase: `ERRO: ${error.message}` })
      res.json({ ok: true, ts: Date.now(), supabase: 'conectado' })
    } catch (e) {
      res.status(503).json({ ok: false, ts: Date.now(), supabase: `ERRO: ${e.message}` })
    }
  })

  app.use('/api', apiLimiter)

  app.use('/api/auth/login', authLimiter)
  app.use('/api/auth/register', authLimiter)
  app.use('/api/auth/change-password', authLimiter)
  app.use('/api/billing/trial-signup', authLimiter)
  app.use('/api/billing/orders', authLimiter)

  app.use('/api/auth', authRouter)
  app.use('/api/billing', billingRouter)
  app.use('/api/leads', leadsRouter)
  app.use('/api/appointments', appointmentsRouter)
  app.use('/api/integrations', integrationsRouter)
  // precisa vir ANTES de '/api/admin' — senão toda request pra /api/admin/support/*
  // passaria primeiro pelo requireAuth+requireOwner "solto" do adminRouter (que não
  // tem rota /support e só devolveria o controle pro próximo app.use depois de já
  // ter rodado a checagem), fazendo autenticação em dobro à toa.
  app.use('/api/admin/support', adminSupportRouter)
  app.use('/api/admin', adminRouter)
  app.use('/api/ai-config', aiConfigRouter)
  app.use('/api/templates', templatesRouter)
  app.use('/api/chat', chatRouter)
  app.use('/api/custom-apis', customApisRouter)
  app.use('/api/operators', operatorsRouter)
  app.use('/api/broadcast', broadcastRouter)
  app.use('/api/channels', channelsRouter)
  app.use('/api/contacts', contactsRouter)
  app.use('/api/labels', labelsRouter)
  app.use('/api/queues', queuesRouter)
  app.use('/api/business-hours', businessHoursRouter)
  app.use('/api/internal-groups', internalGroupsRouter)
  app.use('/api/op-settings', opSettingsRouter)
  app.use('/api/reports', reportsRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/flows', flowsRouter)
  app.use('/api/followups', followupsRouter)
  app.use('/api/support', supportRouter)

  // 404
  app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }))

  // handler de erro global
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500
    // Inclui requestId no log (quando presente) para permitir cruzar este erro nos
    // logs do PM2 com o header X-Request-Id devolvido ao cliente. Os demais
    // console.* espalhados pelo código ainda não incluem esse ID (fora do escopo
    // desta mudança) — ver middleware/requestId.js.
    console.error(`[erro]${req.requestId ? ` [${req.requestId}]` : ''} ${req.method} ${req.originalUrl} ->`, err.message)
    res.status(status).json({ error: status === 413 ? 'Payload muito grande.' : 'Erro interno do servidor.' })
  })

  return app
}
