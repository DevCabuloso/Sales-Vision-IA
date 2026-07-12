import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({
  box: {},
  sendText: null,
  runAgent: null,
  analyzeLead: null,
  isWithinBusinessHours: null,
  getOffMessage: null,
  processFlowMessage: null,
}))

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

vi.mock('../ai/agent.js', () => ({
  runAgent: (...args) => mockState.runAgent(...args),
}))

vi.mock('../ai/analyze.js', () => ({
  analyzeLead: (...args) => mockState.analyzeLead(...args),
}))

vi.mock('../../routes/business-hours.js', () => ({
  isWithinBusinessHours: (...args) => mockState.isWithinBusinessHours(...args),
  getOffMessage: (...args) => mockState.getOffMessage(...args),
}))

vi.mock('../flowEngine.js', () => ({
  processFlowMessage: (...args) => mockState.processFlowMessage(...args),
}))

const { handleInboundMessage, handleOutboundMessage, markSentByPlatform } = await import('../orchestrator.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

function callsFor(table, method) {
  return supabaseMock.calls.filter((c) => c.table === table && (!method || c.method === method))
}

const baseLead = {
  id: 'lead-1',
  name: '5511988887777',
  stage: 'Novo',
  assigned_to: null,
  conversation_status: 'pending',
  human_takeover: false,
  is_group: false,
  group_subject: null,
}

describe('orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.sendText = vi.fn().mockResolvedValue(undefined)
    mockState.runAgent = vi.fn()
    // promise que nunca resolve: evita que a reanálise em background (não aguardada
    // pela função) rode depois que o mock do supabase do teste seguinte já assumiu
    mockState.analyzeLead = vi.fn(() => new Promise(() => {}))
    mockState.isWithinBusinessHours = vi.fn().mockResolvedValue(true)
    mockState.getOffMessage = vi.fn().mockResolvedValue('Estamos fora do horário de atendimento.')
    mockState.processFlowMessage = vi.fn().mockResolvedValue(false)
  })

  describe('handleInboundMessage — mensagens de grupo', () => {
    it('ignora mensagem de grupo quando o suporte a grupos está desabilitado (padrão)', async () => {
      setSupabase({
        tenants: [{ data: [{ op_settings: {} }], error: null }],
      })

      const result = await handleInboundMessage({
        tenantId: 'tenant-grupo-1', from: '551188889999', text: 'oi grupo', provider: 'evolution',
        isGroup: true, pushName: 'Fulano', senderJid: '5511777@s.whatsapp.net',
      })

      expect(result).toEqual({ reply: null, scheduled: null })
      expect(callsFor('leads').length).toBe(0)
      expect(mockState.sendText).not.toHaveBeenCalled()
    })

    it('salva a mensagem quando o suporte a grupos está habilitado, mas não aciona IA nem fluxo', async () => {
      setSupabase({
        tenants: [{ data: [{ op_settings: { ignore_group_messages: false } }], error: null }],
        leads: [{ data: { ...baseLead, is_group: true, group_subject: 'Grupo dos Amigos' }, error: null }],
        messages: [{ data: [{ id: 'msg-grupo-1' }], error: null }],
      })

      const result = await handleInboundMessage({
        tenantId: 'tenant-grupo-2', from: '551188889999', text: 'oi grupo', provider: 'evolution',
        isGroup: true, pushName: 'Fulano', senderJid: '5511777@s.whatsapp.net',
      })

      expect(result).toEqual({ reply: null, scheduled: null })
      expect(callsFor('leads', 'upsert').length).toBe(1)
      const msgInsert = callsFor('messages', 'insert')[0]
      expect(msgInsert.args[0]).toMatchObject({ role: 'lead', sender_jid: '5511777@s.whatsapp.net', sender_name: 'Fulano' })
      expect(mockState.sendText).not.toHaveBeenCalled()
      expect(mockState.processFlowMessage).not.toHaveBeenCalled()
      expect(mockState.runAgent).not.toHaveBeenCalled()
    })
  })

  describe('handleInboundMessage — fora do horário de atendimento', () => {
    it('envia a mensagem de horário de atendimento e não aciona a IA', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.isWithinBusinessHours.mockResolvedValue(false)

      const result = await handleInboundMessage({
        tenantId: 'tenant-fora-horario', from: '5511988887777', text: 'oi', provider: 'evolution',
      })

      expect(result).toEqual({ reply: 'Estamos fora do horário de atendimento.', scheduled: null })
      expect(mockState.sendText).toHaveBeenCalledWith('tenant-fora-horario', '5511988887777', 'Estamos fora do horário de atendimento.')
      expect(mockState.runAgent).not.toHaveBeenCalled()
    })
  })

  describe('handleInboundMessage — resposta da IA dentro do horário', () => {
    it('roda o agente de IA e envia a resposta ao lead', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
          { data: [{ id: 'msg-ai-1' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.runAgent.mockResolvedValue({ reply: 'Oi! Como posso ajudar?', scheduled: null })

      const result = await handleInboundMessage({
        tenantId: 'tenant-ia-1', from: '5511988887777', text: 'oi', provider: 'evolution',
      })

      expect(result).toEqual({ reply: 'Oi! Como posso ajudar?', scheduled: null })
      expect(mockState.sendText).toHaveBeenCalledWith('tenant-ia-1', '5511988887777', 'Oi! Como posso ajudar?')
      const aiMsgInsert = callsFor('messages', 'insert').find((c) => c.args[0]?.role === 'ai')
      expect(aiMsgInsert).toBeTruthy()
    })

    it('não roda o agente de IA quando um humano assumiu a conversa', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead, human_takeover: true }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })

      const result = await handleInboundMessage({
        tenantId: 'tenant-humano-1', from: '5511988887777', text: 'oi', provider: 'evolution',
      })

      expect(result).toEqual({ reply: '', scheduled: null })
      expect(mockState.runAgent).not.toHaveBeenCalled()
      expect(mockState.sendText).not.toHaveBeenCalled()
    })

    it('quando o agente agenda uma reunião, persiste o appointment e move o estágio do lead', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'quero agendar' }], error: null },
          { data: [{ id: 'msg-ai-1' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      const scheduled = {
        title: 'Reunião com Ana', externalId: 'ext-1',
        start: '2026-08-01T10:00:00.000Z', end: '2026-08-01T10:30:00.000Z',
        meetingLink: 'https://meet.exemplo.com/xyz',
      }
      mockState.runAgent.mockResolvedValue({ reply: 'Combinado, te vejo lá!', scheduled })

      const result = await handleInboundMessage({
        tenantId: 'tenant-agenda-1', from: '5511988887777', text: 'quero agendar', provider: 'evolution',
      })

      expect(result.scheduled).toEqual(scheduled)
      const appointmentInsert = callsFor('appointments', 'insert')[0]
      expect(appointmentInsert.args[0]).toMatchObject({
        tenant_id: 'tenant-agenda-1', lead_id: 'lead-1', title: 'Reunião com Ana', external_id: 'ext-1', status: 'scheduled',
      })
      const stageUpdate = callsFor('leads', 'update').find((c) => c.args[0]?.stage === 'Reunião Agendada')
      expect(stageUpdate).toBeTruthy()
      const historyInsert = callsFor('lead_stage_history', 'insert')[0]
      expect(historyInsert.args[0]).toMatchObject({ from_stage: 'Novo', to_stage: 'Reunião Agendada' })
    })
  })

  describe('handleInboundMessage — flow engine', () => {
    it('não aciona a IA quando o flow engine já tratou a mensagem', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [{ data: [{ id: 'msg-lead-1' }], error: null }],
      })
      mockState.processFlowMessage.mockResolvedValue(true)

      const result = await handleInboundMessage({
        tenantId: 'tenant-flow-1', from: '5511988887777', text: 'oi', provider: 'evolution',
      })

      expect(result).toEqual({ reply: null, scheduled: null })
      expect(mockState.runAgent).not.toHaveBeenCalled()
      expect(mockState.sendText).not.toHaveBeenCalled()
    })
  })

  describe('handleOutboundMessage', () => {
    it('ignora mensagens já marcadas como enviadas pela própria plataforma (evita duplicidade)', async () => {
      setSupabase({})
      markSentByPlatform('tenant-dedupe-1', '5511988887777', 'mensagem enviada pela IA')

      await handleOutboundMessage({
        tenantId: 'tenant-dedupe-1', to: '5511988887777', text: 'mensagem enviada pela IA', provider: 'evolution',
      })

      expect(supabaseMock.supabase.from).not.toHaveBeenCalled()
    })

    it('salva a mensagem enviada manualmente pelo operador (fromMe) como role=agent', async () => {
      setSupabase({
        leads: [{ data: { id: 'lead-2', group_subject: null }, error: null }],
        messages: [
          { data: [], error: null }, // checagem de duplicata: nenhuma encontrada
          { data: [{ id: 'msg-agent-1' }], error: null }, // insert da mensagem do operador
        ],
      })

      await handleOutboundMessage({
        tenantId: 'tenant-outbound-1', to: '5511988887777', text: 'Oi, aqui é o atendente humano', provider: 'evolution',
      })

      const agentInsert = callsFor('messages', 'insert').find((c) => c.args[0]?.role === 'agent')
      expect(agentInsert).toBeTruthy()
      expect(agentInsert.args[0].text).toBe('Oi, aqui é o atendente humano')
    })
  })
})
