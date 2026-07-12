import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../config/index.js', () => ({
  config: {
    infinitepay: { handle: 'meu-handle', apiUrl: 'https://api.checkout.infinitepay.io/links' },
  },
}))

import { config } from '../../config/index.js'
import { createCheckoutLink } from '../infinitepay.js'

describe('infinitepay service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    config.infinitepay.handle = 'meu-handle'
  })

  it('lança erro quando INFINITEPAY_HANDLE não está configurado', async () => {
    config.infinitepay.handle = ''
    await expect(createCheckoutLink({ orderNsu: 'x', amountCents: 100, description: 'd' }))
      .rejects.toThrow('INFINITEPAY_HANDLE não configurado no .env')
  })

  it('cria o link de checkout e envia o body correto para a API', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.infinitepay.io/abc', slug: 'abc' }),
    })

    const result = await createCheckoutLink({
      orderNsu: 'order-1',
      amountCents: 49700,
      description: 'Assinatura mensal',
      customer: { name: 'Ana', email: 'ana@ex.com' },
      redirectUrl: 'https://app.exemplo.com/retorno',
      webhookUrl: 'https://api.exemplo.com/webhook?token=abc',
    })

    expect(result).toEqual({ url: 'https://checkout.infinitepay.io/abc', invoiceSlug: 'abc' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.checkout.infinitepay.io/links')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.handle).toBe('meu-handle')
    expect(body.order_nsu).toBe('order-1')
    expect(body.items).toEqual([{ quantity: 1, price: 49700, description: 'Assinatura mensal' }])
    expect(body.customer).toEqual({ name: 'Ana', email: 'ana@ex.com' })
  })

  it('não inclui customer no body quando nenhum dado de cliente é fornecido', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.infinitepay.io/abc' }),
    })

    await createCheckoutLink({ orderNsu: 'order-2', amountCents: 1000, description: 'd', customer: {} })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.customer).toBeUndefined()
  })

  it('usa invoice_slug como fallback quando "slug" não vem na resposta', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.infinitepay.io/abc', invoice_slug: 'inv-abc' }),
    })

    const result = await createCheckoutLink({ orderNsu: 'order-3', amountCents: 1000, description: 'd' })
    expect(result.invoiceSlug).toBe('inv-abc')
  })

  it('lança erro com a mensagem da API quando a resposta não é ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'handle inválido' }),
    })

    await expect(createCheckoutLink({ orderNsu: 'order-4', amountCents: 1000, description: 'd' }))
      .rejects.toThrow('handle inválido')
  })

  it('lança erro genérico com status quando a API não retorna "url" nem "message"', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await expect(createCheckoutLink({ orderNsu: 'order-5', amountCents: 1000, description: 'd' }))
      .rejects.toThrow('InfinitePay erro 200')
  })

  it('trata resposta com corpo não-JSON sem quebrar (fallback para objeto vazio)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('invalid json') },
    })

    await expect(createCheckoutLink({ orderNsu: 'order-6', amountCents: 1000, description: 'd' }))
      .rejects.toThrow('InfinitePay erro 500')
  })
})
