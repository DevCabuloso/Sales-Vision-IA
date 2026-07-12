import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, sendText: null }))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../whatsapp/index.js', () => ({
  sendText: (...args) => mockState.sendText(...args),
}))

const { processFlowMessage } = await import('../flowEngine.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

function updateCallsFor(table) {
  return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update')
}

describe('flowEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.sendText = vi.fn().mockResolvedValue(undefined)
  })

  it('retorna false quando não há sessão ativa nem fluxo com gatilho correspondente', async () => {
    setSupabase({
      flow_sessions: [{ data: [], error: null }],
      flows: [{ data: [], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    const result = await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'qualquer coisa', channelId: null })

    expect(result).toBe(false)
    expect(mockState.sendText).not.toHaveBeenCalled()
  })

  it('inicia um fluxo por palavra-chave e avança automaticamente até um nó que aguarda resposta', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      fallback_text: 'Não entendi.',
      trigger_keywords: ['oi'],
      nodes: [
        { id: 'n0', tipo: 'inicio' },
        { id: 'n1', tipo: 'passo', mensagem: 'Olá {{nome}}, bem-vindo!', saida: 'avancar' },
        { id: 'n2', tipo: 'mensagem', conteudo: 'Vamos começar seu cadastro.' },
        { id: 'n3', tipo: 'captura', pergunta: 'Qual seu nome?', variavel: 'nome' },
      ],
    }
    setSupabase({
      flow_sessions: [
        { data: [], error: null }, // getSession: nenhuma sessão ativa
        { data: { id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active' }, error: null }, // createSession
      ],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    const result = await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'oi, tudo bem?', channelId: null })

    expect(result).toBe(true)
    expect(mockState.sendText).toHaveBeenCalledTimes(3)
    expect(mockState.sendText).toHaveBeenNthCalledWith(1, 't1', '5511999999999', 'Olá {{nome}}, bem-vindo!')
    expect(mockState.sendText).toHaveBeenNthCalledWith(2, 't1', '5511999999999', 'Vamos começar seu cadastro.')
    expect(mockState.sendText).toHaveBeenNthCalledWith(3, 't1', '5511999999999', 'Qual seu nome?')
  })

  it('não dispara novo fluxo quando allowNewFlow=false (humano atendendo) e não há sessão ativa', async () => {
    setSupabase({
      flow_sessions: [{ data: [], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    const result = await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'oi', channelId: null, allowNewFlow: false })

    expect(result).toBe(false)
    expect(mockState.sendText).not.toHaveBeenCalled()
    // não deve nem consultar a tabela flows, já que allowNewFlow é falso
    expect(supabaseMock.calls.some((c) => c.table === 'flows')).toBe(false)
  })

  it('encerra a sessão por timeout e envia a mensagem de fallback', async () => {
    const flow = { id: 'flow-1', timeout_minutes: 30, fallback_text: 'Sessão expirada, comece de novo.', nodes: [{ id: 'n1', tipo: 'captura', pergunta: 'Qual seu nome?' }] }
    const oldTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1h atrás > 30min de timeout
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: oldTimestamp }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    const result = await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'oi de novo', channelId: null })

    expect(result).toBe(true)
    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Sessão expirada, comece de novo.')
    const closeCall = updateCallsFor('flow_sessions').find((c) => c.args[0]?.status === 'timeout')
    expect(closeCall).toBeTruthy()
  })

  it('roteia por resposta do usuário (nó passo/aguardar) para o destino correspondente', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'passo', saida: 'aguardar', respostas: [{ texto: 'sim', destino: 'n2' }], padrao: 'n3' },
        { id: 'n2', tipo: 'mensagem', conteudo: 'Que bom que você confirmou!' },
        { id: 'n3', tipo: 'mensagem', conteudo: 'Tudo bem, sem problemas.' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    const result = await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'Sim, confirmo', channelId: null })

    expect(result).toBe(true)
    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Que bom que você confirmou!')
  })

  it('roteia para o padrão quando a resposta do usuário não corresponde a nenhuma opção', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'passo', saida: 'aguardar', respostas: [{ texto: 'sim', destino: 'n2' }], padrao: 'n3' },
        { id: 'n2', tipo: 'mensagem', conteudo: 'Que bom que você confirmou!' },
        { id: 'n3', tipo: 'mensagem', conteudo: 'Tudo bem, sem problemas.' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'não sei', channelId: null })

    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Tudo bem, sem problemas.')
  })

  it('transfere para atendimento humano (__transfer__) e marca human_takeover no lead', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'passo', saida: 'aguardar', respostas: [{ texto: 'humano', destino: '__transfer__' }], padrao: null },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    const result = await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'quero falar com humano', channelId: null })

    expect(result).toBe(true)
    const leadUpdate = updateCallsFor('leads').find((c) => c.args[0]?.human_takeover === true)
    expect(leadUpdate).toBeTruthy()
    const closeCall = updateCallsFor('flow_sessions').find((c) => c.args[0]?.status === 'transferred')
    expect(closeCall).toBeTruthy()
  })

  it('avalia nó de condição (operador "contém") e roteia para o destino correto', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'captura', pergunta: 'Qual sua cidade?', variavel: 'cidade' },
        { id: 'n2', tipo: 'condicao', variavel: 'cidade', regras: [{ operador: 'contém', valor: 'paulo', destino: 'n3' }], padrao: 'n4' },
        { id: 'n3', tipo: 'mensagem', conteudo: 'Temos atendimento presencial em São Paulo!' },
        { id: 'n4', tipo: 'mensagem', conteudo: 'Atendemos sua região só online.' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'Moro em São Paulo', channelId: null })

    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Temos atendimento presencial em São Paulo!')
  })

  it('nó webhook: busca dados externos, salva na variável e avança usando o valor interpolado', async () => {
    // current_node_id aponta para o nó de captura (ponto de espera); ao responder,
    // resumeFlow avança para o webhook e depois para a mensagem que usa a variável.
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'captura', pergunta: 'Qual seu CEP?', variavel: 'cep' },
        { id: 'n2', tipo: 'webhook', url: 'https://api.exemplo.com/cep', metodo: 'GET', variavel: 'cidade' },
        { id: 'n3', tipo: 'mensagem', conteudo: 'Sua cidade é {{cidade}}.' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })
    vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => 'Curitiba' })

    await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: '80000-000', channelId: null })

    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Sua cidade é Curitiba.')
  })
})
