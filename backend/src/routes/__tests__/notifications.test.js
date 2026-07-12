import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

const { notificationsRouter } = await import('../notifications.js')

function buildApp() {
  const app = express()
  app.use('/api/notifications', notificationsRouter)
  return app
}

function setSupabase(responses) {
  const mock = createSupabaseMock(responses)
  mockState.box.supabase = mock.supabase
  return mock
}

const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString()

describe('routes/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
  })

  it('retorna vazio quando não há mensagens recentes', async () => {
    setSupabase({ messages: [{ data: [], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body).toEqual({ notifications: [] })
  })

  it('inclui lead cuja última mensagem é dele mesmo e já passou do tempo configurado (padrão 30min)', async () => {
    setSupabase({
      messages: [{ data: [{ lead_id: 'lead-1', role: 'lead', text: 'Alguém aí?', created_at: minutesAgo(40) }], error: null }],
      leads: [{ data: [{ id: 'lead-1', name: 'Ana', phone: '5511988887777' }], error: null }],
    })
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.notifications).toHaveLength(1)
    expect(res.body.notifications[0]).toMatchObject({ lead_id: 'lead-1', lead_name: 'Ana', last_message: 'Alguém aí?' })
  })

  it('não inclui lead cuja última mensagem ainda está dentro do prazo', async () => {
    setSupabase({ messages: [{ data: [{ lead_id: 'lead-1', role: 'lead', text: 'oi', created_at: minutesAgo(5) }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.notifications).toEqual([])
  })

  it('não inclui lead cuja última mensagem foi respondida (role != lead)', async () => {
    setSupabase({
      messages: [{
        data: [
          { lead_id: 'lead-1', role: 'agent', text: 'Já te ajudo!', created_at: minutesAgo(35) },
          { lead_id: 'lead-1', role: 'lead', text: 'oi', created_at: minutesAgo(50) },
        ], error: null,
      }],
    })
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.notifications).toEqual([])
  })

  it('respeita o parâmetro "minutes" customizado', async () => {
    setSupabase({
      messages: [{ data: [{ lead_id: 'lead-1', role: 'lead', text: 'oi', created_at: minutesAgo(8) }], error: null }],
      leads: [{ data: [{ id: 'lead-1', name: 'Ana', phone: '5511988887777' }], error: null }],
    })
    const app = buildApp()
    const res = await request(app).get('/api/notifications').query({ minutes: 5 })
    expect(res.body.notifications).toHaveLength(1)
  })

  it('ordena por minutos decorridos em ordem decrescente', async () => {
    setSupabase({
      messages: [{
        data: [
          { lead_id: 'lead-1', role: 'lead', text: 'primeiro', created_at: minutesAgo(35) },
          { lead_id: 'lead-2', role: 'lead', text: 'segundo', created_at: minutesAgo(90) },
        ], error: null,
      }],
      leads: [{ data: [{ id: 'lead-1', name: 'Ana', phone: 'x' }, { id: 'lead-2', name: 'Bia', phone: 'y' }], error: null }],
    })
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.notifications.map((n) => n.lead_id)).toEqual(['lead-2', 'lead-1'])
  })

  it('usa "—" como telefone e null como nome quando o lead não é encontrado', async () => {
    setSupabase({
      messages: [{ data: [{ lead_id: 'lead-x', role: 'lead', text: 'oi', created_at: minutesAgo(40) }], error: null }],
      leads: [{ data: [], error: null }],
    })
    const app = buildApp()
    const res = await request(app).get('/api/notifications')
    expect(res.body.notifications[0]).toMatchObject({ lead_name: null, lead_phone: '—' })
  })
})
