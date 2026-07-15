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

const { queuesRouter } = await import('../queues.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/queues', queuesRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^INSERT/.test(c.sql)) }
function deleteCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^DELETE/.test(c.sql)) }

describe('routes/queues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    setRls()
  })

  it('GET / retorna as filas com seus operadores', async () => {
    rlsMock.queueRows([{ id: 'q1', name: 'Suporte' }])
    rlsMock.queueRows([{ queue_id: 'q1', id: 'u1', name: 'Ana', email: 'ana@ex.com' }])
    const app = buildApp()
    const res = await request(app).get('/api/queues')
    expect(res.status).toBe(200)
    expect(res.body.queues[0].operators).toEqual([{ id: 'u1', name: 'Ana', email: 'ana@ex.com' }])
  })

  it('GET / retorna lista vazia sem consultar operadores quando não há filas', async () => {
    rlsMock.queueRows([])
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
    rlsMock.queueRows([{ id: 'u1' }, { id: 'u2' }]) // assertUsersBelongToTenant
    rlsMock.queueRows([{ id: 'q1', name: 'Suporte', color: '#6366F1' }]) // insert queues
    const app = buildApp()
    const res = await request(app).post('/api/queues').send({ name: 'Suporte', operator_ids: ['u1', 'u2'] })
    expect(res.status).toBe(201)
    const opInsert = insertCallsMatching(/INSERT INTO queue_operators/)[0]
    expect(opInsert.params).toEqual(['q1', 'u1', 'q1', 'u2'])
  })

  it('POST / rejeita operator_ids que não pertençam a este tenant (isolamento entre tenants)', async () => {
    rlsMock.queueRows([{ id: 'u1' }]) // u2 não pertence ao tenant-1
    const app = buildApp()
    const res = await request(app).post('/api/queues').send({ name: 'Suporte', operator_ids: ['u1', 'u2'] })
    expect(res.status).toBe(400)
    expect(insertCallsMatching(/INSERT INTO queues /)).toHaveLength(0)
  })

  it('PATCH /:id substitui os operadores quando operator_ids é enviado', async () => {
    rlsMock.queueRows([{ id: 'u2' }]) // assertUsersBelongToTenant
    rlsMock.queueRows([{ id: 'q1', name: 'Suporte' }]) // update queues
    rlsMock.queueRows([]) // delete queue_operators
    rlsMock.queueRows([]) // insert queue_operators
    rlsMock.queueRows([{ queue_id: 'q1', id: 'u2', name: 'Bia', email: 'bia@ex.com' }]) // fetchOperators
    const app = buildApp()
    const res = await request(app).patch('/api/queues/q1').send({ operator_ids: ['u2'] })
    expect(res.status).toBe(200)
    expect(deleteCallsMatching(/queue_operators/).length).toBe(1)
    expect(res.body.queue.operators).toEqual([{ id: 'u2', name: 'Bia', email: 'bia@ex.com' }])
  })

  it('PATCH /:id rejeita operator_ids de outro tenant sem tocar a fila', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).patch('/api/queues/q1').send({ operator_ids: ['u-de-outro-tenant'] })
    expect(res.status).toBe(400)
  })

  it('DELETE /:id remove a fila', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).delete('/api/queues/q1')
    expect(res.status).toBe(200)
  })
})
