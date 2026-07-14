import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ verifyToken: null, box: {} }))

vi.mock('../../services/auth.js', () => ({
  verifyToken: (...args) => mockState.verifyToken(...args),
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

const { requireAuth, requireOwner, requireTenant, requirePermission, invalidateTenantStatusCache, invalidateUserCache } = await import('../auth.js')

let supabaseMock
const verifyToken = vi.fn()
mockState.verifyToken = verifyToken

function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

function makeRes() {
  const res = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

describe('middleware/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('requireAuth', () => {
    it('retorna 401 quando não há token (nem header, nem cookie)', async () => {
      setSupabase({})
      const req = { headers: {}, cookies: {} }
      const res = makeRes()
      const next = vi.fn()

      await requireAuth(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Token ausente.' })
      expect(next).not.toHaveBeenCalled()
    })

    it('retorna 401 quando verifyToken lança (token inválido/expirado)', async () => {
      setSupabase({})
      verifyToken.mockImplementation(() => { throw new Error('jwt expired') })
      const req = { headers: {}, cookies: { sdr_token: 'token-ruim' } }
      const res = makeRes()
      const next = vi.fn()

      await requireAuth(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido ou expirado.' })
      expect(next).not.toHaveBeenCalled()
    })

    it('retorna 401 quando o usuário não existe no banco', async () => {
      setSupabase({ users: [{ data: [], error: null }] })
      verifyToken.mockReturnValue({ sub: 'user-sem-registro' })
      const req = { headers: {}, cookies: { sdr_token: 'token-ok' } }
      const res = makeRes()
      const next = vi.fn()

      await requireAuth(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Usuário inválido ou inativo.' })
    })

    it('retorna 401 quando o usuário existe mas está inativo', async () => {
      setSupabase({
        users: [{ data: [{ id: 'user-inativo', tenant_id: 't1', email: 'x@x.com', role: 'admin', active: false }], error: null }],
      })
      verifyToken.mockReturnValue({ sub: 'user-inativo' })
      const req = { headers: {}, cookies: { sdr_token: 'token-ok' } }
      const res = makeRes()
      const next = vi.fn()

      await requireAuth(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })

    it('popula req.user e chama next() quando o token/usuário são válidos', async () => {
      setSupabase({
        users: [{ data: [{ id: 'user-valido', tenant_id: 't1', email: 'a@a.com', name: 'Ana', role: 'admin', active: true }], error: null }],
      })
      verifyToken.mockReturnValue({ sub: 'user-valido' })
      const req = { headers: {}, cookies: { sdr_token: 'token-ok' } }
      const res = makeRes()
      const next = vi.fn()

      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(req.user).toEqual({
        id: 'user-valido', role: 'admin', tenantId: 't1', email: 'a@a.com', name: 'Ana',
        isRestricted: false, permissions: null,
      })
    })

    it('popula isRestricted e permissions quando o usuário é um operador restrito', async () => {
      setSupabase({
        users: [{
          data: [{
            id: 'user-restrito', tenant_id: 't1', email: 'r@r.com', name: 'Rê', role: 'agent', active: true,
            is_restricted: true, permissions: { chat: true, broadcast: false },
          }], error: null,
        }],
      })
      verifyToken.mockReturnValue({ sub: 'user-restrito' })
      const req = { headers: {}, cookies: { sdr_token: 'token-ok' } }
      const res = makeRes()
      const next = vi.fn()

      await requireAuth(req, res, next)

      expect(req.user.isRestricted).toBe(true)
      expect(req.user.permissions).toEqual({ chat: true, broadcast: false })
    })

    it('prioriza o Bearer header sobre o cookie', async () => {
      setSupabase({
        users: [{ data: [{ id: 'user-header', tenant_id: 't1', email: 'h@h.com', role: 'admin', active: true }], error: null }],
      })
      verifyToken.mockReturnValue({ sub: 'user-header' })
      const req = { headers: { authorization: 'Bearer token-do-header' }, cookies: { sdr_token: 'token-do-cookie' } }
      const res = makeRes()
      const next = vi.fn()

      await requireAuth(req, res, next)

      expect(verifyToken).toHaveBeenCalledWith('token-do-header')
      expect(next).toHaveBeenCalled()
    })

    it('usa cache e não repete a query ao banco em chamadas seguidas para o mesmo usuário', async () => {
      setSupabase({
        users: [{ data: [{ id: 'user-cache', tenant_id: 't1', email: 'c@c.com', role: 'admin', active: true }], error: null }],
      })
      verifyToken.mockReturnValue({ sub: 'user-cache' })
      const req = { headers: {}, cookies: { sdr_token: 'token-ok' } }

      await requireAuth(req, makeRes(), vi.fn())
      await requireAuth(req, makeRes(), vi.fn())

      const usersCalls = supabaseMock.calls.filter((c) => c.table === 'users')
      expect(supabaseMock.supabase.from).toHaveBeenCalledTimes(1)
      expect(usersCalls.length).toBeGreaterThan(0)
    })
  })

  describe('requirePermission', () => {
    it('chama next() quando o usuário não está restrito', () => {
      const req = { user: { role: 'agent', isRestricted: false, permissions: { broadcast: false } } }
      const res = makeRes()
      const next = vi.fn()
      requirePermission('broadcast')(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('chama next() para admin/owner mesmo marcados como restritos', () => {
      const req = { user: { role: 'admin', isRestricted: true, permissions: {} } }
      const res = makeRes()
      const next = vi.fn()
      requirePermission('broadcast')(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('retorna 403 quando o operador está restrito e não tem a permissão', () => {
      const req = { user: { role: 'agent', isRestricted: true, permissions: { chat: true, broadcast: false } } }
      const res = makeRes()
      const next = vi.fn()
      requirePermission('broadcast')(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(next).not.toHaveBeenCalled()
    })

    it('chama next() quando o operador está restrito mas tem a permissão específica', () => {
      const req = { user: { role: 'agent', isRestricted: true, permissions: { chat: true, broadcast: false } } }
      const res = makeRes()
      const next = vi.fn()
      requirePermission('chat')(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('retorna 403 quando restrito e a permissão nem está definida no objeto', () => {
      const req = { user: { role: 'agent', isRestricted: true, permissions: {} } }
      const res = makeRes()
      const next = vi.fn()
      requirePermission('leads')(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })

  describe('invalidateUserCache', () => {
    it('força nova consulta ao banco pro mesmo usuário depois de invalidar', async () => {
      setSupabase({
        users: [
          { data: [{ id: 'user-x', tenant_id: 't1', email: 'x@x.com', role: 'agent', active: true, is_restricted: false }], error: null },
          { data: [{ id: 'user-x', tenant_id: 't1', email: 'x@x.com', role: 'agent', active: true, is_restricted: true, permissions: { chat: false } }], error: null },
        ],
      })
      verifyToken.mockReturnValue({ sub: 'user-x' })
      const req = { headers: {}, cookies: { sdr_token: 'token-ok' } }

      await requireAuth(req, makeRes(), vi.fn())
      expect(req.user.isRestricted).toBe(false)

      invalidateUserCache('user-x')

      await requireAuth(req, makeRes(), vi.fn())
      expect(req.user.isRestricted).toBe(true)
      expect(supabaseMock.supabase.from).toHaveBeenCalledTimes(2)
    })
  })

  describe('requireOwner', () => {
    it('chama next() quando o usuário é owner', () => {
      const req = { user: { role: 'owner' } }
      const res = makeRes()
      const next = vi.fn()
      requireOwner(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('retorna 403 quando o usuário não é owner', () => {
      const req = { user: { role: 'admin' } }
      const res = makeRes()
      const next = vi.fn()
      requireOwner(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('requireTenant', () => {
    it('retorna 403 quando req.user não tem tenantId', async () => {
      const req = { user: { id: 'u1' } }
      const res = makeRes()
      const next = vi.fn()
      await requireTenant(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(next).not.toHaveBeenCalled()
    })

    it('retorna 402 quando o tenant está suspenso', async () => {
      setSupabase({
        tenants: [{ data: [{ status: 'suspended', trial_ends_at: null }], error: null }],
      })
      const req = { user: { tenantId: 'tenant-suspenso' } }
      const res = makeRes()
      const next = vi.fn()

      await requireTenant(req, res, next)

      expect(res.status).toHaveBeenCalledWith(402)
      expect(res.json).toHaveBeenCalledWith({ error: 'Assinatura suspensa. Entre em contato com o suporte.' })
      expect(next).not.toHaveBeenCalled()
    })

    it('retorna 402 quando o pagamento está pendente', async () => {
      setSupabase({
        tenants: [{ data: [{ status: 'pending_payment', trial_ends_at: null }], error: null }],
      })
      const req = { user: { tenantId: 'tenant-pendente' } }
      const res = makeRes()
      const next = vi.fn()

      await requireTenant(req, res, next)

      expect(res.status).toHaveBeenCalledWith(402)
      expect(next).not.toHaveBeenCalled()
    })

    it('retorna 402 quando o trial expirou', async () => {
      setSupabase({
        tenants: [{ data: [{ status: 'trial', trial_ends_at: '2000-01-01T00:00:00.000Z' }], error: null }],
      })
      const req = { user: { tenantId: 'tenant-trial-expirado' } }
      const res = makeRes()
      const next = vi.fn()

      await requireTenant(req, res, next)

      expect(res.status).toHaveBeenCalledWith(402)
      expect(next).not.toHaveBeenCalled()
    })

    it('chama next() quando o trial ainda está vigente', async () => {
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      setSupabase({
        tenants: [{ data: [{ status: 'trial', trial_ends_at: future }], error: null }],
      })
      const req = { user: { tenantId: 'tenant-trial-vigente' } }
      const res = makeRes()
      const next = vi.fn()

      await requireTenant(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('chama next() quando o tenant está ativo', async () => {
      setSupabase({
        tenants: [{ data: [{ status: 'active', trial_ends_at: null }], error: null }],
      })
      const req = { user: { tenantId: 'tenant-ativo' } }
      const res = makeRes()
      const next = vi.fn()

      await requireTenant(req, res, next)

      expect(next).toHaveBeenCalled()
    })

    it('segue (fail-open) quando a consulta ao banco falha', async () => {
      setSupabase({
        tenants: [{ data: null, error: { message: 'timeout' } }],
      })
      const req = { user: { tenantId: 'tenant-com-erro' } }
      const res = makeRes()
      const next = vi.fn()

      await requireTenant(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('invalidateTenantStatusCache força nova consulta ao banco', async () => {
      setSupabase({
        tenants: [
          { data: [{ status: 'suspended', trial_ends_at: null }], error: null },
          { data: [{ status: 'active', trial_ends_at: null }], error: null },
        ],
      })
      const req = { user: { tenantId: 'tenant-invalidado' } }

      await requireTenant(req, makeRes(), vi.fn())
      expect(supabaseMock.supabase.from).toHaveBeenCalledTimes(1)

      invalidateTenantStatusCache('tenant-invalidado')

      const res2 = makeRes()
      const next2 = vi.fn()
      await requireTenant(req, res2, next2)

      expect(supabaseMock.supabase.from).toHaveBeenCalledTimes(2)
      expect(next2).toHaveBeenCalled()
    })
  })
})
