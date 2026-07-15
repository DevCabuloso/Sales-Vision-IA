import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, hashPassword: null, invalidateTenantStatusCache: null, user: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireOwner: (req, res, next) => {
    if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Acesso restrito ao dono da plataforma.' })
    next()
  },
  invalidateTenantStatusCache: (...args) => mockState.invalidateTenantStatusCache(...args),
}))

vi.mock('../../config/index.js', () => ({
  config: {
    jwt: { secret: 'test-secret', expiresIn: '1h' },
    env: 'test',
    openai: { model: 'gpt-4o-mini', apiKey: 'sk-xxx' },
    google: { clientId: 'gid', clientSecret: 'gsecret', redirectUri: 'https://api.exemplo.com/cb' },
    meta: { graphVersion: 'v21.0', verifyToken: 'verify' },
    supabase: { url: 'https://x.supabase.co', serviceKey: 'key' },
  },
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../../services/auth.js', () => ({
  hashPassword: (...args) => mockState.hashPassword(...args),
}))

const { adminRouter } = await import('../admin.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin', adminRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }
function deleteCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'delete') }

describe('routes/admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'owner-1', role: 'owner' }
    mockState.hashPassword = vi.fn().mockResolvedValue('hashed-pw')
    mockState.invalidateTenantStatusCache = vi.fn()
  })

  it('bloqueia quem não é owner', async () => {
    mockState.user = { id: 'user-1', role: 'admin' }
    const app = buildApp()
    const res = await request(app).get('/api/admin/clients')
    expect(res.status).toBe(403)
  })

  describe('Clientes', () => {
    it('GET /clients usa a RPC admin_clients_overview', async () => {
      setSupabase({ 'rpc:admin_clients_overview': [{ data: [{ id: 'tenant-1', name: 'Empresa' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/admin/clients')
      expect(res.body.clients).toHaveLength(1)
    })

    it('GET /clients/:id retorna 404 quando não existe', async () => {
      setSupabase({ tenants: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/admin/clients/tenant-x')
      expect(res.status).toBe(404)
    })

    it('GET /clients/:id retorna cliente + usuários + integrações', async () => {
      setSupabase({
        tenants: [{ data: [{ id: 'tenant-1', name: 'Empresa' }], error: null }],
        users: [{ data: [{ id: 'u1', name: 'Ana' }], error: null }],
        integrations: [{ data: [{ provider: 'evolution', status: 'connected' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).get('/api/admin/clients/tenant-1')
      expect(res.body.client.name).toBe('Empresa')
      expect(res.body.users).toHaveLength(1)
      expect(res.body.integrations).toHaveLength(1)
    })

    it('POST /clients rejeita payload inválido com o formato de erro padrão ({ error: mensagem })', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients').send({ name: 'x' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String) })
      expect(res.body.details).toBeUndefined()
    })

    it('POST /clients rejeita senha de admin com menos de 8 caracteres', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients').send({
        name: 'Empresa', slug: 'empresa', adminEmail: 'admin@ex.com', adminPassword: 'curta12',
      })
      expect(res.status).toBe(400)
    })

    it('POST /clients retorna 409 em slug duplicado', async () => {
      setSupabase({ tenants: [{ data: null, error: { message: 'duplicate', code: '23505' } }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients').send({
        name: 'Empresa', slug: 'empresa', adminEmail: 'admin@ex.com', adminPassword: 'senha123',
      })
      expect(res.status).toBe(409)
    })

    it('POST /clients faz rollback do tenant quando o e-mail do admin já existe', async () => {
      setSupabase({
        tenants: [{ data: { id: 'tenant-1' }, error: null }],
        users: [{ data: null, error: { message: 'duplicate', code: '23505' } }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients').send({
        name: 'Empresa', slug: 'empresa', adminEmail: 'admin@ex.com', adminPassword: 'senha123',
      })
      expect(res.status).toBe(409)
      expect(deleteCallsFor('tenants')).toHaveLength(1)
    })

    it('POST /clients cria o tenant e o usuário admin com sucesso', async () => {
      setSupabase({
        tenants: [{ data: { id: 'tenant-1', name: 'Empresa' }, error: null }],
        users: [{ data: {}, error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients').send({
        name: 'Empresa', slug: 'empresa', adminEmail: 'ADMIN@ex.com', adminPassword: 'senha123',
      })
      expect(res.status).toBe(201)
      const userInsert = insertCallsFor('users')[0]
      expect(userInsert.args[0].email).toBe('admin@ex.com')
      expect(userInsert.args[0].password_hash).toBe('hashed-pw')
    })

    it('PATCH /clients/:id/features rejeita corpo vazio', async () => {
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1/features').send({})
      expect(res.status).toBe(400)
    })

    it('PATCH /clients/:id/features rejeita valor que falha no Zod com o formato de erro padrão', async () => {
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1/features').send({ feat_broadcast: 'não-é-booleano' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String) })
      expect(res.body.details).toBeUndefined()
    })

    it('PATCH /clients/:id/features retorna 404 quando não encontrado', async () => {
      setSupabase({ tenants: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-x/features').send({ feat_broadcast: false })
      expect(res.status).toBe(404)
    })

    it('PATCH /clients/:id/features atualiza com sucesso', async () => {
      setSupabase({ tenants: [{ data: [{ id: 'tenant-1', feat_broadcast: false }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1/features').send({ feat_broadcast: false })
      expect(res.status).toBe(200)
    })

    it('PATCH /clients/:id/status rejeita status inválido', async () => {
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1/status').send({ status: 'invalido' })
      expect(res.status).toBe(400)
    })

    it('PATCH /clients/:id/status atualiza e invalida o cache', async () => {
      setSupabase({ tenants: [{ data: [{ id: 'tenant-1', status: 'suspended' }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1/status').send({ status: 'suspended' })
      expect(res.status).toBe(200)
      expect(mockState.invalidateTenantStatusCache).toHaveBeenCalledWith('tenant-1')
    })

    it('PATCH /clients/:id atualiza dados gerais', async () => {
      setSupabase({ tenants: [{ data: [{ id: 'tenant-1', name: 'Novo nome' }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1').send({ name: 'Novo nome' })
      expect(res.status).toBe(200)
    })

    it('PATCH /clients/:id/renew rejeita corpo sem days nem next_billing_at', async () => {
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1/renew').send({})
      expect(res.status).toBe(400)
    })

    it('PATCH /clients/:id/renew com next_billing_at explícito atualiza direto', async () => {
      setSupabase({
        tenants: [{ data: [{ id: 'tenant-1', next_billing_at: '2026-09-01T00:00:00.000Z' }], error: null }],
        notifications: [{ data: [], error: null }],
      })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1/renew').send({ next_billing_at: '2026-09-01T00:00:00.000Z' })
      expect(res.status).toBe(200)
      expect(res.body.client.next_billing_at).toBe('2026-09-01T00:00:00.000Z')
      const updateCall = supabaseMock.calls.find((c) => c.table === 'tenants' && c.method === 'update')
      expect(updateCall.args[0].payment_status).toBe('paid')
    })

    it('PATCH /clients/:id/renew resolve avisos de vencimento pendentes daquele tenant', async () => {
      setSupabase({
        tenants: [{ data: [{ id: 'tenant-1', next_billing_at: '2026-09-01T00:00:00.000Z' }], error: null }],
        notifications: [{ data: [], error: null }],
      })
      const app = buildApp()
      await request(app).patch('/api/admin/clients/tenant-1/renew').send({ next_billing_at: '2026-09-01T00:00:00.000Z' })
      const notifUpdate = supabaseMock.calls.find((c) => c.table === 'notifications' && c.method === 'update')
      expect(notifUpdate.args[0].resolved_at).toBeTruthy()
    })

    it('PATCH /clients/:id aceita designar o destinatário do aviso de vencimento', async () => {
      const userId = '11111111-1111-1111-1111-111111111111'
      setSupabase({ tenants: [{ data: [{ id: 'tenant-1', billing_notify_user_id: userId }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1').send({ billing_notify_user_id: userId })
      expect(res.status).toBe(200)
      const updateCall = supabaseMock.calls.find((c) => c.table === 'tenants' && c.method === 'update')
      expect(updateCall.args[0].billing_notify_user_id).toBe(userId)
    })

    it('PATCH /clients/:id rejeita billing_notify_user_id que não é um uuid', async () => {
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1').send({ billing_notify_user_id: 'not-a-uuid' })
      expect(res.status).toBe(400)
    })

    it('PATCH /clients/:id/renew retorna 404 quando o cliente não existe (next_billing_at explícito)', async () => {
      setSupabase({ tenants: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-x/renew').send({ next_billing_at: '2026-09-01T00:00:00.000Z' })
      expect(res.status).toBe(404)
    })

    it('PATCH /clients/:id/renew com days soma a partir de hoje quando não há vencimento futuro', async () => {
      setSupabase({
        tenants: [
          { data: [{ next_billing_at: null }], error: null },
          { data: [{ id: 'tenant-1', next_billing_at: '2026-08-13T00:00:00.000Z' }], error: null },
        ],
      })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-1/renew').send({ days: 30 })
      expect(res.status).toBe(200)
      const updateCall = supabaseMock.calls.find((c) => c.table === 'tenants' && c.method === 'update')
      expect(updateCall.args[0].next_billing_at).toBeTruthy()
    })

    it('PATCH /clients/:id/renew com days retorna 404 quando o cliente não existe', async () => {
      setSupabase({ tenants: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/clients/tenant-x/renew').send({ days: 30 })
      expect(res.status).toBe(404)
    })

    describe('POST /clients/billing-alert', () => {
      it('emite alerta só pros tenants dentro do limiar configurado, com destinatário definido', async () => {
        setSupabase({
          platform_settings: [{ data: [{ billing_reminder_days_before: 3 }], error: null }],
          tenants: [{
            data: [
              { id: 'tenant-1', name: 'Empresa A', next_billing_at: new Date(Date.now() + 2 * 86400000).toISOString(), billing_notify_user_id: 'user-1' },
            ], error: null,
          }],
          notifications: [{ data: [], error: null }],
        })
        const app = buildApp()
        const res = await request(app).post('/api/admin/clients/billing-alert')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ notified: 1, total: 1, withoutRecipient: [] })
        const insert = insertCallsFor('notifications')[0]
        expect(insert.args[0]).toMatchObject({ tenant_id: 'tenant-1', user_id: 'user-1', type: 'billing_reminder' })
      })

      it('não duplica quando já existe um aviso não resolvido criado hoje', async () => {
        setSupabase({
          platform_settings: [{ data: [{ billing_reminder_days_before: 3 }], error: null }],
          tenants: [{ data: [{ id: 'tenant-1', name: 'Empresa A', next_billing_at: new Date().toISOString(), billing_notify_user_id: 'user-1' }], error: null }],
          notifications: [{ data: [{ id: 'notif-1' }], error: null }],
        })
        const app = buildApp()
        const res = await request(app).post('/api/admin/clients/billing-alert')
        expect(res.body).toEqual({ notified: 0, total: 1, withoutRecipient: [] })
        expect(insertCallsFor('notifications')).toHaveLength(0)
      })

      it('usa 3 dias como padrão quando platform_settings não retorna nada', async () => {
        setSupabase({ platform_settings: [{ data: [], error: null }], tenants: [{ data: [], error: null }] })
        const app = buildApp()
        const res = await request(app).post('/api/admin/clients/billing-alert')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ notified: 0, total: 0, withoutRecipient: [] })
      })

      it('reporta separadamente tenants vencendo sem destinatário configurado, sem quebrar a contagem', async () => {
        setSupabase({
          platform_settings: [{ data: [{ billing_reminder_days_before: 3 }], error: null }],
          tenants: [{
            data: [
              { id: 'tenant-1', name: 'Interprise', next_billing_at: new Date(Date.now() + 1 * 86400000).toISOString(), billing_notify_user_id: null },
            ], error: null,
          }],
        })
        const app = buildApp()
        const res = await request(app).post('/api/admin/clients/billing-alert')
        expect(res.body).toEqual({ notified: 0, total: 1, withoutRecipient: ['Interprise'] })
        expect(insertCallsFor('notifications')).toHaveLength(0)
      })
    })

    it('DELETE /clients/:id remove o tenant', async () => {
      setSupabase({})
      const app = buildApp()
      const res = await request(app).delete('/api/admin/clients/tenant-1')
      expect(res.status).toBe(200)
    })
  })

  describe('Usuários', () => {
    it('GET /users lista usuários (exceto owner) enriquecidos com o tenant', async () => {
      setSupabase({
        users: [{ data: [{ id: 'u1', name: 'Ana', tenant_id: 'tenant-1' }], error: null }],
        tenants: [{ data: [{ id: 'tenant-1', name: 'Empresa', slug: 'empresa' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).get('/api/admin/users')
      expect(res.body.users[0].tenant).toEqual({ id: 'tenant-1', name: 'Empresa', slug: 'empresa' })
      const limitCall = supabaseMock.calls.find((c) => c.table === 'users' && c.method === 'limit')
      expect(limitCall.args[0]).toBe(5000)
    })

    it('POST /clients/:id/users rejeita senha com menos de 8 caracteres, com o formato de erro padrão', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients/tenant-1/users').send({ email: 'a@a.com', name: 'A', password: 'curta12' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String) })
      expect(res.body.details).toBeUndefined()
    })

    it('POST /clients/:id/users retorna 404 quando o cliente não existe', async () => {
      setSupabase({ tenants: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients/tenant-x/users').send({ email: 'a@a.com', name: 'A', password: 'senha123' })
      expect(res.status).toBe(404)
    })

    it('POST /clients/:id/users cria o usuário', async () => {
      setSupabase({
        tenants: [{ data: [{ id: 'tenant-1' }], error: null }],
        users: [{ data: { id: 'u1', email: 'a@a.com' }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients/tenant-1/users').send({ email: 'a@a.com', name: 'A', password: 'senha123' })
      expect(res.status).toBe(201)
    })

    it('PATCH /users/:id retorna 404 quando não encontrado', async () => {
      setSupabase({ users: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/users/u-x').send({ active: false })
      expect(res.status).toBe(404)
    })

    it('PATCH /users/:id atualiza com sucesso', async () => {
      setSupabase({ users: [{ data: [{ id: 'u1', active: false }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/admin/users/u1').send({ active: false })
      expect(res.status).toBe(200)
    })

    it('DELETE /users/:id remove o usuário', async () => {
      setSupabase({})
      const app = buildApp()
      const res = await request(app).delete('/api/admin/users/u1')
      expect(res.status).toBe(200)
    })

    it('POST /users/:id/reset-password rejeita senha curta', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/admin/users/u1/reset-password').send({ password: '123' })
      expect(res.status).toBe(400)
    })

    it('POST /users/:id/reset-password retorna 404 quando não encontrado', async () => {
      setSupabase({ users: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/users/u-x/reset-password').send({ password: 'novasenha123' })
      expect(res.status).toBe(404)
    })

    it('POST /users/:id/reset-password reseta com sucesso', async () => {
      setSupabase({ users: [{ data: [{ id: 'u1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/users/u1/reset-password').send({ password: 'novasenha123' })
      expect(res.status).toBe(200)
    })
  })

  describe('Superadmins (owners)', () => {
    it('GET /owners lista os owners', async () => {
      setSupabase({ users: [{ data: [{ id: 'owner-1', email: 'dono@ex.com' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/admin/owners')
      expect(res.body.owners).toHaveLength(1)
    })

    it('POST /owners rejeita senha com menos de 8 caracteres, com o formato de erro padrão', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/admin/owners').send({ email: 'dono@ex.com', name: 'Dono', password: 'curta12' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String) })
      expect(res.body.details).toBeUndefined()
    })

    it('POST /owners retorna 409 em e-mail duplicado', async () => {
      setSupabase({ users: [{ data: null, error: { message: 'duplicate', code: '23505' } }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/owners').send({ email: 'dono@ex.com', name: 'Dono', password: 'senha123' })
      expect(res.status).toBe(409)
    })

    it('POST /owners cria o superadmin', async () => {
      setSupabase({ users: [{ data: { id: 'owner-2', email: 'dono2@ex.com' }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/owners').send({ email: 'dono2@ex.com', name: 'Dono 2', password: 'senha123' })
      expect(res.status).toBe(201)
    })

    it('POST /owners/:id/reset-password rejeita senha curta', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/admin/owners/owner-2/reset-password').send({ password: '1' })
      expect(res.status).toBe(400)
    })

    it('POST /owners/:id/reset-password retorna 404 quando não encontrado', async () => {
      setSupabase({ users: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/owners/owner-x/reset-password').send({ password: 'novasenha123' })
      expect(res.status).toBe(404)
    })

    it('DELETE /owners/:id não permite se autoexcluir', async () => {
      const app = buildApp()
      const res = await request(app).delete('/api/admin/owners/owner-1')
      expect(res.status).toBe(400)
    })

    it('DELETE /owners/:id exclui outro owner', async () => {
      setSupabase({})
      const app = buildApp()
      const res = await request(app).delete('/api/admin/owners/owner-2')
      expect(res.status).toBe(200)
    })
  })

  describe('Impersonation', () => {
    it('POST /clients/:id/impersonate retorna 404 quando o cliente não existe', async () => {
      setSupabase({ tenants: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients/tenant-x/impersonate')
      expect(res.status).toBe(404)
    })

    it('POST /clients/:id/impersonate retorna 404 quando não há admin ativo', async () => {
      setSupabase({
        tenants: [{ data: [{ name: 'Empresa', slug: 'empresa' }], error: null }],
        users: [{ data: [], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients/tenant-1/impersonate')
      expect(res.status).toBe(404)
    })

    it('POST /clients/:id/impersonate gera o token de impersonação', async () => {
      setSupabase({
        tenants: [{ data: [{ name: 'Empresa', slug: 'empresa', feat_broadcast: true }], error: null }],
        users: [{ data: [{ id: 'admin-1', email: 'admin@ex.com', name: 'Admin', role: 'admin' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients/tenant-1/impersonate')
      expect(res.status).toBe(200)
      expect(res.body.user).toMatchObject({ id: 'admin-1', tenantName: 'Empresa', features: { broadcast: true } })
      expect(typeof res.body.token).toBe('string')
    })

    it('POST /clients/:id/impersonate registra auditoria e embute quem iniciou no token', async () => {
      setSupabase({
        tenants: [{ data: [{ name: 'Empresa', slug: 'empresa' }], error: null }],
        users: [{ data: [{ id: 'admin-1', email: 'admin@ex.com', name: 'Admin', role: 'admin' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/admin/clients/tenant-1/impersonate')

      const decoded = jwt.verify(res.body.token, 'test-secret')
      expect(decoded.impersonatedBy).toBe('owner-1')
      expect(decoded.sub).toBe('admin-1')

      const usageInsert = supabaseMock.calls.find((c) => c.table === 'usage_events' && c.method === 'insert')
      expect(usageInsert.args[0]).toMatchObject({
        tenant_id: 'tenant-1', user_id: 'owner-1', event_type: 'impersonation_started',
        meta: { targetUserId: 'admin-1', targetUserEmail: 'admin@ex.com' },
      })
    })

    it('POST /users/:id/impersonate retorna 404 quando o usuário não existe', async () => {
      setSupabase({ users: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/users/u-x/impersonate')
      expect(res.status).toBe(404)
    })

    it('POST /users/:id/impersonate retorna 400 quando o usuário está inativo', async () => {
      setSupabase({ users: [{ data: [{ id: 'u1', active: false, tenant_id: 'tenant-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/admin/users/u1/impersonate')
      expect(res.status).toBe(400)
    })

    it('POST /users/:id/impersonate gera o token com sucesso', async () => {
      setSupabase({
        users: [{ data: [{ id: 'u1', email: 'op@ex.com', name: 'Operador', role: 'agent', active: true, tenant_id: 'tenant-1' }], error: null }],
        tenants: [{ data: [{ name: 'Empresa', slug: 'empresa' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/admin/users/u1/impersonate')
      expect(res.status).toBe(200)
      expect(res.body.user.id).toBe('u1')
    })

    it('POST /users/:id/impersonate registra auditoria e embute quem iniciou no token', async () => {
      setSupabase({
        users: [{ data: [{ id: 'u1', email: 'op@ex.com', name: 'Operador', role: 'agent', active: true, tenant_id: 'tenant-1' }], error: null }],
        tenants: [{ data: [{ name: 'Empresa', slug: 'empresa' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/admin/users/u1/impersonate')

      const decoded = jwt.verify(res.body.token, 'test-secret')
      expect(decoded.impersonatedBy).toBe('owner-1')

      const usageInsert = supabaseMock.calls.find((c) => c.table === 'usage_events' && c.method === 'insert')
      expect(usageInsert.args[0]).toMatchObject({
        tenant_id: 'tenant-1', user_id: 'owner-1', event_type: 'impersonation_started',
        meta: { targetUserId: 'u1', targetUserEmail: 'op@ex.com' },
      })
    })
  })

  it('GET /monitoring agrega leads/mensagens/agendamentos com o nome do tenant', async () => {
    setSupabase({
      leads: [{ data: [{ id: 'l1', tenant_id: 'tenant-1' }], error: null }],
      messages: [{ data: [{ id: 'm1', tenant_id: 'tenant-1' }], error: null }],
      appointments: [{ data: [{ id: 'a1', tenant_id: 'tenant-1' }], error: null }],
      tenants: [{ data: [{ id: 'tenant-1', name: 'Empresa', slug: 'empresa' }], error: null }],
    })
    const app = buildApp()
    const res = await request(app).get('/api/admin/monitoring').query({ tenant: 'tenant-1' })
    expect(res.body.leads[0].tenant.name).toBe('Empresa')
  })

  it('GET /settings retorna o resumo de configuração sem expor segredos', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/admin/settings')
    expect(res.body.settings.openai).toEqual({ model: 'gpt-4o-mini', configured: true })
    expect(JSON.stringify(res.body)).not.toContain('sk-xxx')
  })

  it('GET /settings inclui a config do aviso de vencimento', async () => {
    setSupabase({ platform_settings: [{ data: [{ billing_reminder_days_before: 5, billing_reminder_time: '08:30' }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/admin/settings')
    expect(res.body.settings.billing).toEqual({ billing_reminder_days_before: 5, billing_reminder_time: '08:30' })
  })

  describe('PUT /settings', () => {
    it('rejeita horário em formato inválido', async () => {
      const app = buildApp()
      const res = await request(app).put('/api/admin/settings').send({ billing_reminder_days_before: 3, billing_reminder_time: '9:00' })
      expect(res.status).toBe(400)
    })

    it('atualiza a config do aviso de vencimento', async () => {
      setSupabase({ platform_settings: [{ data: [{ billing_reminder_days_before: 5, billing_reminder_time: '08:00' }], error: null }] })
      const app = buildApp()
      const res = await request(app).put('/api/admin/settings').send({ billing_reminder_days_before: 5, billing_reminder_time: '08:00' })
      expect(res.status).toBe(200)
      expect(res.body.billing).toEqual({ billing_reminder_days_before: 5, billing_reminder_time: '08:00' })
    })
  })

  describe('GET /overview', () => {
    it('usa a RPC admin_overview e retorna o primeiro item quando vem como array', async () => {
      setSupabase({ 'rpc:admin_overview': [{ data: [{ totalTenants: 5 }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/admin/overview')
      expect(res.body.overview).toEqual({ totalTenants: 5 })
    })

    it('retorna o objeto diretamente quando a RPC não retorna array', async () => {
      setSupabase({ 'rpc:admin_overview': [{ data: { totalTenants: 5 }, error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/admin/overview')
      expect(res.body.overview).toEqual({ totalTenants: 5 })
    })
  })
})
