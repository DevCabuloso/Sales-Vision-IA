import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {} }))

vi.mock('../../config/index.js', () => ({
  config: {
    frontendUrl: 'https://app.exemplo.com',
    backendUrl: 'https://api.exemplo.com',
    billing: { trialPlanTier: 'pro', trialPlanPriceCents: 49700, trialDays: 7 },
    jwt: { secret: 'test-secret', expiresIn: '1h' },
  },
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../../services/infinitepay.js', () => ({
  createCheckoutLink: (...args) => mockState.createCheckoutLink(...args),
}))

const { billingRouter } = await import('../billing.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/billing', billingRouter)
  return app
}

let supabaseMock

function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

describe('routes/billing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.createCheckoutLink = vi.fn()
  })

  describe('POST /trial-signup', () => {
    const validPayload = {
      name: 'Ana Souza',
      companyName: 'Empresa Ana',
      email: 'ana@exemplo.com',
      phone: '11999999999',
      password: 'senha1234',
    }

    it('rejeita payload inválido com 400', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/billing/trial-signup').send({ email: 'invalido' })
      expect(res.status).toBe(400)
    })

    it('rejeita e-mail já cadastrado com 409', async () => {
      setSupabase({ users: [{ data: [{ id: 'existing' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/billing/trial-signup').send(validPayload)
      expect(res.status).toBe(409)
    })

    it('cria tenant/usuário/pedido e retorna a URL de checkout sem expor o webhook_token', async () => {
      setSupabase({
        users: [
          { data: [], error: null }, // checagem de e-mail existente
          { data: [{ id: 'user-1', tenant_id: 'tenant-1' }], error: null }, // insert de usuário
        ],
        tenants: [
          { data: [], error: null }, // checagem de slug duplicado
          { data: [{ id: 'tenant-1', name: 'Empresa Ana' }], error: null }, // insert do tenant
        ],
        checkout_orders: [
          { data: [{ id: 'order-row-1' }], error: null }, // insert do pedido
          { data: [{}], error: null }, // update com checkout_url
        ],
      })
      mockState.createCheckoutLink.mockResolvedValue({ url: 'https://checkout.infinitepay.io/xyz', invoiceSlug: 'xyz' })

      const app = buildApp()
      const res = await request(app).post('/api/billing/trial-signup').send(validPayload)

      expect(res.status).toBe(201)
      expect(res.body.checkoutUrl).toBe('https://checkout.infinitepay.io/xyz')
      expect(res.body.orderNsu).toMatch(/^trial-tenant-1-/)
      expect(JSON.stringify(res.body)).not.toMatch(/webhook_token|webhookToken/)

      const checkoutCall = mockState.createCheckoutLink.mock.calls[0][0]
      expect(checkoutCall.webhookUrl).toMatch(/^https:\/\/api\.exemplo\.com\/api\/billing\/webhook\?token=/)
      expect(checkoutCall.amountCents).toBe(49700)
    })

    // Regressão: sem transação multi-tabela via REST, se o insert do usuário falhar depois
    // do tenant "pending_payment" já ter sido criado, o tenant ficava órfão no banco.
    it('desfaz o tenant recém-criado quando a criação do usuário admin falha', async () => {
      setSupabase({
        users: [
          { data: [], error: null }, // checagem de e-mail existente
          { data: null, error: { message: 'insert failed', code: '23502' } }, // insert de usuário falha
        ],
        tenants: [
          { data: [], error: null }, // checagem de slug duplicado
          { data: [{ id: 'tenant-1', name: 'Empresa Ana' }], error: null }, // insert do tenant
        ],
      })
      const app = buildApp()
      const res = await request(app).post('/api/billing/trial-signup').send(validPayload)

      expect(res.status).toBe(500)
      const tenantDelete = supabaseMock.calls.find((c) => c.table === 'tenants' && c.method === 'delete')
      expect(tenantDelete).toBeTruthy()
      expect(mockState.createCheckoutLink).not.toHaveBeenCalled()
    })
  })

  describe('GET /orders/:orderNsu/status', () => {
    it('retorna 404 quando o pedido não existe', async () => {
      setSupabase({ checkout_orders: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/billing/orders/nao-existe/status')
      expect(res.status).toBe(404)
    })

    it('retorna apenas o status quando o pedido ainda não foi pago', async () => {
      setSupabase({ checkout_orders: [{ data: [{ status: 'pending' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/billing/orders/order-x/status')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: 'pending' })
    })

    it('faz auto-login (seta cookie) quando o pedido está pago', async () => {
      setSupabase({
        checkout_orders: [{ data: [{ status: 'paid', user_id: 'user-1', tenant_id: 'tenant-1' }], error: null }],
        users: [{ data: [{ id: 'user-1', email: 'ana@exemplo.com', name: 'Ana', role: 'admin', tenant_id: 'tenant-1' }], error: null }],
        tenants: [{ data: [{ name: 'Empresa Ana', slug: 'empresa-ana', onboarding_completed: false }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).get('/api/billing/orders/order-pago/status')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('paid')
      expect(res.body.user.email).toBe('ana@exemplo.com')
      expect(res.headers['set-cookie']?.[0]).toMatch(/sdr_token=/)
    })
  })

  describe('POST /webhook (confirmação de pagamento InfinitePay)', () => {
    it('ignora silenciosamente (200 ok) quando order_nsu não é enviado', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/billing/webhook').send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
    })

    it('ignora silenciosamente quando o pedido não existe', async () => {
      setSupabase({ checkout_orders: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/billing/webhook').send({ order_nsu: 'inexistente', paid_amount: 100 })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
    })

    it('rejeita silenciosamente quando o token da query não bate com o webhook_token do pedido (previne pagamento forjado)', async () => {
      setSupabase({
        checkout_orders: [{ data: [{ id: 'o1', order_nsu: 'order-1', webhook_token: 'token-correto', amount_cents: 49700, status: 'pending' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/billing/webhook?token=token-errado')
        .send({ order_nsu: 'order-1', paid_amount: 49700 })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      // não deve ter tentado atualizar o pedido para "paid"
      const updateCalls = supabaseMock.calls.filter((c) => c.table === 'checkout_orders' && c.method === 'update')
      expect(updateCalls.length).toBe(0)
    })

    it('rejeita quando o token não é enviado', async () => {
      setSupabase({
        checkout_orders: [{ data: [{ id: 'o1', order_nsu: 'order-1', webhook_token: 'token-correto', amount_cents: 49700, status: 'pending' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/billing/webhook')
        .send({ order_nsu: 'order-1', paid_amount: 49700 })

      expect(res.status).toBe(200)
      const updateCalls = supabaseMock.calls.filter((c) => c.table === 'checkout_orders' && c.method === 'update')
      expect(updateCalls.length).toBe(0)
    })

    it('rejeita quando o valor pago diverge do valor esperado (previne pagamento parcial/forjado)', async () => {
      setSupabase({
        checkout_orders: [{ data: [{ id: 'o1', order_nsu: 'order-1', webhook_token: 'token-correto', amount_cents: 49700, status: 'pending' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/billing/webhook?token=token-correto')
        .send({ order_nsu: 'order-1', paid_amount: 100 })

      expect(res.status).toBe(200)
      const updateCalls = supabaseMock.calls.filter((c) => c.table === 'checkout_orders' && c.method === 'update')
      expect(updateCalls.length).toBe(0)
    })

    it('é idempotente: não reprocessa pedido já marcado como pago', async () => {
      setSupabase({
        checkout_orders: [{ data: [{ id: 'o1', order_nsu: 'order-1', webhook_token: 'token-correto', amount_cents: 49700, status: 'paid' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/billing/webhook?token=token-correto')
        .send({ order_nsu: 'order-1', paid_amount: 49700 })

      expect(res.status).toBe(200)
      const updateCalls = supabaseMock.calls.filter((c) => c.table === 'checkout_orders' && c.method === 'update')
      expect(updateCalls.length).toBe(0)
    })

    it('não duplica o processamento quando perde a corrida do claim atômico (duas entregas quase simultâneas do mesmo webhook)', async () => {
      setSupabase({
        checkout_orders: [
          { data: [{ id: 'o1', order_nsu: 'order-1', webhook_token: 'token-correto', amount_cents: 49700, status: 'pending', tenant_id: 'tenant-1', user_id: 'user-1' }], error: null },
          { data: [], error: null }, // UPDATE ... WHERE status='pending' não afetou nenhuma linha (a outra entrega já confirmou)
        ],
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/billing/webhook?token=token-correto')
        .send({ order_nsu: 'order-1', paid_amount: 49700 })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      const tenantUpdate = supabaseMock.calls.find((c) => c.table === 'tenants' && c.method === 'update')
      expect(tenantUpdate).toBeUndefined() // não ativa o trial de novo — quem ganhou a corrida já fez isso
    })

    it('confirma o pagamento e ativa o trial quando token e valor conferem', async () => {
      setSupabase({
        checkout_orders: [
          { data: [{ id: 'o1', order_nsu: 'order-1', webhook_token: 'token-correto', amount_cents: 49700, status: 'pending', tenant_id: 'tenant-1', user_id: 'user-1' }], error: null },
        ],
        tenants: [{ data: [{}], error: null }],
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/billing/webhook?token=token-correto')
        .send({ order_nsu: 'order-1', paid_amount: 49700, transaction_nsu: 'tx-1' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })

      const orderUpdate = supabaseMock.calls.find((c) => c.table === 'checkout_orders' && c.method === 'update')
      expect(orderUpdate.args[0]).toMatchObject({ status: 'paid', transaction_nsu: 'tx-1' })

      const tenantUpdate = supabaseMock.calls.find((c) => c.table === 'tenants' && c.method === 'update')
      expect(tenantUpdate.args[0]).toMatchObject({ status: 'trial', payment_status: 'paid' })
    })
  })
})
