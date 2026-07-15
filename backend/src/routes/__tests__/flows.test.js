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

const { flowsRouter } = await import('../flows.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/flows', flowsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql)) }

describe('routes/flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    setRls()
  })

  it('GET / lista os fluxos do tenant', async () => {
    rlsMock.queueRows([{ id: 'f1', name: 'Boas-vindas' }])
    const app = buildApp()
    const res = await request(app).get('/api/flows')
    expect(res.body.flows).toHaveLength(1)
  })

  it('GET /:id retorna 404 quando não encontrado', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).get('/api/flows/f-x')
    expect(res.status).toBe(404)
  })

  it('POST / exige nome', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/flows').send({})
    expect(res.status).toBe(400)
  })

  it('POST / cria o fluxo com nós padrão e timeout default de 30min', async () => {
    rlsMock.queueRows([{ id: 'f1', name: 'Boas-vindas' }])
    const app = buildApp()
    const res = await request(app).post('/api/flows').send({ name: 'Boas-vindas' })
    expect(res.status).toBe(201)
    const insert = insertCallsMatching(/INSERT INTO flows/)[0]
    expect(insert.params[4]).toBe(30)
    expect(JSON.parse(insert.params[6])).toHaveLength(2)
  })

  it('POST / rejeita timeout_minutes inválido (não numérico/negativo)', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/flows').send({ name: 'X', timeout_minutes: -5 })
    expect(res.status).toBe(400)
  })

  it('POST / rejeita trigger_keywords que não seja array de strings', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/flows').send({ name: 'X', trigger_keywords: 'oi' })
    expect(res.status).toBe(400)
  })

  it('PATCH /:id rejeita status fora do enum permitido', async () => {
    const app = buildApp()
    const res = await request(app).patch('/api/flows/f1').send({ status: 'archived' })
    expect(res.status).toBe(400)
  })

  it('PATCH /:id retorna 404 quando o fluxo não existe', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).patch('/api/flows/f-x').send({ status: 'active' })
    expect(res.status).toBe(404)
  })

  it('PATCH /:id atualiza apenas os campos enviados', async () => {
    rlsMock.queueRows([{ id: 'f1', status: 'active' }])
    const app = buildApp()
    const res = await request(app).patch('/api/flows/f1').send({ status: 'active' })
    expect(res.status).toBe(200)
    expect(res.body.flow.status).toBe('active')
  })

  it('DELETE /:id remove o fluxo', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).delete('/api/flows/f1')
    expect(res.status).toBe(200)
  })

  it('GET /:id/sessions lista sessões ativas do fluxo', async () => {
    rlsMock.queueRows([{ id: 's1', lead_id: 'lead-1', status: 'active' }])
    const app = buildApp()
    const res = await request(app).get('/api/flows/f1/sessions')
    expect(res.body.sessions).toHaveLength(1)
  })
})
