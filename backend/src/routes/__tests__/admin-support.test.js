import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireOwner: (req, res, next) => {
    if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Acesso restrito ao dono da plataforma.' })
    next()
  },
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

const { adminSupportRouter } = await import('../admin-support.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/support', adminSupportRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }
function updateCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update') }

describe('routes/admin-support', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'owner-1', tenantId: null, role: 'owner' }
  })

  it('exige role owner em toda a rota', async () => {
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    const app = buildApp()
    const res = await request(app).get('/api/admin/support/tickets')
    expect(res.status).toBe(403)
  })

  describe('GET /tickets', () => {
    it('retorna lista vazia sem consultar tenants/users quando não há chamados', async () => {
      setSupabase({ support_tickets: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/admin/support/tickets')
      expect(res.body).toEqual({ tickets: [] })
    })

    it('lista os chamados com nome da empresa e do usuário resolvidos', async () => {
      setSupabase({
        support_tickets: [{ data: [{ id: 't1', tenant_id: 'tenant-1', user_id: 'user-1', category: 'tecnico', status: 'open' }], error: null }],
        tenants: [{ data: [{ id: 'tenant-1', name: 'Empresa X' }], error: null }],
        users: [{ data: [{ id: 'user-1', name: 'Ana', email: 'ana@ex.com' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).get('/api/admin/support/tickets')
      expect(res.status).toBe(200)
      expect(res.body.tickets[0]).toMatchObject({ tenant_name: 'Empresa X', user_name: 'Ana', user_email: 'ana@ex.com' })
    })

    it('filtra por status quando informado', async () => {
      setSupabase({ support_tickets: [{ data: [], error: null }] })
      const app = buildApp()
      await request(app).get('/api/admin/support/tickets').query({ status: 'open' })
      const eqCall = supabaseMock.calls.find((c) => c.table === 'support_tickets' && c.method === 'eq')
      expect(eqCall.args).toEqual(['status', 'open'])
    })
  })

  describe('POST /tickets/:id/start', () => {
    it('retorna 400 quando o chamado não está aberto (ou não existe)', async () => {
      setSupabase({ support_tickets: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/support/tickets/t1/start')
      expect(res.status).toBe(400)
    })

    it('marca o chamado como em andamento', async () => {
      setSupabase({ support_tickets: [{ data: [{ id: 't1', status: 'in_progress', started_by: 'owner-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/support/tickets/t1/start')
      expect(res.status).toBe(200)
      const update = updateCallsFor('support_tickets')[0]
      expect(update.args[0]).toMatchObject({ status: 'in_progress', started_by: 'owner-1' })
    })
  })

  it('GET /tickets/:id/messages lista as mensagens do chamado', async () => {
    setSupabase({ support_messages: [{ data: [{ id: 'm1', sender_type: 'user', text: 'Oi' }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/admin/support/tickets/t1/messages')
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(1)
  })

  describe('POST /tickets/:id/messages', () => {
    it('rejeita texto vazio', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/admin/support/tickets/t1/messages').send({ text: '' })
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando o chamado não existe', async () => {
      setSupabase({ support_tickets: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/support/tickets/t-x/messages').send({ text: 'Oi' })
      expect(res.status).toBe(404)
    })

    it('responde o chamado e notifica o cliente', async () => {
      setSupabase({
        support_tickets: [{ data: [{ id: 't1', tenant_id: 'tenant-1', user_id: 'user-1' }], error: null }],
        support_messages: [{ data: { id: 'm1', sender_type: 'owner', text: 'Já estou vendo isso!' }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/admin/support/tickets/t1/messages').send({ text: 'Já estou vendo isso!' })
      expect(res.status).toBe(201)

      const msgInsert = insertCallsFor('support_messages')[0]
      expect(msgInsert.args[0]).toMatchObject({ ticket_id: 't1', tenant_id: 'tenant-1', sender_type: 'owner', sender_id: 'owner-1' })

      const notifInsert = insertCallsFor('notifications')[0]
      expect(notifInsert.args[0]).toMatchObject({ tenant_id: 'tenant-1', user_id: 'user-1', type: 'support_reply', ticket_id: 't1' })
    })
  })

  describe('POST /tickets/:id/close', () => {
    it('retorna 404 quando o chamado não existe', async () => {
      setSupabase({ support_tickets: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/support/tickets/t-x/close')
      expect(res.status).toBe(404)
    })

    it('encerra o chamado', async () => {
      setSupabase({ support_tickets: [{ data: [{ id: 't1', status: 'closed' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/support/tickets/t1/close')
      expect(res.status).toBe(200)
      const update = updateCallsFor('support_tickets')[0]
      expect(update.args[0]).toMatchObject({ status: 'closed' })
    })
  })
})
