import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, chat: null, getFreeBusy: null, createEvent: null, decryptJSON: null }))

vi.mock('../../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../openai.js', () => ({
  chat: (...args) => mockState.chat(...args),
}))

vi.mock('../../googleCalendar.js', () => ({
  getFreeBusy: (...args) => mockState.getFreeBusy(...args),
  createEvent: (...args) => mockState.createEvent(...args),
}))

vi.mock('../../crypto.js', () => ({
  decryptJSON: (...args) => mockState.decryptJSON(...args),
}))

const { runAgent, buildSystemContent } = await import('../agent.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

describe('ai/agent — buildSystemContent', () => {
  it('usa o prompt padrão quando o tenant não tem system_prompt nem main_prompt configurados', () => {
    const content = buildSystemContent(null, 'Empresa Teste')
    expect(content).toContain('SDR (pré-vendedor) da empresa Empresa Teste')
  })

  it('usa system_prompt customizado do tenant quando configurado', () => {
    const content = buildSystemContent({ system_prompt: 'Você é o assistente da Acme.' }, 'Acme')
    expect(content).toContain('Você é o assistente da Acme.')
    expect(content).not.toContain('SDR (pré-vendedor)')
  })

  it('inclui main_prompt após o system_prompt quando presente', () => {
    const content = buildSystemContent({ system_prompt: 'Base.', main_prompt: 'Regra extra.' }, 'Acme')
    expect(content).toContain('Base.')
    expect(content).toContain('Regra extra.')
  })

  it('anexa a base de conhecimento ao final quando configurada', () => {
    const content = buildSystemContent({ knowledge_base: 'Produto X custa R$100.' }, 'Acme')
    expect(content).toContain('Produto X custa R$100.')
    expect(content).toContain('Base de conhecimento')
  })
})

describe('ai/agent — runAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.chat = vi.fn()
    mockState.getFreeBusy = vi.fn()
    mockState.createEvent = vi.fn()
    mockState.decryptJSON = vi.fn()
    setSupabase({ ai_configs: [{ data: [], error: null }] })
  })

  it('retorna a resposta direta quando a IA não chama nenhuma ferramenta', async () => {
    mockState.chat.mockResolvedValue({ role: 'assistant', content: 'Olá! Como posso ajudar?' })

    const result = await runAgent({ tenantId: 't1', tenantName: 'Empresa', history: [{ role: 'lead', text: 'oi' }] })

    expect(result).toEqual({ reply: 'Olá! Como posso ajudar?', scheduled: null })
    expect(mockState.chat).toHaveBeenCalledTimes(1)
  })

  it('descriptografa e usa a chave OpenAI do tenant quando configurada', async () => {
    setSupabase({ ai_configs: [{ data: [{ openai_api_key: 'encrypted-blob', model: 'gpt-4o' }], error: null }] })
    mockState.decryptJSON.mockReturnValue('sk-tenant-key')
    mockState.chat.mockResolvedValue({ role: 'assistant', content: 'oi' })

    await runAgent({ tenantId: 't1', tenantName: 'Empresa', history: [] })

    expect(mockState.decryptJSON).toHaveBeenCalledWith('encrypted-blob')
    expect(mockState.chat.mock.calls[0][0]).toMatchObject({ apiKey: 'sk-tenant-key', model: 'gpt-4o' })
  })

  it('consulta horários livres via ferramenta e devolve o resultado ao modelo', async () => {
    mockState.getFreeBusy.mockResolvedValue([{ start: '2026-08-01T10:00:00Z', end: '2026-08-01T10:30:00Z' }])
    mockState.chat
      .mockResolvedValueOnce({
        role: 'assistant', content: null,
        tool_calls: [{ id: 'call-1', function: { name: 'consultar_horarios_livres', arguments: JSON.stringify({ dia_inicio: '2026-08-01T00:00:00Z', dia_fim: '2026-08-02T00:00:00Z' }) } }],
      })
      .mockResolvedValueOnce({ role: 'assistant', content: 'Temos horário às 11h, pode ser?' })

    const result = await runAgent({ tenantId: 't1', tenantName: 'Empresa', history: [] })

    expect(result.reply).toBe('Temos horário às 11h, pode ser?')
    expect(mockState.getFreeBusy).toHaveBeenCalledWith('t1', { timeMin: '2026-08-01T00:00:00Z', timeMax: '2026-08-02T00:00:00Z' })
    const toolMsg = mockState.chat.mock.calls[1][0].messages.find((m) => m.role === 'tool')
    expect(JSON.parse(toolMsg.content).busy).toHaveLength(1)
  })

  it('agenda a reunião quando o horário está livre', async () => {
    mockState.getFreeBusy.mockResolvedValue([])
    mockState.createEvent.mockResolvedValue({ externalId: 'ext-1', htmlLink: 'https://cal/x', meetingLink: 'https://meet/x', status: 'confirmed' })
    mockState.chat
      .mockResolvedValueOnce({
        role: 'assistant', content: null,
        tool_calls: [{ id: 'call-1', function: { name: 'agendar_reuniao', arguments: JSON.stringify({ titulo: 'Demo', inicio: '2026-08-01T10:00:00Z', fim: '2026-08-01T10:30:00Z' }) } }],
      })
      .mockResolvedValueOnce({ role: 'assistant', content: 'Combinado!' })

    const result = await runAgent({ tenantId: 't1', tenantName: 'Empresa', history: [] })

    expect(result).toEqual({
      reply: 'Combinado!',
      scheduled: { externalId: 'ext-1', htmlLink: 'https://cal/x', meetingLink: 'https://meet/x', status: 'confirmed', title: 'Demo', start: '2026-08-01T10:00:00Z', end: '2026-08-01T10:30:00Z' },
    })
  })

  it('não agenda e informa conflito quando o horário está ocupado', async () => {
    mockState.getFreeBusy.mockResolvedValue([{ start: '2026-08-01T10:00:00Z', end: '2026-08-01T10:30:00Z' }])
    mockState.chat
      .mockResolvedValueOnce({
        role: 'assistant', content: null,
        tool_calls: [{ id: 'call-1', function: { name: 'agendar_reuniao', arguments: JSON.stringify({ titulo: 'Demo', inicio: '2026-08-01T10:00:00Z', fim: '2026-08-01T10:30:00Z' }) } }],
      })
      .mockResolvedValueOnce({ role: 'assistant', content: 'Esse horário não está mais disponível, que tal outro?' })

    const result = await runAgent({ tenantId: 't1', tenantName: 'Empresa', history: [] })

    expect(result.scheduled).toBeNull()
    expect(mockState.createEvent).not.toHaveBeenCalled()
    const toolMsg = mockState.chat.mock.calls[1][0].messages.find((m) => m.role === 'tool')
    expect(JSON.parse(toolMsg.content)).toMatchObject({ ok: false, conflito: true })
  })

  it('retorna erro da ferramenta ao modelo quando a chamada externa falha, sem quebrar o fluxo', async () => {
    mockState.getFreeBusy.mockRejectedValue(new Error('Google Calendar não conectado para este cliente.'))
    mockState.chat
      .mockResolvedValueOnce({
        role: 'assistant', content: null,
        tool_calls: [{ id: 'call-1', function: { name: 'consultar_horarios_livres', arguments: JSON.stringify({ dia_inicio: 'x', dia_fim: 'y' }) } }],
      })
      .mockResolvedValueOnce({ role: 'assistant', content: 'Ainda não consigo checar a agenda, um momento.' })

    const result = await runAgent({ tenantId: 't1', tenantName: 'Empresa', history: [] })

    expect(result.reply).toBe('Ainda não consigo checar a agenda, um momento.')
    const toolMsg = mockState.chat.mock.calls[1][0].messages.find((m) => m.role === 'tool')
    expect(JSON.parse(toolMsg.content).error).toBe('Google Calendar não conectado para este cliente.')
  })

  it('para após 4 iterações de tool-calls para evitar loop infinito', async () => {
    mockState.getFreeBusy.mockResolvedValue([])
    mockState.chat.mockResolvedValue({
      role: 'assistant', content: null,
      tool_calls: [{ id: 'call-loop', function: { name: 'consultar_horarios_livres', arguments: JSON.stringify({ dia_inicio: 'x', dia_fim: 'y' }) } }],
    })

    const result = await runAgent({ tenantId: 't1', tenantName: 'Empresa', history: [] })

    expect(result.reply).toBe('Pode me confirmar, por favor?')
    expect(mockState.chat).toHaveBeenCalledTimes(4)
  })

  it('filtra o histórico mapeando lead→user e ai/agent→assistant, ignorando mensagens system', async () => {
    mockState.chat.mockResolvedValue({ role: 'assistant', content: 'ok' })

    await runAgent({
      tenantId: 't1', tenantName: 'Empresa',
      history: [
        { role: 'system', text: 'separador' },
        { role: 'lead', text: 'oi' },
        { role: 'ai', text: 'olá' },
        { role: 'agent', text: 'como posso ajudar' },
      ],
    })

    // messages é a mesma array mutada depois pelo runAgent (push da resposta) — pega só os 3 itens do histórico
    const messages = mockState.chat.mock.calls[0][0].messages
    const nonSystem = messages.slice(1, 4)
    expect(nonSystem).toEqual([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
      { role: 'assistant', content: 'como posso ajudar' },
    ])
  })
})
