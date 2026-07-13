// Teste funcional: prova que billing.trialPlanPriceCents/trialDays/trialPlanTier são
// genuinamente config-driven de ponta a ponta — não só que config/index.js faz o parse
// correto (já coberto em config/__tests__/index.test.js), mas que routes/billing.js usa
// ESSES valores sem nenhum número "sobrando" hardcoded no meio do caminho. Para isso,
// usamos valores deliberadamente incomuns (nem o default 39700/7, nem os 49700/7 já
// usados em billing.test.js) — se algum trecho do código tivesse um valor fixo esquecido,
// este teste quebraria onde os outros (que reusam números "parecidos" com o default) não quebrariam.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const UNUSUAL_PRICE_CENTS = 128899 // R$ 1.288,99 — bem diferente do default (39700)
const UNUSUAL_TRIAL_DAYS = 23 // bem diferente do default (7)
const UNUSUAL_TIER = 'enterprise-custom'

const mockState = vi.hoisted(() => ({ box: {}, createCheckoutLink: null }))

vi.mock('../../config/index.js', () => ({
  config: {
    frontendUrl: 'https://app.exemplo.com',
    backendUrl: 'https://api.exemplo.com',
    billing: {
      trialPlanTier: 'enterprise-custom',
      trialPlanPriceCents: 128899,
      trialDays: 23,
    },
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

const { billingRouter } = await import('../../routes/billing.js')

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

describe('billing config-driven end-to-end (preço e duração do trial)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.createCheckoutLink = vi.fn().mockResolvedValue({ url: 'https://checkout.infinitepay.io/custom', invoiceSlug: 'custom' })
  })

  it('trial-signup usa exatamente config.billing.trialPlanPriceCents/trialPlanTier no link de checkout e no pedido salvo — nada hardcoded', async () => {
    setSupabase({
      users: [
        { data: [], error: null },
        { data: [{ id: 'user-cfg-1', tenant_id: 'tenant-cfg-1' }], error: null },
      ],
      tenants: [
        { data: [], error: null },
        { data: [{ id: 'tenant-cfg-1', name: 'Empresa Config' }], error: null },
      ],
      checkout_orders: [
        { data: [{ id: 'order-row-cfg-1' }], error: null },
        { data: [{}], error: null },
      ],
    })

    const app = buildApp()
    const res = await request(app).post('/api/billing/trial-signup').send({
      name: 'Carla', companyName: 'Empresa Config', email: 'carla@exemplo.com', password: 'senha1234',
    })

    expect(res.status).toBe(201)

    const checkoutArgs = mockState.createCheckoutLink.mock.calls[0][0]
    expect(checkoutArgs.amountCents).toBe(UNUSUAL_PRICE_CENTS)
    expect(checkoutArgs.description).toContain(UNUSUAL_TIER)

    const tenantInsert = supabaseMock.calls.find((c) => c.table === 'tenants' && c.method === 'insert')
    expect(tenantInsert.args[0]).toMatchObject({ plan: UNUSUAL_TIER })

    const orderInsert = supabaseMock.calls.find((c) => c.table === 'checkout_orders' && c.method === 'insert')
    expect(orderInsert.args[0]).toMatchObject({ plan: UNUSUAL_TIER, amount_cents: UNUSUAL_PRICE_CENTS })
  })

  it('o webhook só confirma o pagamento quando o valor pago bate com config.billing.trialPlanPriceCents, e calcula trial_ends_at a partir de config.billing.trialDays (não do default de 7 dias)', async () => {
    setSupabase({
      checkout_orders: [{
        data: [{
          id: 'order-cfg-1', order_nsu: 'order-cfg-1', webhook_token: 'token-cfg',
          amount_cents: UNUSUAL_PRICE_CENTS, status: 'pending', tenant_id: 'tenant-cfg-1', user_id: 'user-cfg-1',
        }], error: null,
      }],
      tenants: [{ data: [{}], error: null }],
    })

    const app = buildApp()

    // valor pago igual ao default (39700) — mas config está com 128899: deve ser REJEITADO,
    // provando que a comparação usa o valor configurado, não o hardcoded 39700.
    const wrongAmountRes = await request(app)
      .post('/api/billing/webhook?token=token-cfg')
      .send({ order_nsu: 'order-cfg-1', paid_amount: 39700 })
    expect(wrongAmountRes.status).toBe(200)
    expect(supabaseMock.calls.filter((c) => c.table === 'checkout_orders' && c.method === 'update').length).toBe(0)

    // valor pago batendo com o preço configurado (não-default) — deve confirmar
    const okRes = await request(app)
      .post('/api/billing/webhook?token=token-cfg')
      .send({ order_nsu: 'order-cfg-1', paid_amount: UNUSUAL_PRICE_CENTS })
    expect(okRes.status).toBe(200)

    const tenantUpdate = supabaseMock.calls.find((c) => c.table === 'tenants' && c.method === 'update')
    expect(tenantUpdate.args[0]).toMatchObject({ status: 'trial', payment_status: 'paid' })

    const trialEndsAtMs = new Date(tenantUpdate.args[0].trial_ends_at).getTime()
    const expectedMs = Date.now() + UNUSUAL_TRIAL_DAYS * 24 * 60 * 60 * 1000
    // tolerância de 5s para o tempo de execução do teste
    expect(Math.abs(trialEndsAtMs - expectedMs)).toBeLessThan(5000)
    // confirma que NÃO é o default de 7 dias (regressão: se alguém hardcodasse 7 em vez de
    // usar config.billing.trialDays, este teste pegaria)
    const sevenDaysMs = Date.now() + 7 * 24 * 60 * 60 * 1000
    expect(Math.abs(trialEndsAtMs - sevenDaysMs)).toBeGreaterThan(24 * 60 * 60 * 1000)
  })
})
