import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, encrypt: null, decryptJSON: null, dnsLookup: null }))

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

vi.mock('../../services/crypto.js', () => ({
  encrypt: (...args) => mockState.encrypt(...args),
  decryptJSON: (...args) => mockState.decryptJSON(...args),
}))

vi.mock('node:dns/promises', () => ({
  default: { lookup: (...args) => mockState.dnsLookup(...args) },
}))

const { customApisRouter } = await import('../custom-apis.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/custom-apis', customApisRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }

describe('routes/custom-apis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.encrypt = vi.fn((v) => `enc(${v})`)
    mockState.decryptJSON = vi.fn((v) => v.replace(/^enc\(|\)$/g, ''))
    mockState.dnsLookup = vi.fn().mockResolvedValue({ address: '93.184.216.34' })
  })

  describe('POST / (proteção SSRF)', () => {
    it('rejeita URL inválida', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/custom-apis').send({ name: 'x', base_url: 'não-é-url' })
      expect(res.status).toBe(400)
    })

    it('bloqueia hostname literal de rede privada/loopback', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/custom-apis').send({ name: 'x', base_url: 'http://127.0.0.1:8080' })
      expect(res.status).toBe(500)
      expect(res.body.error).toMatch(/não permitido/)
      expect(mockState.dnsLookup).not.toHaveBeenCalled()
    })

    it('bloqueia quando o DNS do hostname resolve para IP privado', async () => {
      mockState.dnsLookup.mockResolvedValue({ address: '10.0.0.5' })
      const app = buildApp()
      const res = await request(app).post('/api/custom-apis').send({ name: 'x', base_url: 'https://api.exemplo-interno.com' })
      expect(res.status).toBe(500)
      expect(res.body.error).toMatch(/não permitido/)
    })

    it('cria a API criptografando a api_key quando a URL é pública', async () => {
      setSupabase({ custom_apis: [{ data: { id: 'api-1', name: 'Minha IA', base_url: 'https://api.exemplo.com' }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/custom-apis').send({ name: 'Minha IA', base_url: 'https://api.exemplo.com', api_key: 'sk-123' })

      expect(res.status).toBe(201)
      const insert = insertCallsFor('custom_apis')[0]
      expect(insert.args[0].api_key).toBe('enc(sk-123)')
    })

    it('não quebra quando o DNS falha (deixa o fetch falhar depois naturalmente)', async () => {
      mockState.dnsLookup.mockRejectedValue(new Error('ENOTFOUND'))
      setSupabase({ custom_apis: [{ data: { id: 'api-1' }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/custom-apis').send({ name: 'x', base_url: 'https://api.exemplo.com' })
      expect(res.status).toBe(201)
    })
  })

  describe('GET / e PATCH/DELETE', () => {
    it('GET / lista as APIs do tenant', async () => {
      setSupabase({ custom_apis: [{ data: [{ id: 'api-1', name: 'Minha IA' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/custom-apis')
      expect(res.body.apis).toHaveLength(1)
    })

    it('PATCH /:id revalida a URL quando ela é alterada', async () => {
      const app = buildApp()
      const res = await request(app).patch('/api/custom-apis/api-1').send({ base_url: 'http://192.168.0.1' })
      expect(res.status).toBe(500)
      expect(res.body.error).toMatch(/não permitido/)
    })

    it('PATCH /:id atualiza normalmente quando a URL não muda', async () => {
      setSupabase({ custom_apis: [{ data: { id: 'api-1', name: 'Novo nome' }, error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/custom-apis/api-1').send({ name: 'Novo nome' })
      expect(res.status).toBe(200)
    })

    it('DELETE /:id remove a API', async () => {
      setSupabase({})
      const app = buildApp()
      const res = await request(app).delete('/api/custom-apis/api-1')
      expect(res.status).toBe(200)
    })
  })

  describe('POST /:id/test', () => {
    it('retorna 404 quando a API não existe', async () => {
      setSupabase({ custom_apis: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/custom-apis/api-x/test')
      expect(res.status).toBe(404)
    })

    it('testa um provider OpenAI-like com Authorization Bearer', async () => {
      setSupabase({ custom_apis: [{ data: [{ id: 'api-1', base_url: 'https://api.exemplo.com', api_key: 'enc(sk-123)', provider: 'openai', model: 'gpt-4o-mini' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Olá!' } }] }) })

      const app = buildApp()
      const res = await request(app).post('/api/custom-apis/api-1/test').send({ message: 'oi' })

      expect(res.status).toBe(200)
      expect(res.body.reply).toBe('Olá!')
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.exemplo.com/chat/completions')
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-123')
    })

    it('testa um provider Claude com header x-api-key e endpoint /messages', async () => {
      setSupabase({ custom_apis: [{ data: [{ id: 'api-1', base_url: 'https://api.anthropic.com', api_key: 'enc(sk-ant)', provider: 'claude', model: 'claude-3-haiku-20240307' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: [{ text: 'Oi, tudo bem?' }] }) })

      const app = buildApp()
      const res = await request(app).post('/api/custom-apis/api-1/test').send({ message: 'oi' })

      expect(res.status).toBe(200)
      expect(res.body.reply).toBe('Oi, tudo bem?')
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/messages')
      expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant')
    })

    it('propaga o erro retornado pela API externa', async () => {
      setSupabase({ custom_apis: [{ data: [{ id: 'api-1', base_url: 'https://api.exemplo.com', api_key: null, provider: 'openai' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'chave inválida' } }) })

      const app = buildApp()
      const res = await request(app).post('/api/custom-apis/api-1/test').send({ message: 'oi' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('chave inválida')
    })
  })
})
