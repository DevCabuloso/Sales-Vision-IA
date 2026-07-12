import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null, invalidateTenantCache: null }))

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

vi.mock('../../services/orchestrator.js', () => ({
  invalidateTenantCache: (...args) => mockState.invalidateTenantCache(...args),
}))

const { opSettingsRouter } = await import('../op-settings.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/op-settings', opSettingsRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function updateCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update') }

describe('routes/op-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    mockState.invalidateTenantCache = vi.fn()
  })

  it('GET / retorna os defaults quando o tenant não tem op_settings salvos', async () => {
    setSupabase({ tenants: [{ data: [{ op_settings: null }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/op-settings')
    expect(res.status).toBe(200)
    expect(res.body.settings.ignore_group_messages).toBe(true)
    expect(res.body.settings.show_unassigned_tickets).toBe(true)
  })

  it('GET / mescla os valores salvos por cima dos defaults', async () => {
    setSupabase({ tenants: [{ data: [{ op_settings: { ignore_group_messages: false, allow_pause: false } }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/op-settings')
    expect(res.body.settings.ignore_group_messages).toBe(false)
    expect(res.body.settings.allow_pause).toBe(false)
    expect(res.body.settings.show_unassigned_tickets).toBe(true) // default preservado
  })

  it('GET / retorna defaults sem quebrar quando a consulta falha', async () => {
    setSupabase({ tenants: [{ data: null, error: { message: 'coluna não existe' } }] })
    const app = buildApp()
    const res = await request(app).get('/api/op-settings')
    expect(res.status).toBe(200)
    expect(res.body.settings.ignore_group_messages).toBe(true)
  })

  it('PUT / salva apenas as chaves reconhecidas e invalida o cache do tenant', async () => {
    setSupabase({ tenants: [{ data: {}, error: null }] })
    const app = buildApp()
    const res = await request(app).put('/api/op-settings').send({ ignore_group_messages: false, chave_desconhecida: 'x' })

    expect(res.status).toBe(200)
    const update = updateCallsFor('tenants')[0]
    expect(update.args[0].op_settings).toEqual({ ignore_group_messages: false })
    expect(mockState.invalidateTenantCache).toHaveBeenCalledWith('tenant-1')
    expect(res.body.settings.ignore_group_messages).toBe(false)
  })

  it('PUT / rejeita valor não-booleano para uma chave booleana', async () => {
    const app = buildApp()
    const res = await request(app).put('/api/op-settings').send({ ignore_group_messages: 'sim' })
    expect(res.status).toBe(400)
  })

  it('PUT / rejeita valor não-numérico para uma chave numérica', async () => {
    const app = buildApp()
    const res = await request(app).put('/api/op-settings').send({ auto_close_minutes: 'trinta' })
    expect(res.status).toBe(400)
  })

  it('PUT / aceita e salva chaves numéricas e de texto válidas', async () => {
    setSupabase({ tenants: [{ data: {}, error: null }] })
    const app = buildApp()
    const res = await request(app).put('/api/op-settings').send({ auto_close_minutes: 45, call_message_text: 'Sem chamadas.' })
    expect(res.status).toBe(200)
    const update = updateCallsFor('tenants')[0]
    expect(update.args[0].op_settings).toEqual({ auto_close_minutes: 45, call_message_text: 'Sem chamadas.' })
  })
})
