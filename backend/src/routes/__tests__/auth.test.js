import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, verifyPassword: null, hashPassword: null, signToken: null, logUsage: null, user: null }))

vi.mock('../../config/index.js', () => ({
  config: { jwt: { secret: 'test-secret', expiresIn: '1h' } },
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../../services/auth.js', () => ({
  verifyPassword: (...args) => mockState.verifyPassword(...args),
  hashPassword: (...args) => mockState.hashPassword(...args),
  signToken: (...args) => mockState.signToken(...args),
}))

vi.mock('../../services/usage.js', () => ({
  logUsage: (...args) => mockState.logUsage(...args),
}))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
}))

const { authRouter } = await import('../auth.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function updateCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update') }

const baseUser = {
  id: 'user-1', tenant_id: 'tenant-1', email: 'ana@ex.com', name: 'Ana', role: 'admin', active: true,
  password_hash: 'hash-ok', permissions: null, is_restricted: false,
}

describe('routes/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.verifyPassword = vi.fn().mockResolvedValue(true)
    mockState.hashPassword = vi.fn().mockResolvedValue('hashed-pw')
    mockState.signToken = vi.fn().mockReturnValue('jwt-token')
    mockState.logUsage = vi.fn().mockResolvedValue(undefined)
  })

  describe('POST /login', () => {
    it('rejeita payload inválido', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'invalido' })
      expect(res.status).toBe(400)
    })

    it('retorna 401 quando o usuário não existe', async () => {
      setSupabase({ users: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'senha123' })
      expect(res.status).toBe(401)
    })

    it('retorna 401 quando o usuário está inativo', async () => {
      setSupabase({ users: [{ data: [{ ...baseUser, active: false }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@ex.com', password: 'senha123' })
      expect(res.status).toBe(401)
    })

    it('retorna 402 quando o pagamento está pendente (usuário não-owner)', async () => {
      setSupabase({
        users: [{ data: [baseUser], error: null }],
        tenants: [{ data: [{ status: 'pending_payment' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@ex.com', password: 'senha123' })
      expect(res.status).toBe(402)
    })

    it('suspende automaticamente e retorna 403 quando o trial expirou', async () => {
      setSupabase({
        users: [{ data: [baseUser], error: null }],
        tenants: [{ data: [{ status: 'trial', trial_ends_at: '2000-01-01T00:00:00.000Z' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@ex.com', password: 'senha123' })
      expect(res.status).toBe(403)
      const update = updateCallsFor('tenants').find((c) => c.args[0]?.status === 'suspended')
      expect(update).toBeTruthy()
    })

    it('retorna 403 quando o tenant já está suspenso', async () => {
      setSupabase({
        users: [{ data: [baseUser], error: null }],
        tenants: [{ data: [{ status: 'suspended' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@ex.com', password: 'senha123' })
      expect(res.status).toBe(403)
    })

    it('owner ignora a suspensão do tenant', async () => {
      setSupabase({
        users: [{ data: [{ ...baseUser, role: 'owner' }], error: null }],
        tenants: [{ data: [{ status: 'suspended' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@ex.com', password: 'senha123' })
      expect(res.status).toBe(200)
    })

    it('retorna 401 com senha incorreta', async () => {
      setSupabase({ users: [{ data: [baseUser], error: null }], tenants: [{ data: [{ status: 'active' }], error: null }] })
      mockState.verifyPassword.mockResolvedValue(false)
      const app = buildApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@ex.com', password: 'senha-errada' })
      expect(res.status).toBe(401)
    })

    it('loga com sucesso, seta o cookie e monta o mapa de features', async () => {
      setSupabase({
        users: [{ data: [baseUser], error: null }],
        tenants: [{ data: [{ name: 'Empresa', slug: 'empresa', status: 'active', onboarding_completed: true, feat_meta_api: true }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'ANA@ex.com', password: 'senha123' })

      expect(res.status).toBe(200)
      expect(res.headers['set-cookie']?.[0]).toMatch(/sdr_token=jwt-token/)
      expect(res.body.user).toMatchObject({ id: 'user-1', tenantName: 'Empresa', features: { meta_api: true } })
      expect(mockState.logUsage).toHaveBeenCalledWith('tenant-1', 'user-1', 'login')
    })
  })

  describe('POST /register', () => {
    it('rejeita payload inválido', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/auth/register').send({ email: 'x' })
      expect(res.status).toBe(400)
    })

    it('retorna 409 quando o e-mail já está cadastrado', async () => {
      setSupabase({ users: [{ data: [{ id: 'existing' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/auth/register').send({
        name: 'Ana', companyName: 'Empresa Ana', email: 'ana@ex.com', password: 'senha1234',
      })
      expect(res.status).toBe(409)
    })

    it('cria tenant + usuário admin e retorna o token', async () => {
      setSupabase({
        users: [{ data: [], error: null }, { data: [{ id: 'user-1', tenant_id: 'tenant-1', email: 'ana@ex.com', name: 'Ana', role: 'admin' }], error: null }],
        tenants: [{ data: [], error: null }, { data: [{ id: 'tenant-1', name: 'Empresa Ana', slug: 'empresa-ana' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/auth/register').send({
        name: 'Ana', companyName: 'Empresa Ana', email: 'ana@ex.com', password: 'senha1234',
      })
      expect(res.status).toBe(201)
      expect(res.body.user.tenantSlug).toBe('empresa-ana')
      expect(mockState.logUsage).toHaveBeenCalledWith('tenant-1', 'user-1', 'register')
    })
  })

  describe('PATCH /onboarding-complete', () => {
    it('retorna 403 quando o usuário não tem tenant', async () => {
      mockState.user = { id: 'user-1', tenantId: null }
      const app = buildApp()
      const res = await request(app).patch('/api/auth/onboarding-complete')
      expect(res.status).toBe(403)
    })

    it('marca o onboarding como concluído', async () => {
      mockState.user = { id: 'user-1', tenantId: 'tenant-1' }
      setSupabase({})
      const app = buildApp()
      const res = await request(app).patch('/api/auth/onboarding-complete')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ onboardingCompleted: true })
    })
  })

  it('POST /logout limpa o cookie de sessão', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie']?.[0]).toMatch(/sdr_token=;/)
  })

  describe('POST /change-password', () => {
    beforeEach(() => {
      mockState.user = { id: 'user-1', tenantId: 'tenant-1' }
    })

    it('rejeita senha nova curta', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/auth/change-password').send({ currentPassword: 'x', newPassword: '123' })
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando o usuário não existe', async () => {
      setSupabase({ users: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/auth/change-password').send({ currentPassword: 'atual', newPassword: 'novasenha123' })
      expect(res.status).toBe(404)
    })

    it('retorna 401 quando a senha atual está incorreta', async () => {
      setSupabase({ users: [{ data: [{ password_hash: 'hash' }], error: null }] })
      mockState.verifyPassword.mockResolvedValue(false)
      const app = buildApp()
      const res = await request(app).post('/api/auth/change-password').send({ currentPassword: 'atual-errada', newPassword: 'novasenha123' })
      expect(res.status).toBe(401)
    })

    it('altera a senha com sucesso', async () => {
      setSupabase({ users: [{ data: [{ password_hash: 'hash' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/auth/change-password').send({ currentPassword: 'atual', newPassword: 'novasenha123' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ changed: true })
    })
  })
})
