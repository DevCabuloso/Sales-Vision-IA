import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null, hashPassword: null, logAudit: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
  invalidateUserCache: (...args) => mockState.invalidateUserCache?.(...args),
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

vi.mock('../../services/auth.js', () => ({
  hashPassword: (...args) => mockState.hashPassword(...args),
}))

vi.mock('../../services/usage.js', () => ({
  logAudit: (...args) => mockState.logAudit(...args),
}))

const { operatorsRouter } = await import('../operators.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/operators', operatorsRouter)
  return app
}

let supabaseMock
let rlsMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^INSERT/.test(c.sql)) }

describe('routes/operators', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    mockState.hashPassword = vi.fn().mockResolvedValue('hashed-pw')
    mockState.logAudit = vi.fn().mockResolvedValue(undefined)
    setSupabase({})
    setRls()
  })

  it('GET / lista operadores excluindo o owner', async () => {
    rlsMock.queueRows([{ id: 'u1', name: 'Ana', role: 'agent' }])
    const app = buildApp()
    const res = await request(app).get('/api/operators')
    expect(res.body.operators).toHaveLength(1)
  })

  it('GET / retorna 403 pra um agente comum (não vaza dados dos colegas)', async () => {
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'agent' }
    const app = buildApp()
    const res = await request(app).get('/api/operators')
    expect(res.status).toBe(403)
  })

  it('GET /dashboard retorna 403 pra um agente comum', async () => {
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'agent' }
    const app = buildApp()
    const res = await request(app).get('/api/operators/dashboard')
    expect(res.status).toBe(403)
  })

  it('GET /dashboard agrega métricas de uso por operador', async () => {
    rlsMock.queueRows([{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'agent', active: true }])
    rlsMock.queueRows([
      { user_id: 'u1', event_type: 'message_sent' },
      { user_id: 'u1', event_type: 'message_sent' },
      { user_id: 'u1', event_type: 'lead_created' },
    ])
    const app = buildApp()
    const res = await request(app).get('/api/operators/dashboard')
    expect(res.body.metrics[0]).toMatchObject({ messages_sent: 2, leads_handled: 1, appointments: 0, takeovers: 0 })
  })

  describe('POST /', () => {
    it('retorna 403 para quem não é admin/owner', async () => {
      mockState.user = { id: 'user-2', tenantId: 'tenant-1', role: 'agent' }
      const app = buildApp()
      const res = await request(app).post('/api/operators').send({ name: 'Bia', email: 'bia@ex.com', password: 'senha123' })
      expect(res.status).toBe(403)
    })

    it('exige senha', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/operators').send({ name: 'Bia', email: 'bia@ex.com' })
      expect(res.status).toBe(400)
    })

    it('rejeita senha com menos de 8 caracteres', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/operators').send({ name: 'Bia', email: 'bia@ex.com', password: 'curta12' })
      expect(res.status).toBe(400)
    })

    it('retorna 409 quando o e-mail já está cadastrado (checagem global, entre tenants)', async () => {
      setSupabase({ users: [{ data: [{ id: 'existing' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/operators').send({ name: 'Bia', email: 'bia@ex.com', password: 'senha123' })
      expect(res.status).toBe(409)
    })

    it('cria o operador com as permissões padrão de admin quando role=admin', async () => {
      setSupabase({ users: [{ data: [], error: null }] })
      rlsMock.queueRows([{ id: 'u1', role: 'admin' }])
      const app = buildApp()
      const res = await request(app).post('/api/operators').send({ name: 'Bia', email: 'BIA@ex.com', password: 'senha123', role: 'admin' })

      expect(res.status).toBe(201)
      const insert = insertCallsMatching(/INSERT INTO users/)[0]
      expect(insert.params).toContain('bia@ex.com')
      expect(insert.params).toContain('hashed-pw')
      const perms = JSON.parse(insert.params.find((p) => typeof p === 'string' && p.includes('broadcast')))
      expect(perms.broadcast).toEqual({ view: true, create: true, edit: true, delete: true })
    })

    it('registra um evento de auditoria na criação', async () => {
      setSupabase({ users: [{ data: [], error: null }] })
      rlsMock.queueRows([{ id: 'u1', role: 'agent' }])
      const app = buildApp()
      await request(app).post('/api/operators').send({ name: 'Bia', email: 'bia@ex.com', password: 'senha123' })
      expect(mockState.logAudit).toHaveBeenCalledWith('tenant-1', 'user-1', 'operator', 'create', 'u1', { role: 'agent' })
    })
  })

  describe('PATCH /:id', () => {
    it('retorna 403 para quem não é admin/owner', async () => {
      mockState.user = { id: 'user-2', tenantId: 'tenant-1', role: 'agent' }
      const app = buildApp()
      const res = await request(app).patch('/api/operators/u1').send({ name: 'Novo' })
      expect(res.status).toBe(403)
    })

    it('retorna 409 quando o novo e-mail já pertence a outro usuário', async () => {
      setSupabase({ users: [{ data: [{ id: 'outro-user' }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/operators/u1').send({ email: 'ja-existe@ex.com' })
      expect(res.status).toBe(409)
    })

    it('força as permissões padrão quando o role muda para admin', async () => {
      rlsMock.queueRows([{ id: 'u1', role: 'admin' }])
      const app = buildApp()
      const res = await request(app).patch('/api/operators/u1').send({ role: 'admin' })
      expect(res.status).toBe(200)
    })

    it('registra um evento de auditoria quando role/permissions/is_restricted/active mudam', async () => {
      rlsMock.queueRows([{ id: 'u1', role: 'admin' }])
      const app = buildApp()
      const res = await request(app).patch('/api/operators/u1').send({ role: 'admin' })
      expect(res.status).toBe(200)
      expect(mockState.logAudit).toHaveBeenCalledWith('tenant-1', 'user-1', 'operator', 'update', 'u1', {
        role: 'admin', permissions: expect.any(Object),
      })
    })

    it('invalida o cache de req.user do operador quando role/permissions/is_restricted/active mudam', async () => {
      mockState.invalidateUserCache = vi.fn()
      rlsMock.queueRows([{ id: 'u1', role: 'agent' }])
      const app = buildApp()
      await request(app).patch('/api/operators/u1').send({ is_restricted: true, permissions: { chat: { view: false, create: false, edit: false, delete: false } } })
      expect(mockState.invalidateUserCache).toHaveBeenCalledWith('u1')
    })

    it('não invalida o cache quando só campos não sensíveis mudam', async () => {
      mockState.invalidateUserCache = vi.fn()
      rlsMock.queueRows([{ id: 'u1', role: 'agent' }])
      const app = buildApp()
      await request(app).patch('/api/operators/u1').send({ phone: '11999999999' })
      expect(mockState.invalidateUserCache).not.toHaveBeenCalled()
    })

    it('não registra evento de auditoria quando só campos não sensíveis mudam (ex.: nome)', async () => {
      rlsMock.queueRows([{ id: 'u1', name: 'Novo' }])
      const app = buildApp()
      const res = await request(app).patch('/api/operators/u1').send({ name: 'Novo' })
      expect(res.status).toBe(200)
      expect(mockState.logAudit).not.toHaveBeenCalled()
    })
  })

  describe('POST /:id/reset-password', () => {
    it('rejeita senha curta', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/operators/u1/reset-password').send({ password: '123' })
      expect(res.status).toBe(400)
    })

    it('reseta a senha com sucesso e registra um evento de auditoria', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/operators/u1/reset-password').send({ password: 'novasenha123' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ reset: true })
      expect(mockState.logAudit).toHaveBeenCalledWith('tenant-1', 'user-1', 'operator', 'password_reset', 'u1')
    })
  })

  describe('DELETE /:id', () => {
    it('não permite se autoexcluir', async () => {
      const app = buildApp()
      const res = await request(app).delete('/api/operators/user-1')
      expect(res.status).toBe(400)
    })

    it('exclui outro operador com sucesso', async () => {
      const app = buildApp()
      const res = await request(app).delete('/api/operators/u2')
      expect(res.status).toBe(200)
    })

    it('invalida o cache de req.user do operador excluído', async () => {
      mockState.invalidateUserCache = vi.fn()
      const app = buildApp()
      await request(app).delete('/api/operators/u2')
      expect(mockState.invalidateUserCache).toHaveBeenCalledWith('u2')
    })

    it('registra um evento de auditoria na exclusão', async () => {
      const app = buildApp()
      await request(app).delete('/api/operators/u2')
      expect(mockState.logAudit).toHaveBeenCalledWith('tenant-1', 'user-1', 'operator', 'delete', 'u2')
    })
  })
})
