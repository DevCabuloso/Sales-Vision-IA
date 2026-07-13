import { config } from '../config/index.js'

/**
 * Cria um link de checkout na InfinitePay (Checkout Integrado).
 * A API não exige API key — só o @handle (InfiniteTag) do recebedor.
 * Doc: https://docs.infinitepay.io (POST /links)
 */
export async function createCheckoutLink({ orderNsu, amountCents, description, customer, redirectUrl, webhookUrl }) {
  if (!config.infinitepay.handle) {
    throw new Error('INFINITEPAY_HANDLE não configurado no .env')
  }

  const body = {
    handle: config.infinitepay.handle,
    order_nsu: orderNsu,
    redirect_url: redirectUrl,
    webhook_url: webhookUrl,
    items: [{ quantity: 1, price: amountCents, description }],
  }
  if (customer?.name || customer?.email || customer?.phone_number) {
    body.customer = customer
  }

  const r = await fetch(config.infinitepay.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // Sem timeout, uma InfinitePay lenta/instável pendura a requisição de
    // checkout indefinidamente (o cliente fica esperando o link de pagamento).
    signal: AbortSignal.timeout(15000),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data.url) {
    throw new Error(data.message || `InfinitePay erro ${r.status}`)
  }
  return { url: data.url, invoiceSlug: data.slug || data.invoice_slug || null }
}
