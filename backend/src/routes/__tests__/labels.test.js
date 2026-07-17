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

vi.mock('../../services/usage.js', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

const { labelsRouter } = await import('../labels.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/labels', labelsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql)) }

describe('routes/labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    setRls()
  })

  it('GET / lista as etiquetas do tenant', async () => {
    rlsMock.queueRows([{ id: 'l1', name: 'VIP', color: '#FF0000' }])
    const app = buildApp()
    const res = await request(app).get('/api/labels')
    expect(res.status).toBe(200)
    expect(res.body.labels).toHaveLength(1)
  })

  it('POST / rejeita cor em formato inválido', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/labels').send({ name: 'VIP', color: 'vermelho' })
    expect(res.status).toBe(400)
  })

  it('POST / usa a cor padrão quando não informada', async () => {
    rlsMock.queueRows([{ id: 'l1', name: 'VIP', color: '#6366F1' }])
    const app = buildApp()
    const res = await request(app).post('/api/labels').send({ name: 'VIP' })
    expect(res.status).toBe(201)
    const insertCall = insertCallsMatching(/INSERT INTO labels/)[0]
    expect(insertCall.params[2]).toBe('#6366F1')
  })

  it('PATCH /:id atualiza a etiqueta', async () => {
    rlsMock.queueRows([{ id: 'l1', name: 'Novo nome', color: '#6366F1' }])
    const app = buildApp()
    const res = await request(app).patch('/api/labels/l1').send({ name: 'Novo nome' })
    expect(res.status).toBe(200)
    expect(res.body.label.name).toBe('Novo nome')
  })

  it('DELETE /:id remove a etiqueta', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).delete('/api/labels/l1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ deleted: true })
  })
})
