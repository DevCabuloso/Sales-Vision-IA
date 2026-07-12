import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, analyzeLead: null, logUsage: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../../services/ai/analyze.js', () => ({
  analyzeLead: (...args) => mockState.analyzeLead(...args),
}))

vi.mock('../../services/usage.js', () => ({
  logUsage: (...args) => mockState.logUsage(...args),
}))

const { leadsRouter } = await import('../leads.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/leads', leadsRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }
const flush = () => new Promise((r) => setTimeout(r, 10))

describe('routes/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.analyzeLead = vi.fn()
    mockState.logUsage = vi.fn().mockResolvedValue(undefined)
  })

  describe('GET /', () => {
    it('lista os leads do tenant com limit/offset', async () => {
      setSupabase({ leads: [{ data: [{ id: 'l1', name: 'Ana' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/leads').query({ limit: 10, offset: 0 })
      expect(res.body.leads).toHaveLength(1)
      expect(res.body.limit).toBe(10)
    })

    it('limita o "limit" em no máximo 1000', async () => {
      setSupabase({ leads: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/leads').query({ limit: 5000 })
      expect(res.body.limit).toBe(1000)
    })
  })

  describe('POST /', () => {
    it('rejeita telefone muito curto', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/leads').send({ phone: '123' })
      expect(res.status).toBe(400)
    })

    it('retorna 403 quando o limite de leads do plano foi atingido', async () => {
      setSupabase({
        leads: [{ data: null, error: null, count: 1000 }],
        tenants: [{ data: [{ max_leads: 1000 }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/leads').send({ phone: '11988887777' })
      expect(res.status).toBe(403)
    })

    it('cria o lead e registra o uso quando dentro do limite', async () => {
      setSupabase({
        leads: [
          { data: null, error: null, count: 3 },
          { data: { id: 'l1', phone: '11988887777', stage: 'Novo Lead' }, error: null },
        ],
        tenants: [{ data: [{ max_leads: 1000 }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/leads').send({ phone: '(11) 98888-7777' })

      expect(res.status).toBe(201)
      expect(insertCallsFor('leads')[0].args[0].phone).toBe('11988887777')
      expect(mockState.logUsage).toHaveBeenCalledWith('tenant-1', 'user-1', 'lead_created', { phone: '(11) 98888-7777' })
    })

    it('retorna 409 quando já existe lead com o telefone (violação de unicidade)', async () => {
      setSupabase({
        leads: [{ data: null, error: null, count: 0 }, { data: null, error: { message: 'duplicate', code: '23505' } }],
        tenants: [{ data: [{ max_leads: 1000 }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/leads').send({ phone: '11988887777' })
      expect(res.status).toBe(409)
    })
  })

  describe('PATCH /:id', () => {
    it('rejeita corpo vazio', async () => {
      const app = buildApp()
      const res = await request(app).patch('/api/leads/l1').send({})
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando o lead não existe', async () => {
      setSupabase({ leads: [{ data: [{ stage: 'Novo Lead' }], error: null }, { data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/leads/l-x').send({ stage: 'Qualificado' })
      expect(res.status).toBe(404)
    })

    it('atualiza o lead e registra o histórico quando o estágio muda', async () => {
      setSupabase({
        leads: [{ data: [{ stage: 'Novo Lead' }], error: null }, { data: [{ id: 'l1', stage: 'Qualificado' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).patch('/api/leads/l1').send({ stage: 'Qualificado' })
      expect(res.status).toBe(200)
      await flush()
      const historyInsert = insertCallsFor('lead_stage_history')[0]
      expect(historyInsert.args[0]).toMatchObject({ from_stage: 'Novo Lead', to_stage: 'Qualificado' })
    })

    it('não registra histórico quando o estágio não muda', async () => {
      setSupabase({
        leads: [{ data: [{ stage: 'Qualificado' }], error: null }, { data: [{ id: 'l1', stage: 'Qualificado' }], error: null }],
      })
      const app = buildApp()
      await request(app).patch('/api/leads/l1').send({ score: 80 })
      await flush()
      expect(insertCallsFor('lead_stage_history').length).toBe(0)
    })
  })

  it('DELETE /:id remove o lead', async () => {
    setSupabase({})
    const app = buildApp()
    const res = await request(app).delete('/api/leads/l1')
    expect(res.status).toBe(200)
  })

  it('GET /:id/history retorna o histórico de estágio', async () => {
    setSupabase({ lead_stage_history: [{ data: [{ from_stage: 'Novo Lead', to_stage: 'Qualificado' }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/leads/l1/history')
    expect(res.body.history).toHaveLength(1)
  })

  it('GET /:id/messages retorna as mensagens do lead', async () => {
    setSupabase({ messages: [{ data: [{ role: 'lead', text: 'oi' }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/leads/l1/messages')
    expect(res.body.messages).toHaveLength(1)
  })

  describe('POST /:id/analyze', () => {
    it('retorna 404 quando o lead não existe', async () => {
      setSupabase({ messages: [{ data: [], error: null }], leads: [{ data: [], error: null }] })
      mockState.analyzeLead.mockResolvedValue({ score: 50, intention: 'x', stage: 'Em Qualificação', interests: [] })
      const app = buildApp()
      const res = await request(app).post('/api/leads/l-x/analyze')
      expect(res.status).toBe(404)
    })

    it('atualiza o lead com a análise da IA', async () => {
      setSupabase({
        messages: [{ data: [{ role: 'lead', text: 'quero comprar' }], error: null }],
        leads: [{ data: [{ id: 'l1', score: 90, stage: 'Qualificado' }], error: null }],
      })
      mockState.analyzeLead.mockResolvedValue({ score: 90, intention: 'Quer comprar', stage: 'Qualificado', interests: ['plano-pro'] })
      const app = buildApp()
      const res = await request(app).post('/api/leads/l1/analyze')
      expect(res.status).toBe(200)
      expect(res.body.analysis.score).toBe(90)
    })

    it('retorna 502 quando a análise de IA falha', async () => {
      setSupabase({ messages: [{ data: [], error: null }] })
      mockState.analyzeLead.mockRejectedValue(new Error('OpenAI erro 500'))
      const app = buildApp()
      const res = await request(app).post('/api/leads/l1/analyze')
      expect(res.status).toBe(502)
    })
  })
})
