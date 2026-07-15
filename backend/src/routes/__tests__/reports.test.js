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

const { reportsRouter } = await import('../reports.js')

function buildApp() {
  const app = express()
  app.use('/api/reports', reportsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}

describe('routes/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setRls()
  })

  it('GET /daily monta o resumo, o ranking por operador e o funil de estágios', async () => {
    rlsMock.queueRows([{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'agent' }]) // users
    rlsMock.queueRows([
      { lead_id: 'lead-1', user_id: 'u1', user_name: 'Ana', action: 'opened', to_user_id: null, to_user_name: null, created_at: '2026-01-01T10:00:00.000Z' },
      { lead_id: 'lead-1', user_id: 'u1', user_name: 'Ana', action: 'closed', to_user_id: null, to_user_name: null, created_at: '2026-01-01T12:00:00.000Z' },
    ]) // ticket_logs
    rlsMock.queueRows([{ id: 'lead-1', name: 'Lead Um', phone: '123', stage: 'Qualificado', score: 80, created_at: '2026-01-01T09:00:00.000Z' }]) // leadsToday
    rlsMock.queueRows([{ role: 'lead' }, { role: 'ai' }, { role: 'agent' }]) // messages
    rlsMock.queueRows([{ id: 'a1', lead_id: 'lead-1', lead_name: 'Lead Um', start_time: '2026-01-01T15:00:00.000Z' }]) // appointments
    rlsMock.queueRows([
      { user_id: 'u1', event_type: 'message_sent', created_at: '2026-01-01T10:30:00.000Z' },
      { user_id: 'u1', event_type: 'appointment_created', created_at: '2026-01-01T15:00:00.000Z' },
    ]) // usage_events
    rlsMock.queueRows([{ stage: 'Qualificado', count: 1 }, { stage: 'Novo Lead', count: 2 }]) // leads_stage_counts
    rlsMock.queueRows([{ id: 'lead-1', name: 'Lead Um', phone: '123', stage: 'Qualificado' }]) // touchedLeads

    const app = buildApp()
    const res = await request(app).get('/api/reports/daily').query({ date: '2026-01-01' })

    expect(res.status).toBe(200)
    expect(res.body.summary).toMatchObject({
      newLeads: 1, qualifiedNewLeads: 1,
      conversationsOpened: 1, conversationsResolved: 1, conversationsTransferred: 0,
      appointmentsScheduled: 1,
      messages: { total: 3, fromLeads: 1, fromAI: 1, fromAgents: 1 },
    })

    expect(res.body.byUser).toHaveLength(1)
    expect(res.body.byUser[0]).toMatchObject({
      name: 'Ana', conversationsResolved: 1, messagesSent: 1, appointmentsCreated: 1, leadsCreated: 0,
    })
    expect(res.body.byUser[0].leadsAttended).toHaveLength(1)

    expect(res.body.funnel).toEqual([{ stage: 'Novo Lead', count: 2 }, { stage: 'Qualificado', count: 1 }])
    expect(res.body.date).toBe('2026-01-01')

    // funil de estágios é calculado no banco (GROUP BY via RPC), não buscando
    // todas as linhas de `leads` e agregando em JS
    const rpcCall = rlsMock.calls.find((c) => /leads_stage_counts/.test(c.sql))
    expect(rpcCall.params).toEqual(['tenant-1'])
  })

  it('ignora datas em formato inválido e usa a data de hoje', async () => {
    rlsMock.queueRows([]) // users
    rlsMock.queueRows([]) // ticket_logs
    rlsMock.queueRows([]) // leadsToday
    rlsMock.queueRows([]) // messages
    rlsMock.queueRows([]) // appointments
    rlsMock.queueRows([]) // usage_events
    rlsMock.queueRows([]) // leads_stage_counts
    const app = buildApp()
    const res = await request(app).get('/api/reports/daily').query({ date: 'não-é-data' })
    expect(res.status).toBe(200)
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('retorna estrutura vazia quando não há nenhum dado no dia', async () => {
    rlsMock.queueRows([])
    rlsMock.queueRows([])
    rlsMock.queueRows([])
    rlsMock.queueRows([])
    rlsMock.queueRows([])
    rlsMock.queueRows([])
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).get('/api/reports/daily').query({ date: '2026-01-01' })
    expect(res.body.summary.newLeads).toBe(0)
    expect(res.body.byUser).toEqual([])
    expect(res.body.funnel).toEqual([])
  })
})
