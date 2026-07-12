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

const { queuesRouter } = await import('../queues.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/queues', queuesRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }
function deleteCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'delete') }

describe('routes/queues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
  })

  it('GET / retorna as filas com seus operadores', async () => {
    setSupabase({
      queues: [{ data: [{ id: 'q1', name: 'Suporte' }], error: null }],
      queue_operators: [{ data: [{ queue_id: 'q1', users: { id: 'u1', name: 'Ana', email: 'ana@ex.com' } }], error: null }],
    })
    const app = buildApp()
    const res = await request(app).get('/api/queues')
    expect(res.status).toBe(200)
    expect(res.body.queues[0].operators).toEqual([{ id: 'u1', name: 'Ana', email: 'ana@ex.com' }])
  })

  it('GET / retorna lista vazia sem consultar operadores quando não há filas', async () => {
    setSupabase({ queues: [{ data: [], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/queues')
    expect(res.body).toEqual({ queues: [] })
  })

  it('POST / rejeita payload inválido', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/queues').send({ name: '', color: '#fff' })
    expect(res.status).toBe(400)
  })

  it('POST / cria a fila e associa os operadores informados', async () => {
    setSupabase({ queues: [{ data: { id: 'q1', name: 'Suporte', color: '#6366F1' }, error: null }] })
    const app = buildApp()
    const res = await request(app).post('/api/queues').send({ name: 'Suporte', operator_ids: ['u1', 'u2'] })
    expect(res.status).toBe(201)
    const opInsert = insertCallsFor('queue_operators')[0]
    expect(opInsert.args[0]).toEqual([{ queue_id: 'q1', user_id: 'u1' }, { queue_id: 'q1', user_id: 'u2' }])
  })

  it('PATCH /:id substitui os operadores quando operator_ids é enviado', async () => {
    setSupabase({
      queues: [{ data: { id: 'q1', name: 'Suporte' }, error: null }],
      queue_operators: [{ data: [{ users: { id: 'u2', name: 'Bia', email: 'bia@ex.com' } }], error: null }],
    })
    const app = buildApp()
    const res = await request(app).patch('/api/queues/q1').send({ operator_ids: ['u2'] })
    expect(res.status).toBe(200)
    expect(deleteCallsFor('queue_operators').length).toBe(1)
    expect(res.body.queue.operators).toEqual([{ id: 'u2', name: 'Bia', email: 'bia@ex.com' }])
  })

  it('DELETE /:id remove a fila', async () => {
    setSupabase({})
    const app = buildApp()
    const res = await request(app).delete('/api/queues/q1')
    expect(res.status).toBe(200)
  })
})
