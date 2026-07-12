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

const { flowsRouter } = await import('../flows.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/flows', flowsRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }

describe('routes/flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
  })

  it('GET / lista os fluxos do tenant', async () => {
    setSupabase({ flows: [{ data: [{ id: 'f1', name: 'Boas-vindas' }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/flows')
    expect(res.body.flows).toHaveLength(1)
  })

  it('GET /:id retorna 404 quando não encontrado', async () => {
    setSupabase({ flows: [{ data: [], error: null }] })
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
    setSupabase({ flows: [{ data: [{ id: 'f1', name: 'Boas-vindas' }], error: null }] })
    const app = buildApp()
    const res = await request(app).post('/api/flows').send({ name: 'Boas-vindas' })
    expect(res.status).toBe(201)
    const insert = insertCallsFor('flows')[0]
    expect(insert.args[0].timeout_minutes).toBe(30)
    expect(insert.args[0].nodes).toHaveLength(2)
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
    setSupabase({ flows: [{ data: [], error: null }] })
    const app = buildApp()
    const res = await request(app).patch('/api/flows/f-x').send({ status: 'active' })
    expect(res.status).toBe(404)
  })

  it('PATCH /:id atualiza apenas os campos enviados', async () => {
    setSupabase({ flows: [{ data: [{ id: 'f1', status: 'active' }], error: null }] })
    const app = buildApp()
    const res = await request(app).patch('/api/flows/f1').send({ status: 'active' })
    expect(res.status).toBe(200)
    expect(res.body.flow.status).toBe('active')
  })

  it('DELETE /:id remove o fluxo', async () => {
    setSupabase({})
    const app = buildApp()
    const res = await request(app).delete('/api/flows/f1')
    expect(res.status).toBe(200)
  })

  it('GET /:id/sessions lista sessões ativas do fluxo', async () => {
    setSupabase({ flow_sessions: [{ data: [{ id: 's1', lead_id: 'lead-1', status: 'active' }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/flows/f1/sessions')
    expect(res.body.sessions).toHaveLength(1)
  })
})
