import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {} }))

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

const { reportsRouter } = await import('../reports.js')

function buildApp() {
  const app = express()
  app.use('/api/reports', reportsRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

describe('routes/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET /daily monta o resumo, o ranking por operador e o funil de estágios', async () => {
    setSupabase({
      users: [{ data: [{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'agent' }], error: null }],
      ticket_logs: [{
        data: [
          { lead_id: 'lead-1', user_id: 'u1', user_name: 'Ana', action: 'opened', to_user_id: null, to_user_name: null, created_at: '2026-01-01T10:00:00.000Z' },
          { lead_id: 'lead-1', user_id: 'u1', user_name: 'Ana', action: 'closed', to_user_id: null, to_user_name: null, created_at: '2026-01-01T12:00:00.000Z' },
        ], error: null,
      }],
      leads: [
        { data: [{ id: 'lead-1', name: 'Lead Um', phone: '123', stage: 'Qualificado', score: 80, created_at: '2026-01-01T09:00:00.000Z' }], error: null },
        { data: [{ stage: 'Qualificado' }, { stage: 'Novo Lead' }, { stage: 'Novo Lead' }], error: null },
        { data: [{ id: 'lead-1', name: 'Lead Um', phone: '123', stage: 'Qualificado' }], error: null },
      ],
      messages: [{ data: [{ role: 'lead' }, { role: 'ai' }, { role: 'agent' }], error: null }],
      appointments: [{ data: [{ id: 'a1', lead_id: 'lead-1', lead_name: 'Lead Um', start_time: '2026-01-01T15:00:00.000Z' }], error: null }],
      usage_events: [{ data: [
        { user_id: 'u1', event_type: 'message_sent', created_at: '2026-01-01T10:30:00.000Z' },
        { user_id: 'u1', event_type: 'appointment_created', created_at: '2026-01-01T15:00:00.000Z' },
      ], error: null }],
    })

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

    // a query do funil (stage de todo lead do tenant) não pode ficar sem limite
    const limitCall = supabaseMock.calls.find((c) => c.table === 'leads' && c.method === 'limit')
    expect(limitCall.args[0]).toBe(20000)
  })

  it('ignora datas em formato inválido e usa a data de hoje', async () => {
    setSupabase({
      users: [{ data: [], error: null }],
      ticket_logs: [{ data: [], error: null }],
      leads: [{ data: [], error: null }, { data: [], error: null }],
      messages: [{ data: [], error: null }],
      appointments: [{ data: [], error: null }],
      usage_events: [{ data: [], error: null }],
    })
    const app = buildApp()
    const res = await request(app).get('/api/reports/daily').query({ date: 'não-é-data' })
    expect(res.status).toBe(200)
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('retorna estrutura vazia quando não há nenhum dado no dia', async () => {
    setSupabase({
      users: [{ data: [], error: null }],
      ticket_logs: [{ data: [], error: null }],
      leads: [{ data: [], error: null }, { data: [], error: null }],
      messages: [{ data: [], error: null }],
      appointments: [{ data: [], error: null }],
      usage_events: [{ data: [], error: null }],
    })
    const app = buildApp()
    const res = await request(app).get('/api/reports/daily').query({ date: '2026-01-01' })
    expect(res.body.summary.newLeads).toBe(0)
    expect(res.body.byUser).toEqual([])
    expect(res.body.funnel).toEqual([])
  })
})
