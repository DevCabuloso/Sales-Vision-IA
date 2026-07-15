import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, analyzeLead: null, logUsage: null, permCalls: [] }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
  requirePermission: (...keys) => { mockState.permCalls.push(keys); return (req, res, next) => next() },
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
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

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql)) }
const flush = () => new Promise((r) => setTimeout(r, 10))

describe('routes/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.analyzeLead = vi.fn()
    mockState.logUsage = vi.fn().mockResolvedValue(undefined)
    setRls()
  })

  it('exige a permissão "leads" ou "kanban" (enforcement de operador restrito) em toda a rota', () => {
    expect(mockState.permCalls).toContainEqual(['leads', 'kanban'])
  })

  describe('GET /', () => {
    it('lista os leads do tenant com limit/offset', async () => {
      rlsMock.queueRows([{ id: 'l1', name: 'Ana' }])
      const app = buildApp()
      const res = await request(app).get('/api/leads').query({ limit: 10, offset: 0 })
      expect(res.body.leads).toHaveLength(1)
      expect(res.body.limit).toBe(10)
    })

    it('limita o "limit" em no máximo 1000', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/leads').query({ limit: 5000 })
      expect(res.body.limit).toBe(1000)
    })

    it('inclui crm_stage_id na seleção (funil do Pipeline CRM)', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      await request(app).get('/api/leads')
      const call = rlsMock.calls.find((c) => /FROM leads WHERE tenant_id/.test(c.sql))
      expect(call.sql).toContain('crm_stage_id')
    })
  })

  describe('POST /', () => {
    it('rejeita telefone muito curto, com o formato de erro padrão ({ error: mensagem })', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/leads').send({ phone: '123' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String) })
      expect(res.body.details).toBeUndefined()
    })

    it('retorna 403 quando o limite de leads do plano foi atingido', async () => {
      rlsMock.queueRows([{ count: 1000 }])
      rlsMock.queueRows([{ max_leads: 1000 }])
      const app = buildApp()
      const res = await request(app).post('/api/leads').send({ phone: '11988887777' })
      expect(res.status).toBe(403)
    })

    it('cria o lead e registra o uso quando dentro do limite', async () => {
      rlsMock.queueRows([{ count: 3 }])
      rlsMock.queueRows([{ max_leads: 1000 }])
      rlsMock.queueRows([{ id: 'l1', phone: '11988887777', stage: 'Novo Lead' }])
      const app = buildApp()
      const res = await request(app).post('/api/leads').send({ phone: '(11) 98888-7777' })

      expect(res.status).toBe(201)
      const insertCall = insertCallsMatching(/INSERT INTO leads/)[0]
      expect(insertCall.params[2]).toBe('11988887777')
      expect(mockState.logUsage).toHaveBeenCalledWith('tenant-1', 'user-1', 'lead_created', { phone: '(11) 98888-7777' })
    })

    it('retorna 409 quando já existe lead com o telefone (violação de unicidade)', async () => {
      rlsMock.queueRows([{ count: 0 }])
      rlsMock.queueRows([{ max_leads: 1000 }])
      rlsMock.queueError(Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }))
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
      rlsMock.queueRows([{ stage: 'Novo Lead' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/leads/l-x').send({ stage: 'Qualificado' })
      expect(res.status).toBe(404)
    })

    it('atualiza o lead e registra o histórico quando o estágio muda', async () => {
      rlsMock.queueRows([{ stage: 'Novo Lead' }])
      rlsMock.queueRows([{ id: 'l1', stage: 'Qualificado' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/leads/l1').send({ stage: 'Qualificado' })
      expect(res.status).toBe(200)
      await flush()
      const historyInsert = insertCallsMatching(/INSERT INTO lead_stage_history/)[0]
      expect(historyInsert.params).toEqual(['tenant-1', 'l1', 'Novo Lead', 'Qualificado', 'user-1'])
    })

    it('não registra histórico quando o estágio não muda', async () => {
      rlsMock.queueRows([{ stage: 'Qualificado' }])
      rlsMock.queueRows([{ id: 'l1', stage: 'Qualificado' }])
      const app = buildApp()
      await request(app).patch('/api/leads/l1').send({ score: 80 })
      await flush()
      expect(insertCallsMatching(/INSERT INTO lead_stage_history/).length).toBe(0)
    })
  })

  describe('PATCH /:id — crmStageId (funil "Pipeline CRM")', () => {
    it('atualiza crm_stage_id quando o estágio importado pertence ao tenant', async () => {
      rlsMock.queueRows([{ exists: 1 }]) // SELECT 1 FROM pipeline_stages ...
      rlsMock.queueRows([{ stage: 'Novo Lead' }]) // SELECT stage FROM leads
      rlsMock.queueRows([{ id: 'l1', crm_stage_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }]) // UPDATE ... RETURNING
      const app = buildApp()
      const res = await request(app).patch('/api/leads/l1').send({ crmStageId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
      expect(res.status).toBe(200)
      const updateCall = rlsMock.calls.find((c) => /^UPDATE leads SET/.test(c.sql))
      expect(updateCall.sql).toContain('crm_stage_id = $1')
      const stageCheck = rlsMock.calls.find((c) => /FROM pipeline_stages/.test(c.sql))
      expect(stageCheck.params).toEqual(['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tenant-1'])
    })

    it('rejeita com 400 quando o crmStageId não pertence ao tenant (ou não existe) — não deixa mesclar dados entre tenants', async () => {
      rlsMock.queueRows([]) // SELECT 1 FROM pipeline_stages -> nada encontrado
      const app = buildApp()
      const res = await request(app).patch('/api/leads/l1').send({ crmStageId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/inválido/)
    })

    it('rejeita crmStageId que não é um UUID válido', async () => {
      const app = buildApp()
      const res = await request(app).patch('/api/leads/l1').send({ crmStageId: 'não-é-um-uuid' })
      expect(res.status).toBe(400)
    })
  })

  it('DELETE /:id remove o lead', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).delete('/api/leads/l1')
    expect(res.status).toBe(200)
  })

  it('GET /:id/history retorna o histórico de estágio', async () => {
    rlsMock.queueRows([{ from_stage: 'Novo Lead', to_stage: 'Qualificado' }])
    const app = buildApp()
    const res = await request(app).get('/api/leads/l1/history')
    expect(res.body.history).toHaveLength(1)
  })

  it('GET /:id/messages retorna as mensagens do lead', async () => {
    rlsMock.queueRows([{ role: 'lead', text: 'oi' }])
    const app = buildApp()
    const res = await request(app).get('/api/leads/l1/messages')
    expect(res.body.messages).toHaveLength(1)
  })

  it('GET /:id/messages busca desc+limit e devolve em ordem cronológica (proteção contra query sem limite)', async () => {
    rlsMock.queueRows([{ role: 'ai', text: 'segunda' }, { role: 'lead', text: 'primeira' }])
    const app = buildApp()
    const res = await request(app).get('/api/leads/l1/messages')
    expect(res.body.messages).toEqual([{ role: 'lead', text: 'primeira' }, { role: 'ai', text: 'segunda' }])
    const call = rlsMock.calls.find((c) => /FROM messages/.test(c.sql))
    expect(call.sql).toMatch(/ORDER BY created_at DESC/)
    expect(call.params[2]).toBe(500)
  })

  it('GET /:id/messages respeita ?limit= dentro do teto de 500', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    await request(app).get('/api/leads/l1/messages').query({ limit: 10000 })
    const call = rlsMock.calls.find((c) => /FROM messages/.test(c.sql))
    expect(call.params[2]).toBe(500)
  })

  describe('POST /:id/analyze', () => {
    it('retorna 404 quando o lead não existe', async () => {
      rlsMock.queueRows([])
      mockState.analyzeLead.mockResolvedValue({ score: 50, intention: 'x', stage: 'Em Qualificação', interests: [] })
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/leads/l-x/analyze')
      expect(res.status).toBe(404)
    })

    it('atualiza o lead com a análise da IA', async () => {
      rlsMock.queueRows([{ role: 'lead', text: 'quero comprar' }])
      mockState.analyzeLead.mockResolvedValue({ score: 90, intention: 'Quer comprar', stage: 'Qualificado', interests: ['plano-pro'] })
      rlsMock.queueRows([{ id: 'l1', score: 90, stage: 'Qualificado' }])
      const app = buildApp()
      const res = await request(app).post('/api/leads/l1/analyze')
      expect(res.status).toBe(200)
      expect(res.body.analysis.score).toBe(90)
    })

    it('retorna 502 quando a análise de IA falha', async () => {
      rlsMock.queueRows([])
      mockState.analyzeLead.mockRejectedValue(new Error('OpenAI erro 500'))
      const app = buildApp()
      const res = await request(app).post('/api/leads/l1/analyze')
      expect(res.status).toBe(502)
    })

    it('busca desc+limit e analisa em ordem cronológica (proteção contra query sem limite)', async () => {
      rlsMock.queueRows([{ role: 'ai', text: 'segunda' }, { role: 'lead', text: 'primeira' }])
      mockState.analyzeLead.mockResolvedValue({ score: 50, intention: 'x', stage: 'y', interests: [] })
      rlsMock.queueRows([{ id: 'l1', score: 50 }])
      const app = buildApp()
      await request(app).post('/api/leads/l1/analyze')

      expect(mockState.analyzeLead).toHaveBeenCalledWith([{ role: 'lead', text: 'primeira' }, { role: 'ai', text: 'segunda' }])
      const call = rlsMock.calls.find((c) => /FROM messages/.test(c.sql))
      expect(call.sql).toMatch(/ORDER BY created_at DESC/)
      expect(call.params[2]).toBe(500)
    })
  })
})
