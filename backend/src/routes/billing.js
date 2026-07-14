import { Router } from 'express'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { config } from '../config/index.js'
import { supabase, unwrap } from '../db/supabase.js'
import { hashPassword, signToken } from '../services/auth.js'
import { logUsage } from '../services/usage.js'
import { createCheckoutLink } from '../services/infinitepay.js'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
}

export const billingRouter = Router()

const signupSchema = z.object({
  name: z.string().min(2),
  companyName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8).optional(),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.'),
})

// POST /api/billing/trial-signup — cria tenant pendente de pagamento + link de checkout
billingRouter.post('/trial-signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos. Verifique os campos.' })
  }
  const { name, companyName, email, phone, password } = parsed.data
  const normalizedEmail = email.toLowerCase().trim()

  try {
    const existing = unwrap(
      await supabase.from('users').select('id').eq('email', normalizedEmail).limit(1)
    )
    if (existing?.length) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' })
    }

    const baseSlug = companyName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const slugCheck = unwrap(
      await supabase.from('tenants').select('slug').like('slug', `${baseSlug}%`)
    )
    const slug = slugCheck?.length ? `${baseSlug}-${slugCheck.length}` : baseSlug

    const tenants = unwrap(
      await supabase
        .from('tenants')
        .insert({ name: companyName, slug, status: 'pending_payment', plan: config.billing.trialPlanTier, onboarding_completed: false })
        .select()
    )
    const tenant = tenants?.[0]
    if (!tenant) return res.status(500).json({ error: 'Erro ao criar conta. Tente novamente.' })

    const password_hash = await hashPassword(password)
    const { data: userRows, error: userErr } = await supabase
      .from('users')
      .insert({ tenant_id: tenant.id, email: normalizedEmail, password_hash, name, role: 'admin' })
      .select()
    const user = userRows?.[0]
    // sem transação multi-tabela via REST: se a criação do usuário falhar, desfaz o
    // tenant recém-criado para não deixar um tenant "pending_payment" órfão (sem
    // nenhum usuário e sem pedido de checkout) no banco.
    if (userErr || !user) {
      await supabase.from('tenants').delete().eq('id', tenant.id)
      if (userErr?.code === '23505') return res.status(409).json({ error: 'Este e-mail já está cadastrado.' })
      return res.status(500).json({ error: 'Erro ao criar usuário. Tente novamente.' })
    }

    const orderNsu = `trial-${tenant.id}-${randomUUID()}`
    const amountCents = config.billing.trialPlanPriceCents
    // Token só conhecido pelo backend e pela InfinitePay (vai na webhook_url que
    // registramos na criação do link) — nunca é devolvido ao cliente. Sem isso,
    // qualquer um poderia chamar /webhook direto com o order_nsu (que É devolvido
    // ao cliente logo abaixo, pra permitir o polling de status) e "confirmar"
    // um pagamento que nunca aconteceu.
    const webhookToken = randomUUID()

    unwrap(
      await supabase.from('checkout_orders').insert({
        tenant_id: tenant.id,
        user_id: user.id,
        order_nsu: orderNsu,
        plan: config.billing.trialPlanTier,
        amount_cents: amountCents,
        status: 'pending',
        webhook_token: webhookToken,
      })
    )

    const redirectUrl = `${config.frontendUrl}/pagamento/retorno?order_nsu=${orderNsu}`
    const webhookUrl = `${config.backendUrl}/api/billing/webhook?token=${webhookToken}`

    const { url, invoiceSlug } = await createCheckoutLink({
      orderNsu,
      amountCents,
      description: `Assinatura mensal — SDR IA (${config.billing.trialPlanTier})`,
      customer: { name, email: normalizedEmail, phone_number: phone },
      redirectUrl,
      webhookUrl,
    })

    unwrap(
      await supabase.from('checkout_orders')
        .update({ checkout_url: url, infinitepay_slug: invoiceSlug })
        .eq('order_nsu', orderNsu)
    )

    await logUsage(tenant.id, user.id, 'trial_signup')

    res.status(201).json({ checkoutUrl: url, orderNsu })
  } catch (e) {
    console.error('[billing/trial-signup]', e.message)
    res.status(500).json({ error: e.message || 'Erro interno. Tente novamente.' })
  }
})

// GET /api/billing/orders/:orderNsu/status — poll de confirmação de pagamento (auto-login quando pago)
billingRouter.get('/orders/:orderNsu/status', async (req, res) => {
  try {
    const orders = unwrap(
      await supabase.from('checkout_orders').select('*').eq('order_nsu', req.params.orderNsu).limit(1)
    )
    const order = orders?.[0]
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' })

    if (order.status !== 'paid') {
      return res.json({ status: order.status })
    }

    const usersRows = unwrap(
      await supabase.from('users').select('*').eq('id', order.user_id).limit(1)
    )
    const user = usersRows?.[0]
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    const tenantsRows = unwrap(
      await supabase.from('tenants').select('name, slug, onboarding_completed').eq('id', order.tenant_id).limit(1)
    )
    const tenant = tenantsRows?.[0]

    const token = signToken({ sub: user.id, role: user.role, tenantId: user.tenant_id })
    res.cookie('sdr_token', token, COOKIE_OPTS)
    res.json({
      status: 'paid',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenant_id,
        tenantName: tenant?.name || null,
        tenantSlug: tenant?.slug || null,
        onboardingCompleted: tenant?.onboarding_completed ?? false,
      },
    })
  } catch (e) {
    console.error('[billing/order-status]', e.message)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/billing/webhook — chamado pela InfinitePay ao confirmar pagamento.
// Sem assinatura documentada pela InfinitePay: validamos por order_nsu (imprevisível,
// gerado por nós) + conferência exata do valor pago. Responde rápido e sempre 200
// (mesmo em payload inválido/pedido desconhecido) para não gerar retry-storm — a
// InfinitePay reenvia em caso de erro 400, o que não ajuda pedidos que nunca existiram.
billingRouter.post('/webhook', async (req, res) => {
  try {
    const { order_nsu, transaction_nsu, receipt_url, invoice_slug } = req.body || {}
    const paidAmount = req.body?.paid_amount ?? req.body?.amount
    if (!order_nsu) return res.json({ ok: true })

    const orders = unwrap(
      await supabase.from('checkout_orders').select('*').eq('order_nsu', order_nsu).limit(1)
    )
    const order = orders?.[0]
    if (!order) {
      console.warn('[billing/webhook] pedido desconhecido:', order_nsu)
      return res.json({ ok: true })
    }
    // order_nsu é devolvido ao cliente pra permitir o polling de status — não é
    // segredo. O webhook_token só existe na webhook_url enviada à InfinitePay
    // (nunca ao cliente), então valida que a chamada realmente veio de lá.
    if (!order.webhook_token || req.query.token !== order.webhook_token) {
      console.warn('[billing/webhook] token inválido ou ausente para pedido:', order_nsu)
      return res.json({ ok: true })
    }
    if (order.status === 'paid') {
      return res.json({ ok: true }) // já processado, idempotente
    }
    if (Number(paidAmount) !== Number(order.amount_cents)) {
      console.error('[billing/webhook] valor pago diverge do esperado:', { order_nsu, esperado: order.amount_cents, recebido: paidAmount })
      return res.json({ ok: true })
    }

    const paidAt = new Date().toISOString()
    // .eq('status', 'pending') torna isso um "claim" atômico (mesmo padrão do
    // scheduler.js) — sem ele, duas entregas quase simultâneas do mesmo
    // webhook (retry de rede da InfinitePay) passavam ambas pela checagem
    // `order.status === 'paid'` acima antes de qualquer UPDATE confirmar,
    // duplicando o registro em usage_events.
    const claimed = unwrap(
      await supabase.from('checkout_orders').update({
        status: 'paid',
        paid_at: paidAt,
        transaction_nsu: transaction_nsu || null,
        receipt_url: receipt_url || null,
        infinitepay_slug: invoice_slug || order.infinitepay_slug,
      }).eq('id', order.id).eq('status', 'pending').select('id')
    )
    if (!claimed?.length) {
      // outra entrega concorrente do mesmo webhook já processou este pedido
      return res.json({ ok: true })
    }

    const trialEndsAt = new Date(Date.now() + config.billing.trialDays * 24 * 60 * 60 * 1000).toISOString()
    unwrap(
      await supabase.from('tenants').update({
        status: 'trial',
        payment_status: 'paid',
        trial_ends_at: trialEndsAt,
      }).eq('id', order.tenant_id)
    )

    await logUsage(order.tenant_id, order.user_id, 'trial_payment_confirmed')

    res.json({ ok: true })
  } catch (e) {
    console.error('[billing/webhook]', e.message)
    res.json({ ok: true }) // não retorna erro pra evitar retries infinitos da InfinitePay
  }
})
