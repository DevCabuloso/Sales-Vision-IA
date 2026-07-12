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

const { labelsRouter } = await import('../labels.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/labels', labelsRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }

describe('routes/labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
  })

  it('GET / lista as etiquetas do tenant', async () => {
    setSupabase({ labels: [{ data: [{ id: 'l1', name: 'VIP', color: '#FF0000' }], error: null }] })
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
    setSupabase({ labels: [{ data: { id: 'l1', name: 'VIP', color: '#6366F1' }, error: null }] })
    const app = buildApp()
    const res = await request(app).post('/api/labels').send({ name: 'VIP' })
    expect(res.status).toBe(201)
    expect(insertCallsFor('labels')[0].args[0].color).toBe('#6366F1')
  })

  it('PATCH /:id atualiza a etiqueta', async () => {
    setSupabase({ labels: [{ data: { id: 'l1', name: 'Novo nome', color: '#6366F1' }, error: null }] })
    const app = buildApp()
    const res = await request(app).patch('/api/labels/l1').send({ name: 'Novo nome' })
    expect(res.status).toBe(200)
    expect(res.body.label.name).toBe('Novo nome')
  })

  it('DELETE /:id remove a etiqueta', async () => {
    setSupabase({})
    const app = buildApp()
    const res = await request(app).delete('/api/labels/l1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ deleted: true })
  })
})
