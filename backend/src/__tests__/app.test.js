import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createSupabaseMock } from '../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {} }))

vi.mock('../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

const { createApp } = await import('../app.js')

function setSupabase(responses) {
  const mock = createSupabaseMock(responses)
  mockState.box.supabase = mock.supabase
  return mock
}

describe('app.js — createApp()', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV
  })

  describe('GET /api/health', () => {
    it('retorna ok=true quando o supabase responde sem erro', async () => {
      setSupabase({ tenants: [{ data: [{ id: 't1' }], error: null }] })
      const app = createApp()
      const res = await request(app).get('/api/health')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.supabase).toBe('conectado')
    })

    it('retorna 503 quando o supabase responde com erro', async () => {
      setSupabase({ tenants: [{ data: null, error: { message: 'timeout' } }] })
      const app = createApp()
      const res = await request(app).get('/api/health')
      expect(res.status).toBe(503)
      expect(res.body.ok).toBe(false)
      expect(res.body.supabase).toContain('timeout')
    })
  })

  describe('rota inexistente', () => {
    it('retorna 404 com mensagem padrão', async () => {
      setSupabase({})
      const app = createApp()
      const res = await request(app).get('/api/rota-que-nao-existe')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Rota não encontrada.')
    })
  })

  describe('cabeçalhos de segurança (helmet)', () => {
    it('inclui cabeçalhos de segurança padrão do helmet', async () => {
      setSupabase({ tenants: [{ data: [], error: null }] })
      const app = createApp()
      const res = await request(app).get('/api/health')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['x-dns-prefetch-control']).toBeDefined()
    })
  })

  // Roda antes de "rate limiting do login" de propósito: o authLimiter é criado uma
  // única vez no módulo de app.js (fora de createApp()), então seu contador é
  // compartilhado por todas as chamadas de createApp() deste arquivo — se o teste de
  // rate limiting (21 tentativas) rodasse antes, estes dois testes tomariam 429 em
  // vez do 500 esperado.
  describe('sanitização de erro em produção', () => {
    it('em produção, mensagens de erro internas (>=500) viram texto genérico', async () => {
      process.env.NODE_ENV = 'production'
      setSupabase({ users: [{ data: null, error: { message: 'detalhe interno sensível' } }] })
      const app = createApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'a@a.com', password: 'x' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Erro interno do servidor.')
      expect(res.body.error).not.toContain('detalhe interno sensível')
    })

    it('fora de produção, a mensagem de erro original é mantida', async () => {
      process.env.NODE_ENV = 'test'
      setSupabase({ users: [{ data: null, error: { message: 'detalhe interno sensível' } }] })
      const app = createApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'a@a.com', password: 'x' })
      expect(res.status).toBe(500)
      expect(res.body.error).toContain('detalhe interno sensível')
    })
  })

  describe('rate limiting do login', () => {
    it('bloqueia com 429 após exceder o limite de 20 tentativas em 15 min', async () => {
      setSupabase({ users: [{ data: null, error: { message: 'not found' } }] })
      const app = createApp()
      let lastStatus
      for (let i = 0; i < 21; i++) {
        // limite é por app (rate-limit fica no middleware do createApp), reaproveita o mesmo `app`
        const res = await request(app).post('/api/auth/login').send({ email: 'a@a.com', password: 'x' })
        lastStatus = res.status
      }
      expect(lastStatus).toBe(429)
    }, 15000)
  })

  // Roda depois do teste acima de propósito: o authLimiter é compartilhado por IP entre
  // TODAS as rotas em que é montado (não por rota), então o contador já esgotado pelo
  // teste de login acima também bloqueia /api/auth/change-password aqui.
  describe('rate limiting de change-password e webhooks', () => {
    it('change-password é coberto pelo mesmo authLimiter do login (contador já esgotado)', async () => {
      const app = createApp()
      const res = await request(app).post('/api/auth/change-password').send({ currentPassword: 'x', newPassword: 'y12345678' })
      expect(res.status).toBe(429)
    })

    it('/webhooks tem rate limit próprio (teto de 300/min, distinto do apiLimiter)', async () => {
      setSupabase({})
      const app = createApp()
      const res = await request(app).get('/webhooks/ping')
      expect(res.status).toBe(200)
      expect(res.headers['ratelimit-limit']).toBe('300')
    })
  })
})
