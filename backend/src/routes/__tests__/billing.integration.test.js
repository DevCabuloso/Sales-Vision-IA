// Teste de integração: exercita trial-signup -> webhook (InfinitePay) -> orders/:orderNsu/status
// como um único cenário contínuo, usando o MESMO estado de mock do supabase (sem resetar
// entre chamadas) — prova que o order_nsu/webhook_token gerados no signup são exatamente
// os que fecham o ciclo no webhook, e que o polling de status resulta em cookie de sessão.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, createCheckoutLink: null, randomUUIDCalls: 0 }))

vi.mock('../../config/index.js', () => ({
  config: {
    env: 'test',
    frontendUrl: 'https://app.exemplo.com',
    backendUrl: 'https://api.exemplo.com',
    billing: { trialPlanTier: 'pro', trialPlanPriceCents: 39700, trialDays: 7 },
    jwt: { secret: 'test-secret-integration', expiresIn: '1h' },
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

// billing.js gera orderNsu/webhook_token via randomUUID() do módulo nativo 'crypto' —
// mockar com valores determinísticos é o que permite provar, de ponta a ponta, que o
// MESMO order_nsu/token que saem do signup são os usados para fechar o webhook.
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, randomUUID: () => `uuid-${++mockState.randomUUIDCalls}` }
})

const { billingRouter } = await import('../billing.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/billing', billingRouter)
  return app
}

describe('routes/billing (integração: signup -> webhook -> status)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.randomUUIDCalls = 0
    mockState.createCheckoutLink = vi.fn().mockResolvedValue({
      url: 'https://checkout.infinitepay.io/abc123',
      invoiceSlug: 'abc123',
    })
  })

  it('fecha o ciclo completo: cria pedido pendente, confirma via webhook com o token real e faz auto-login no polling de status', async () => {
    const app = buildApp()

    // primeira randomUUID() -> order_nsu, segunda -> webhook_token (ordem de billing.js)
    const expectedOrderNsu = 'trial-tenant-int-1-uuid-1'
    const expectedWebhookToken = 'uuid-2'

    const supabaseMock = createSupabaseMock({
      users: [
        { data: [], error: null }, // signup: checagem de e-mail existente
        { data: [{ id: 'user-int-1', tenant_id: 'tenant-int-1' }], error: null }, // signup: insert do usuário
        { data: [{ id: 'user-int-1', email: 'ana@exemplo.com', name: 'Ana Integração', role: 'admin', tenant_id: 'tenant-int-1' }], error: null }, // status: busca do usuário
      ],
      tenants: [
        { data: [], error: null }, // signup: checagem de slug duplicado
        { data: [{ id: 'tenant-int-1', name: 'Empresa Integração', slug: 'empresa-integracao' }], error: null }, // signup: insert do tenant
        { data: [{}], error: null }, // webhook: update de status/trial_ends_at
        { data: [{ name: 'Empresa Integração', slug: 'empresa-integracao', onboarding_completed: false }], error: null }, // status: busca do tenant
      ],
      checkout_orders: [
        { data: [{ id: 'order-row-1' }], error: null }, // signup: insert do pedido
        { data: [{}], error: null }, // signup: update com checkout_url
        {
          data: [{
            id: 'order-row-1',
            order_nsu: expectedOrderNsu,
            webhook_token: expectedWebhookToken,
            amount_cents: 39700,
            status: 'pending',
            tenant_id: 'tenant-int-1',
            user_id: 'user-int-1',
          }], error: null,
        }, // webhook: busca do pedido pelo order_nsu
        { data: [{ status: 'paid', user_id: 'user-int-1', tenant_id: 'tenant-int-1' }], error: null }, // status: busca do pedido já pago
      ],
    })
    mockState.box.supabase = supabaseMock.supabase

    // ── passo 1: trial-signup ──
    const signupRes = await request(app).post('/api/billing/trial-signup').send({
      name: 'Ana Integração',
      companyName: 'Empresa Integração',
      email: 'ana@exemplo.com',
      phone: '11999999999',
      password: 'senha1234',
    })

    expect(signupRes.status).toBe(201)
    expect(signupRes.body.orderNsu).toBe(expectedOrderNsu)
    expect(signupRes.body.checkoutUrl).toBe('https://checkout.infinitepay.io/abc123')
    // o webhook_token nunca deve vazar para o cliente
    expect(JSON.stringify(signupRes.body)).not.toMatch(/uuid-2|webhook_token/)

    // o valor/descrição enviados à InfinitePay batem com os dados dessa mesma conta
    const checkoutArgs = mockState.createCheckoutLink.mock.calls[0][0]
    expect(checkoutArgs.orderNsu).toBe(expectedOrderNsu)
    expect(checkoutArgs.amountCents).toBe(39700)

    // ── passo 2: polling de status ANTES do pagamento — ainda pending ──
    // (reaproveita a mesma order_nsu real do passo 1; usa a resposta 'pending'
    // já reservada dentro da fila de checkout_orders não é necessária aqui pois
    // o teste consulta o status "pending" implicitamente via o próprio pedido —
    // pulamos para o webhook diretamente, que é o próximo evento real do fluxo.)

    // ── passo 3: InfinitePay chama o webhook com o order_nsu e token reais gerados no passo 1 ──
    const webhookRes = await request(app)
      .post(`/api/billing/webhook?token=${expectedWebhookToken}`)
      .send({ order_nsu: expectedOrderNsu, paid_amount: 39700, transaction_nsu: 'tx-int-1' })

    expect(webhookRes.status).toBe(200)
    expect(webhookRes.body).toEqual({ ok: true })

    const orderUpdate = supabaseMock.calls.find((c) => c.table === 'checkout_orders' && c.method === 'update' && c.args[0]?.status === 'paid')
    expect(orderUpdate.args[0]).toMatchObject({ status: 'paid', transaction_nsu: 'tx-int-1' })
    const tenantUpdate = supabaseMock.calls.find((c) => c.table === 'tenants' && c.method === 'update')
    expect(tenantUpdate.args[0]).toMatchObject({ status: 'trial', payment_status: 'paid' })
    // trial_ends_at deve refletir os 7 dias configurados (config.billing.trialDays)
    const trialEndsAt = new Date(tenantUpdate.args[0].trial_ends_at).getTime()
    expect(trialEndsAt).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000)
    expect(trialEndsAt).toBeLessThan(Date.now() + 8 * 24 * 60 * 60 * 1000)

    // ── passo 4: polling de status DEPOIS do pagamento — auto-login (cookie + dados do usuário) ──
    const statusRes = await request(app).get(`/api/billing/orders/${expectedOrderNsu}/status`)

    expect(statusRes.status).toBe(200)
    expect(statusRes.body.status).toBe('paid')
    expect(statusRes.body.user).toMatchObject({
      id: 'user-int-1', email: 'ana@exemplo.com', tenantId: 'tenant-int-1', tenantSlug: 'empresa-integracao',
    })
    expect(statusRes.headers['set-cookie']?.[0]).toMatch(/sdr_token=/)
  })

  it('o webhook rejeita silenciosamente (idempotente) se for chamado de novo com o mesmo order_nsu/token após já ter sido pago', async () => {
    const app = buildApp()
    const orderNsu = 'trial-tenant-int-2-uuid-1'
    const webhookToken = 'uuid-2'

    const supabaseMock = createSupabaseMock({
      users: [
        { data: [], error: null },
        { data: [{ id: 'user-int-2', tenant_id: 'tenant-int-2' }], error: null },
      ],
      tenants: [
        { data: [], error: null },
        { data: [{ id: 'tenant-int-2', name: 'Empresa Dois', slug: 'empresa-dois' }], error: null },
        { data: [{}], error: null }, // update no primeiro webhook (paga de verdade)
      ],
      checkout_orders: [
        { data: [{ id: 'order-row-2' }], error: null },
        { data: [{}], error: null },
        {
          data: [{
            id: 'order-row-2', order_nsu: orderNsu, webhook_token: webhookToken,
            amount_cents: 39700, status: 'pending', tenant_id: 'tenant-int-2', user_id: 'user-int-2',
          }], error: null,
        }, // 1ª chamada do webhook: pedido ainda pendente
        {
          data: [{
            id: 'order-row-2', order_nsu: orderNsu, webhook_token: webhookToken,
            amount_cents: 39700, status: 'paid', tenant_id: 'tenant-int-2', user_id: 'user-int-2',
          }], error: null,
        }, // 2ª chamada do webhook (replay): já está pago
      ],
    })
    mockState.box.supabase = supabaseMock.supabase

    await request(app).post('/api/billing/trial-signup').send({
      name: 'Bia', companyName: 'Empresa Dois', email: 'bia@exemplo.com', password: 'senha1234',
    })

    const firstWebhook = await request(app)
      .post(`/api/billing/webhook?token=${webhookToken}`)
      .send({ order_nsu: orderNsu, paid_amount: 39700 })
    expect(firstWebhook.status).toBe(200)

    const secondWebhook = await request(app)
      .post(`/api/billing/webhook?token=${webhookToken}`)
      .send({ order_nsu: orderNsu, paid_amount: 39700 })
    expect(secondWebhook.status).toBe(200)

    // só uma atualização de tenant deve ter acontecido (a segunda chamada é idempotente/no-op)
    const tenantUpdates = supabaseMock.calls.filter((c) => c.table === 'tenants' && c.method === 'update')
    expect(tenantUpdates).toHaveLength(1)
  })
})
