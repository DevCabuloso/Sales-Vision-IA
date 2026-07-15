import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {} }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

const { pipelineStagesRouter } = await import('../pipelineStages.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/pipeline-stages', pipelineStagesRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}

describe('routes/pipelineStages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setRls()
  })

  it('GET / lista os estágios importados, ordenados por position', async () => {
    rlsMock.queueRows([
      { id: 's1', external_id: '1', name: 'Novo', position: 0, probability: 10, pipeline_external_id: null, pipeline_name: null },
      { id: 's2', external_id: '2', name: 'Fechado', position: 1, probability: 100, pipeline_external_id: null, pipeline_name: null },
    ])
    const app = buildApp()
    const res = await request(app).get('/api/pipeline-stages')
    expect(res.status).toBe(200)
    expect(res.body.stages).toHaveLength(2)
    const call = rlsMock.calls[0]
    expect(call.sql).toMatch(/ORDER BY position, name/)
    expect(call.params).toEqual(['tenant-1'])
  })

  it('GET / retorna lista vazia quando nada foi importado ainda', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).get('/api/pipeline-stages')
    expect(res.body.stages).toEqual([])
  })

  it('GET / retorna 500 quando a query falha', async () => {
    rlsMock.queueError(new Error('erro de conexão'))
    const app = buildApp()
    const res = await request(app).get('/api/pipeline-stages')
    expect(res.status).toBe(500)
  })
})
