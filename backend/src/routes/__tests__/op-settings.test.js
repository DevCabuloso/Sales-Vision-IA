import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null, invalidateTenantCache: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

vi.mock('../../services/orchestrator.js', () => ({
  invalidateTenantCache: (...args) => mockState.invalidateTenantCache(...args),
}))

vi.mock('../../services/usage.js', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

const { opSettingsRouter } = await import('../op-settings.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/op-settings', opSettingsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function updateCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql)) }

describe('routes/op-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    mockState.invalidateTenantCache = vi.fn()
    setRls()
  })

  it('GET / retorna os defaults quando o tenant não tem op_settings salvos', async () => {
    rlsMock.queueRows([{ op_settings: null }])
    const app = buildApp()
    const res = await request(app).get('/api/op-settings')
    expect(res.status).toBe(200)
    expect(res.body.settings.ignore_group_messages).toBe(true)
    expect(res.body.settings.show_unassigned_tickets).toBe(true)
  })

  it('GET / mescla os valores salvos por cima dos defaults', async () => {
    rlsMock.queueRows([{ op_settings: { ignore_group_messages: false, allow_pause: false } }])
    const app = buildApp()
    const res = await request(app).get('/api/op-settings')
    expect(res.body.settings.ignore_group_messages).toBe(false)
    expect(res.body.settings.allow_pause).toBe(false)
    expect(res.body.settings.show_unassigned_tickets).toBe(true) // default preservado
  })

  it('GET / retorna defaults sem quebrar quando a consulta falha', async () => {
    rlsMock.queueError(new Error('coluna não existe'))
    const app = buildApp()
    const res = await request(app).get('/api/op-settings')
    expect(res.status).toBe(200)
    expect(res.body.settings.ignore_group_messages).toBe(true)
  })

  it('PUT / salva apenas as chaves reconhecidas e invalida o cache do tenant', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).put('/api/op-settings').send({ ignore_group_messages: false, chave_desconhecida: 'x' })

    expect(res.status).toBe(200)
    const update = updateCallsMatching(/UPDATE tenants/)[0]
    expect(JSON.parse(update.params[0])).toEqual({ ignore_group_messages: false })
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
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).put('/api/op-settings').send({ auto_close_minutes: 45, call_message_text: 'Sem chamadas.' })
    expect(res.status).toBe(200)
    const update = updateCallsMatching(/UPDATE tenants/)[0]
    expect(JSON.parse(update.params[0])).toEqual({ auto_close_minutes: 45, call_message_text: 'Sem chamadas.' })
  })
})
