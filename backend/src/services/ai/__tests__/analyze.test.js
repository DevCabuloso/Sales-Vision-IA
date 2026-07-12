import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockState = vi.hoisted(() => ({ chat: null }))

vi.mock('../openai.js', () => ({
  chat: (...args) => mockState.chat(...args),
}))

const { analyzeLead } = await import('../analyze.js')

describe('ai/analyze — analyzeLead', () => {
  beforeEach(() => {
    mockState.chat = vi.fn()
  })

  it('retorna os campos estruturados quando a IA responde um JSON válido', async () => {
    mockState.chat.mockResolvedValue({
      content: JSON.stringify({ score: 78, intention: 'Quer comprar o plano Pro', stage: 'Qualificado', interests: ['plano-pro', 'suporte'] }),
    })

    const result = await analyzeLead([{ role: 'lead', text: 'quero o plano pro' }])

    expect(result).toEqual({ score: 78, intention: 'Quer comprar o plano Pro', stage: 'Qualificado', interests: ['plano-pro', 'suporte'] })
  })

  it('usa "Em Qualificação" como stage padrão quando a IA retorna um valor fora da lista permitida', async () => {
    mockState.chat.mockResolvedValue({ content: JSON.stringify({ score: 50, stage: 'Estágio Inventado' }) })
    const result = await analyzeLead([])
    expect(result.stage).toBe('Em Qualificação')
  })

  it('limita o score entre 0 e 100 e arredonda', async () => {
    mockState.chat.mockResolvedValue({ content: JSON.stringify({ score: 999.6 }) })
    expect((await analyzeLead([])).score).toBe(100)

    mockState.chat.mockResolvedValue({ content: JSON.stringify({ score: -50 }) })
    expect((await analyzeLead([])).score).toBe(0)

    mockState.chat.mockResolvedValue({ content: JSON.stringify({ score: 42.4 }) })
    expect((await analyzeLead([])).score).toBe(42)
  })

  it('retorna score 0 quando o score não é um número válido', async () => {
    mockState.chat.mockResolvedValue({ content: JSON.stringify({ score: 'muito alto' }) })
    expect((await analyzeLead([])).score).toBe(0)
  })

  it('trunca intention em 200 caracteres e usa null se não for string', async () => {
    const longText = 'a'.repeat(250)
    mockState.chat.mockResolvedValue({ content: JSON.stringify({ intention: longText }) })
    const result = await analyzeLead([])
    expect(result.intention).toHaveLength(200)

    mockState.chat.mockResolvedValue({ content: JSON.stringify({ intention: 123 }) })
    expect((await analyzeLead([])).intention).toBeNull()
  })

  it('limita interests a 10 itens e usa array vazio se não vier um array', async () => {
    const manyInterests = Array.from({ length: 20 }, (_, i) => `item-${i}`)
    mockState.chat.mockResolvedValue({ content: JSON.stringify({ interests: manyInterests }) })
    expect((await analyzeLead([])).interests).toHaveLength(10)

    mockState.chat.mockResolvedValue({ content: JSON.stringify({ interests: 'não é array' }) })
    expect((await analyzeLead([])).interests).toEqual([])
  })

  it('retorna valores padrão sem lançar erro quando a resposta da IA não é um JSON válido', async () => {
    mockState.chat.mockResolvedValue({ content: 'isso não é json' })
    const result = await analyzeLead([{ role: 'lead', text: 'oi' }])
    expect(result).toEqual({ score: 0, intention: null, stage: 'Em Qualificação', interests: [] })
  })

  it('monta o transcript com os papéis Lead/IA a partir do histórico', async () => {
    mockState.chat.mockResolvedValue({ content: '{}' })
    await analyzeLead([{ role: 'lead', text: 'quero saber preços' }, { role: 'ai', text: 'claro, temos 3 planos' }])

    const userMsg = mockState.chat.mock.calls[0][0].messages.find((m) => m.role === 'user')
    expect(userMsg.content).toBe('Lead: quero saber preços\nIA: claro, temos 3 planos')
  })

  it('usa transcript placeholder quando o histórico está vazio', async () => {
    mockState.chat.mockResolvedValue({ content: '{}' })
    await analyzeLead([])
    const userMsg = mockState.chat.mock.calls[0][0].messages.find((m) => m.role === 'user')
    expect(userMsg.content).toBe('(sem mensagens ainda)')
  })
})
