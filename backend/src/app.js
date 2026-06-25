import express from 'express'
import cors from 'cors'
import { config } from './config/index.js'
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

export function createApp() {
  const app = express()

  app.use(cors({ origin: config.frontendUrl, credentials: true }))
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', async (req, res) => {
    try {
      const { supabase } = await import('./db/supabase.js')
      const { error } = await supabase.from('tenants').select('id').limit(1)
      res.json({ ok: true, ts: Date.now(), supabase: error ? `ERRO: ${error.message}` : 'conectado' })
    } catch (e) {
      res.json({ ok: true, ts: Date.now(), supabase: `ERRO: ${e.message}` })
    }
  })

  app.use('/api/auth', authRouter)
  app.use('/api/leads', leadsRouter)
  app.use('/api/appointments', appointmentsRouter)
  app.use('/api/integrations', integrationsRouter)
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
  app.use('/api/notifications', notificationsRouter)
  app.use('/webhooks', webhooksRouter)

  // 404
  app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }))

  // handler de erro
  app.use((err, req, res, _next) => {
    console.error('[erro]', err.message)
    res.status(500).json({ error: 'Erro interno do servidor.' })
  })

  return app
}
