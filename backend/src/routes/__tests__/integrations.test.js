import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({
  box: {}, getAuthUrl: null, handleCallback: null, disconnect: null,
  saveCredentials: null, getCredentials: null, disconnectProvider: null, encrypt: null, decryptJSON: null,
  dnsLookup: null,
}))

vi.mock('node:dns/promises', () => ({
  default: { lookup: (...args) => mockState.dnsLookup(...args) },
}))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../config/index.js', () => ({
  config: { frontendUrl: 'https://app.exemplo.com', jwt: { secret: 'test-secret', expiresIn: '1h' } },
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

vi.mock('../../services/googleCalendar.js', () => ({
  getAuthUrl: (...args) => mockState.getAuthUrl(...args),
  handleCallback: (...args) => mockState.handleCallback(...args),
  disconnect: (...args) => mockState.disconnect(...args),
}))

vi.mock('../../services/integrations.js', () => ({
  saveCredentials: (...args) => mockState.saveCredentials(...args),
  getCredentials: (...args) => mockState.getCredentials(...args),
  disconnectProvider: (...args) => mockState.disconnectProvider(...args),
}))

vi.mock('../../services/crypto.js', () => ({
  encrypt: (...args) => mockState.encrypt(...args),
  decryptJSON: (...args) => mockState.decryptJSON(...args),
}))

const { integrationsRouter } = await import('../integrations.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/integrations', integrationsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql)) }

describe('routes/integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.getAuthUrl = vi.fn()
    mockState.handleCallback = vi.fn()
    mockState.disconnect = vi.fn().mockResolvedValue({ disconnected: true })
    mockState.saveCredentials = vi.fn().mockResolvedValue({ connected: true })
    mockState.getCredentials = vi.fn()
    mockState.disconnectProvider = vi.fn().mockResolvedValue({ disconnected: true })
    mockState.encrypt = vi.fn((v) => `enc(${v})`)
    mockState.decryptJSON = vi.fn((v) => ({ accessToken: v.replace(/^enc\(|\)$/g, '') }))
    mockState.dnsLookup = vi.fn().mockResolvedValue({ address: '93.184.216.34' })
    setRls()
  })

  describe('GET /google/setup', () => {
    it('retorna configured=false quando o tenant não tem credenciais próprias', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/integrations/google/setup')
      expect(res.body).toEqual({ configured: false, clientId: null })
    })

    it('retorna configured=true quando há client_id e client_secret salvos', async () => {
      rlsMock.queueRows([{ meta: { setup: { client_id: 'abc', client_secret_enc: 'enc(x)' } } }])
      const app = buildApp()
      const res = await request(app).get('/api/integrations/google/setup')
      expect(res.body).toEqual({ configured: true, clientId: 'abc' })
    })
  })

  describe('POST /google/setup', () => {
    it('rejeita client id curto demais', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/integrations/google/setup').send({ clientId: 'x', clientSecret: 'y' })
      expect(res.status).toBe(400)
    })

    it('salva as credenciais preservando o meta existente', async () => {
      rlsMock.queueRows([{ meta: { calendarId: 'primary' }, status: 'connected' }])
      const app = buildApp()
      const res = await request(app).post('/api/integrations/google/setup').send({ clientId: 'client-id-123', clientSecret: 'client-secret-123' })
      expect(res.status).toBe(200)
      const insert = insertCallsMatching(/INSERT INTO integrations/)[0]
      expect(JSON.parse(insert.params[2])).toEqual({ calendarId: 'primary', setup: { client_id: 'client-id-123', client_secret_enc: 'enc(client-secret-123)' } })
      expect(insert.params[1]).toBe('connected')
    })
  })

  describe('GET /google/connect', () => {
    it('retorna a URL de autenticação', async () => {
      mockState.getAuthUrl.mockResolvedValue('https://accounts.google.com/mock')
      const app = buildApp()
      const res = await request(app).get('/api/integrations/google/connect')
      expect(res.body).toEqual({ authUrl: 'https://accounts.google.com/mock' })
    })

    it('retorna 500 quando falha ao gerar a URL', async () => {
      mockState.getAuthUrl.mockRejectedValue(new Error('Google OAuth não configurado.'))
      const app = buildApp()
      const res = await request(app).get('/api/integrations/google/connect')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /google/callback', () => {
    it('redireciona com erro quando falta code ou state', async () => {
      const app = buildApp()
      const res = await request(app).get('/api/integrations/google/callback')
      expect(res.status).toBe(302)
      expect(res.headers.location).toContain('reason=missing_code')
    })

    it('redireciona com erro quando o state é inválido', async () => {
      const app = buildApp()
      const res = await request(app).get('/api/integrations/google/callback').query({ code: 'abc', state: 'token-invalido' })
      expect(res.headers.location).toContain('reason=invalid_state')
    })

    it('processa o callback com sucesso e redireciona conectado', async () => {
      const state = jwt.sign({ tenantId: 'tenant-1' }, 'test-secret', { expiresIn: '10m' })
      mockState.handleCallback.mockResolvedValue({ connected: true, email: 'ana@ex.com' })
      const app = buildApp()
      const res = await request(app).get('/api/integrations/google/callback').query({ code: 'auth-code', state })
      expect(res.headers.location).toBe('https://app.exemplo.com/integracoes?gcal=connected')
      expect(mockState.handleCallback).toHaveBeenCalledWith('auth-code', 'tenant-1')
    })

    it('redireciona com o motivo do erro quando handleCallback falha', async () => {
      const state = jwt.sign({ tenantId: 'tenant-1' }, 'test-secret', { expiresIn: '10m' })
      mockState.handleCallback.mockRejectedValue(new Error('token expirado'))
      const app = buildApp()
      const res = await request(app).get('/api/integrations/google/callback').query({ code: 'auth-code', state })
      expect(res.headers.location).toContain('reason=token%20expirado')
    })
  })

  describe('GET /google/status', () => {
    it('retorna connected=false quando não conectado', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/integrations/google/status')
      expect(res.body).toEqual({ connected: false })
    })

    it('retorna connected=true com o e-mail quando conectado', async () => {
      rlsMock.queueRows([{ status: 'connected', meta: { email: 'ana@ex.com' } }])
      const app = buildApp()
      const res = await request(app).get('/api/integrations/google/status')
      expect(res.body).toEqual({ connected: true, email: 'ana@ex.com' })
    })
  })

  it('POST /google/disconnect desconecta o Google Calendar', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/integrations/google/disconnect')
    expect(res.status).toBe(200)
    expect(mockState.disconnect).toHaveBeenCalledWith('tenant-1')
  })

  describe('POST /meta/test', () => {
    it('retorna 404 quando não configurado', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/integrations/meta/test')
      expect(res.status).toBe(404)
    })

    it('valida a conexão com sucesso', async () => {
      rlsMock.queueRows([{ credentials: 'enc(tok-123)', meta: { phoneNumberId: 'phone-1' } }])
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ display_phone_number: '+55 11 98888-7777', verified_name: 'Empresa' }) })

      const app = buildApp()
      const res = await request(app).post('/api/integrations/meta/test')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ connected: true, phone: '+55 11 98888-7777', name: 'Empresa' })
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-123')
    })

    it('retorna 400 quando a Meta rejeita as credenciais', async () => {
      rlsMock.queueRows([{ credentials: 'enc(tok-123)', meta: { phoneNumberId: 'phone-1' } }])
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'token inválido' } }) })

      const app = buildApp()
      const res = await request(app).post('/api/integrations/meta/test')
      expect(res.status).toBe(400)
    })
  })

  describe('POST /meta/connect', () => {
    it('rejeita credenciais inválidas', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/integrations/meta/connect').send({ accessToken: 'x' })
      expect(res.status).toBe(400)
    })

    it('salva as credenciais Meta com sucesso', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/integrations/meta/connect').send({ accessToken: 'token-1234567890', phoneNumberId: 'phone-1' })
      expect(res.status).toBe(200)
      expect(mockState.saveCredentials).toHaveBeenCalledWith('tenant-1', 'meta_whatsapp', { accessToken: 'token-1234567890' }, { phoneNumberId: 'phone-1', wabaId: null })
    })
  })

  describe('POST /evolution/connect', () => {
    it('rejeita URL inválida', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/integrations/evolution/connect').send({ baseUrl: 'não-é-url', apiKey: 'x', instance: 'y' })
      expect(res.status).toBe(400)
    })

    it('salva as credenciais Evolution com sucesso', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/integrations/evolution/connect').send({ baseUrl: 'https://evo.exemplo.com', apiKey: 'chave', instance: 'inst-1' })
      expect(res.status).toBe(200)
      expect(mockState.saveCredentials).toHaveBeenCalledWith('tenant-1', 'evolution', { apiKey: 'chave' }, { baseUrl: 'https://evo.exemplo.com', instance: 'inst-1' })
    })

    it('rejeita baseUrl que aponta pra rede interna (proteção contra SSRF)', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/integrations/evolution/connect').send({ baseUrl: 'http://localhost:5000/api', apiKey: 'chave', instance: 'inst-1' })
      expect(res.status).toBe(400)
      expect(mockState.saveCredentials).not.toHaveBeenCalled()
    })

    it('rejeita baseUrl cujo DNS resolve pra IP privado', async () => {
      mockState.dnsLookup.mockResolvedValue({ address: '10.0.0.5' })
      const app = buildApp()
      const res = await request(app).post('/api/integrations/evolution/connect').send({ baseUrl: 'https://evo-interno.exemplo.com', apiKey: 'chave', instance: 'inst-1' })
      expect(res.status).toBe(400)
      expect(mockState.saveCredentials).not.toHaveBeenCalled()
    })
  })

  it('GET /status lista as integrações do tenant', async () => {
    rlsMock.queueRows([{ provider: 'evolution', status: 'connected' }])
    const app = buildApp()
    const res = await request(app).get('/api/integrations/status')
    expect(res.body.integrations).toHaveLength(1)
  })

  describe('POST /:provider/disconnect', () => {
    it('rejeita provider inválido', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/integrations/google_calendar/disconnect')
      expect(res.status).toBe(400)
    })

    it('desconecta um provider válido', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/integrations/evolution/disconnect')
      expect(res.status).toBe(200)
      expect(mockState.disconnectProvider).toHaveBeenCalledWith('tenant-1', 'evolution')
    })
  })
})
