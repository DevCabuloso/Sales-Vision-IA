import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

const { notificationsRouter } = await import('../notifications.js')

function buildApp() {
  const app = express()
  app.use('/api/notifications', notificationsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}

const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString()

describe('routes/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    setRls()
  })

  it('retorna vazio quando não há mensagens recentes', async () => {
    rlsMock.queueRows([]) // messages
    rlsMock.queueRows([]) // alerts
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body).toEqual({ notifications: [], alerts: [] })
  })

  it('inclui avisos persistidos (alerts) mesmo sem leads sem resposta', async () => {
    rlsMock.queueRows([]) // messages
    rlsMock.queueRows([{ id: 'notif-1', type: 'billing_reminder', title: 'Vencimento', message: 'Vence em 3 dias.' }]) // alerts
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.alerts).toHaveLength(1)
    expect(res.body.alerts[0]).toMatchObject({ type: 'billing_reminder', title: 'Vencimento' })
  })

  describe('PATCH /:id/read', () => {
    it('marca o aviso como lido', async () => {
      rlsMock.queueRows([{ id: 'notif-1' }])
      const app = buildApp()
      const res = await request(app).patch('/api/notifications/notif-1/read')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ read: true })
    })

    it('retorna 404 quando o aviso não existe (ou não é do usuário/tenant)', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/notifications/notif-x/read')
      expect(res.status).toBe(404)
    })
  })

  it('inclui lead cuja última mensagem é dele mesmo e já passou do tempo configurado (padrão 30min)', async () => {
    rlsMock.queueRows([{ lead_id: 'lead-1', role: 'lead', text: 'Alguém aí?', created_at: minutesAgo(40) }])
    rlsMock.queueRows([{ id: 'lead-1', name: 'Ana', phone: '5511988887777' }])
    rlsMock.queueRows([]) // alerts
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.notifications).toHaveLength(1)
    expect(res.body.notifications[0]).toMatchObject({ lead_id: 'lead-1', lead_name: 'Ana', last_message: 'Alguém aí?' })
  })

  it('não inclui lead cuja última mensagem ainda está dentro do prazo', async () => {
    rlsMock.queueRows([{ lead_id: 'lead-1', role: 'lead', text: 'oi', created_at: minutesAgo(5) }])
    rlsMock.queueRows([]) // alerts
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.notifications).toEqual([])
  })

  it('não inclui lead cuja última mensagem foi respondida (role != lead)', async () => {
    rlsMock.queueRows([
      { lead_id: 'lead-1', role: 'agent', text: 'Já te ajudo!', created_at: minutesAgo(35) },
      { lead_id: 'lead-1', role: 'lead', text: 'oi', created_at: minutesAgo(50) },
    ])
    rlsMock.queueRows([]) // alerts
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.notifications).toEqual([])
  })

  it('respeita o parâmetro "minutes" customizado', async () => {
    rlsMock.queueRows([{ lead_id: 'lead-1', role: 'lead', text: 'oi', created_at: minutesAgo(8) }])
    rlsMock.queueRows([{ id: 'lead-1', name: 'Ana', phone: '5511988887777' }])
    rlsMock.queueRows([]) // alerts
    const app = buildApp()
    const res = await request(app).get('/api/notifications').query({ minutes: 5 })
    expect(res.body.notifications).toHaveLength(1)
  })

  it('ordena por minutos decorridos em ordem decrescente', async () => {
    rlsMock.queueRows([
      { lead_id: 'lead-1', role: 'lead', text: 'primeiro', created_at: minutesAgo(35) },
      { lead_id: 'lead-2', role: 'lead', text: 'segundo', created_at: minutesAgo(90) },
    ])
    rlsMock.queueRows([{ id: 'lead-1', name: 'Ana', phone: 'x' }, { id: 'lead-2', name: 'Bia', phone: 'y' }])
    rlsMock.queueRows([]) // alerts
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.notifications.map((n) => n.lead_id)).toEqual(['lead-2', 'lead-1'])
  })

  it('usa "—" como telefone e null como nome quando o lead não é encontrado', async () => {
    rlsMock.queueRows([{ lead_id: 'lead-x', role: 'lead', text: 'oi', created_at: minutesAgo(40) }])
    rlsMock.queueRows([]) // leads
    rlsMock.queueRows([]) // alerts
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.notifications[0]).toMatchObject({ lead_name: null, lead_phone: '—' })
  })
})
