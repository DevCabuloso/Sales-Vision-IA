import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, sendText: null, dnsLookup: null, runAgent: null }))

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

vi.mock('node:dns/promises', () => ({
  default: { lookup: (...args) => mockState.dnsLookup(...args) },
}))

vi.mock('../ai/agent.js', () => ({
  runAgent: (...args) => mockState.runAgent(...args),
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
    vi.unstubAllGlobals()
    mockState.sendText = vi.fn().mockResolvedValue(undefined)
    mockState.dnsLookup = vi.fn().mockResolvedValue({ address: '93.184.216.34' })
    mockState.runAgent = vi.fn().mockResolvedValue({ reply: null, scheduled: null })
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

  it('nó webhook: bloqueia SSRF contra rede interna e segue o fluxo sem travar (não exfiltra nada)', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'captura', pergunta: 'Qual seu CEP?', variavel: 'cep' },
        { id: 'n2', tipo: 'webhook', url: 'http://169.254.169.254/latest/meta-data', metodo: 'GET', variavel: 'segredo' },
        { id: 'n3', tipo: 'mensagem', conteudo: 'Resultado: {{segredo}}' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })
    const fetchSpy = vi.spyOn(global, 'fetch')

    await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: '80000-000', channelId: null })

    // assertPublicUrl rejeita o hostname literal antes de qualquer fetch de verdade acontecer
    expect(fetchSpy).not.toHaveBeenCalled()
    // o catch do nó webhook engole o erro e avança mesmo assim — a variável nunca é populada
    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Resultado: {{segredo}}')
  })

  it('nó webhook: segue o fluxo sem travar quando o fetch rejeita (timeout/erro de rede)', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'captura', pergunta: 'Qual seu CEP?', variavel: 'cep' },
        { id: 'n2', tipo: 'webhook', url: 'https://api.exemplo.com/cep', metodo: 'GET', variavel: 'cidade' },
        { id: 'n3', tipo: 'mensagem', conteudo: 'Resultado: {{cidade}}' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

    await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: '80000-000', channelId: null })

    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Resultado: {{cidade}}')
  })

  it('nó ia: busca histórico+nome do tenant, roda o agente e envia a resposta', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'captura', pergunta: 'Como posso ajudar?', variavel: 'pergunta' },
        { id: 'n2', tipo: 'ia' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
      tenants: [{ data: [{ name: 'Empresa Teste' }], error: null }],
      messages: [{ data: [{ role: 'lead', text: 'quero saber o preço' }], error: null }],
    })
    mockState.runAgent.mockResolvedValue({ reply: 'Nosso plano custa R$ 100.', scheduled: null })

    await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'quero saber o preço', channelId: null })

    expect(mockState.runAgent).toHaveBeenCalledWith({
      tenantId: 't1', tenantName: 'Empresa Teste', history: [{ role: 'lead', text: 'quero saber o preço' }],
    })
    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Nosso plano custa R$ 100.')
  })

  it('nó ia: segue o fluxo sem travar quando o agente falha', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'captura', pergunta: 'Como posso ajudar?', variavel: 'pergunta' },
        { id: 'n2', tipo: 'ia' },
        { id: 'n3', tipo: 'mensagem', conteudo: 'De qualquer forma, obrigado por escrever!' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
      tenants: [{ data: [{ name: 'Empresa Teste' }], error: null }],
      messages: [{ data: [], error: null }],
    })
    mockState.runAgent.mockRejectedValue(new Error('OpenAI indisponível'))

    await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'oi', channelId: null })

    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'De qualquer forma, obrigado por escrever!')
  })

  it('nó delay: aguarda o tempo configurado (limitado a 5min) e só então avança', async () => {
    vi.useFakeTimers()
    try {
      const flow = {
        id: 'flow-1',
        timeout_minutes: 30,
        nodes: [
          { id: 'n1', tipo: 'captura', pergunta: 'Aguarde...', variavel: 'x' },
          { id: 'n2', tipo: 'delay', tempo: 5000 },
          { id: 'n3', tipo: 'mensagem', conteudo: 'Terminou a espera!' },
        ],
      }
      setSupabase({
        flow_sessions: [
          { data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null },
          // releitura da sessão dentro do setTimeout, pra confirmar que ainda está ativa
          { data: [{ id: 'session-1', variables: {} }], error: null },
        ],
        flows: [{ data: [flow], error: null }],
        leads: [{ data: [{ phone: '5511999999999' }], error: null }],
      })

      await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'oi', channelId: null })
      expect(mockState.sendText).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(5000)

      expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Terminou a espera!')
    } finally {
      vi.useRealTimers()
    }
  })

  it('nó delay: não avança se a sessão foi encerrada enquanto esperava', async () => {
    vi.useFakeTimers()
    try {
      const flow = {
        id: 'flow-1',
        timeout_minutes: 30,
        nodes: [
          { id: 'n1', tipo: 'captura', pergunta: 'Aguarde...', variavel: 'x' },
          { id: 'n2', tipo: 'delay', tempo: 1000 },
          { id: 'n3', tipo: 'mensagem', conteudo: 'Não deveria enviar isso' },
        ],
      }
      setSupabase({
        flow_sessions: [
          { data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null },
          // sessão já não está mais ativa (foi encerrada por outro motivo nesse meio-tempo)
          { data: [], error: null },
        ],
        flows: [{ data: [flow], error: null }],
        leads: [{ data: [{ phone: '5511999999999' }], error: null }],
      })

      await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'oi', channelId: null })
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockState.sendText).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('passo com saída "transferir": envia mensagem de transferência, marca human_takeover e fila, encerra a sessão', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'captura', pergunta: 'Aguarde...', variavel: 'x' },
        { id: 'n2', tipo: 'passo', saida: 'transferir', msg_transferencia: 'Já te transfiro pra um atendente.', queue_id: 'queue-9' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'oi', channelId: null })

    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Já te transfiro pra um atendente.')
    const leadUpdate = updateCallsFor('leads')[0]
    expect(leadUpdate.args[0]).toMatchObject({ human_takeover: true, queue_id: 'queue-9' })
    const sessionClose = updateCallsFor('flow_sessions').find((c) => c.args[0]?.status === 'transferred')
    expect(sessionClose).toBeTruthy()
  })

  it('passo com saída "encerrar": fecha a sessão sem avançar pra nenhum outro nó', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'captura', pergunta: 'Aguarde...', variavel: 'x' },
        { id: 'n2', tipo: 'passo', saida: 'encerrar', mensagem: 'Até mais!' },
        { id: 'n3', tipo: 'mensagem', conteudo: 'Isso nunca deveria ser enviado' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'oi', channelId: null })

    expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', 'Até mais!')
    expect(mockState.sendText).not.toHaveBeenCalledWith('t1', '5511999999999', 'Isso nunca deveria ser enviado')
    const sessionClose = updateCallsFor('flow_sessions').find((c) => c.args[0]?.status === 'completed')
    expect(sessionClose).toBeTruthy()
  })

  it('nó encerrar (direto): fecha a sessão como completed', async () => {
    const flow = {
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'captura', pergunta: 'Aguarde...', variavel: 'x' },
        { id: 'n2', tipo: 'encerrar' },
      ],
    }
    setSupabase({
      flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
      flows: [{ data: [flow], error: null }],
      leads: [{ data: [{ phone: '5511999999999' }], error: null }],
    })

    await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: 'oi', channelId: null })

    const sessionClose = updateCallsFor('flow_sessions').find((c) => c.args[0]?.status === 'completed')
    expect(sessionClose).toBeTruthy()
  })

  describe('evaluateRule (via nó condicao)', () => {
    const baseFlowFor = (operador, valor) => ({
      id: 'flow-1',
      timeout_minutes: 30,
      nodes: [
        { id: 'n1', tipo: 'captura', pergunta: 'Valor?', variavel: 'valor' },
        { id: 'n2', tipo: 'condicao', variavel: 'valor', regras: [{ operador, valor, destino: 'n-match' }], padrao: 'n-default' },
        { id: 'n-match', tipo: 'mensagem', conteudo: 'bateu a regra' },
        { id: 'n-default', tipo: 'mensagem', conteudo: 'caiu no padrão' },
      ],
    })

    async function runWith(operador, valor, userText) {
      const flow = baseFlowFor(operador, valor)
      setSupabase({
        flow_sessions: [{ data: [{ id: 'session-1', flow_id: 'flow-1', lead_id: 'lead-1', current_node_id: 'n1', variables: {}, status: 'active', last_activity_at: new Date().toISOString() }], error: null }],
        flows: [{ data: [flow], error: null }],
        leads: [{ data: [{ phone: '5511999999999' }], error: null }],
      })
      await processFlowMessage({ tenantId: 't1', leadId: 'lead-1', text: userText, channelId: null })
    }

    it.each([
      ['igual', '10', '10', 'bateu a regra'],
      ['igual', '10', '11', 'caiu no padrão'],
      ['diferente', '10', '11', 'bateu a regra'],
      ['diferente', '10', '10', 'caiu no padrão'],
      ['não contém', 'xyz', 'abc', 'bateu a regra'],
      ['não contém', 'xyz', 'abcxyz', 'caiu no padrão'],
      ['maior', '5', '10', 'bateu a regra'],
      ['maior', '5', '3', 'caiu no padrão'],
      ['menor', '5', '3', 'bateu a regra'],
      ['menor', '5', '10', 'caiu no padrão'],
      ['regex', '^\\d+$', '12345', 'bateu a regra'],
      ['regex', '^\\d+$', 'abc', 'caiu no padrão'],
      ['vazio', '', '', 'bateu a regra'],
      ['vazio', '', 'algo', 'caiu no padrão'],
      ['não vazio', '', 'algo', 'bateu a regra'],
      ['não vazio', '', '', 'caiu no padrão'],
    ])('operador %s (regra=%s, entrada=%s) → %s', async (operador, valor, userText, esperado) => {
      await runWith(operador, valor, userText)
      expect(mockState.sendText).toHaveBeenCalledWith('t1', '5511999999999', esperado)
    })
  })
})
