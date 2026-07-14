import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({
  box: {},
  sendText: null,
  runAgent: null,
  analyzeLead: null,
  isWithinBusinessHours: null,
  getOffMessage: null,
  processFlowMessage: null,
  uploadChatMedia: null,
  metaDownloadMedia: null,
  evolutionDownloadMediaBase64: null,
  transcribeAudio: null,
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
  meta: { downloadMedia: (...args) => mockState.metaDownloadMedia(...args) },
  evolution: { downloadMediaBase64: (...args) => mockState.evolutionDownloadMediaBase64(...args) },
}))

vi.mock('../ai/agent.js', () => ({
  runAgent: (...args) => mockState.runAgent(...args),
}))

vi.mock('../ai/analyze.js', () => ({
  analyzeLead: (...args) => mockState.analyzeLead(...args),
}))

vi.mock('../ai/openai.js', () => ({
  transcribeAudio: (...args) => mockState.transcribeAudio(...args),
}))

vi.mock('../mediaStorage.js', () => ({
  uploadChatMedia: (...args) => mockState.uploadChatMedia(...args),
}))

vi.mock('../../routes/business-hours.js', () => ({
  isWithinBusinessHours: (...args) => mockState.isWithinBusinessHours(...args),
  getOffMessage: (...args) => mockState.getOffMessage(...args),
}))

vi.mock('../flowEngine.js', () => ({
  processFlowMessage: (...args) => mockState.processFlowMessage(...args),
}))

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

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
    mockState.uploadChatMedia = vi.fn().mockResolvedValue('https://cdn.exemplo.com/midia.bin')
    mockState.metaDownloadMedia = vi.fn()
    mockState.evolutionDownloadMediaBase64 = vi.fn()
    mockState.transcribeAudio = vi.fn()
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

    it('ignora um wa_message_id já processado (idempotência contra redelivery da Evolution)', async () => {
      setSupabase({
        messages: [{ data: [{ id: 'msg-existente' }], error: null }], // já existe mensagem com esse wa_message_id
      })

      const result = await handleInboundMessage({
        tenantId: 'tenant-dup-1', from: '5511988887777', text: 'oi', provider: 'evolution',
        waMessageId: 'wa-repetida',
      })

      expect(result).toEqual({ reply: null, scheduled: null })
      expect(mockState.runAgent).not.toHaveBeenCalled()
      expect(mockState.sendText).not.toHaveBeenCalled()
      // nem chega a consultar leads — a checagem de duplicata roda antes de qualquer upsert
      expect(callsFor('leads').length).toBe(0)
    })

    it('processa normalmente quando o wa_message_id ainda não existe', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [], error: null }, // checagem de duplicata: nada encontrado
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
          { data: [{ id: 'msg-ai-1' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.runAgent.mockResolvedValue({ reply: 'Oi!', scheduled: null })

      const result = await handleInboundMessage({
        tenantId: 'tenant-nova-1', from: '5511988887777', text: 'oi', provider: 'evolution',
        waMessageId: 'wa-nova',
      })

      expect(result).toEqual({ reply: 'Oi!', scheduled: null })
    })

    it('quando a IA falha, move a conversa para atendimento humano e cria um alerta (sino) em vez de deixar o lead em silêncio', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
        notifications: [{ data: [], error: null }], // dedupe: nenhum alerta recente
        users: [{ data: [{ id: 'admin-1' }], error: null }],
      })
      mockState.runAgent.mockRejectedValue(new Error('OpenAI indisponível'))

      const result = await handleInboundMessage({
        tenantId: 'tenant-ia-falha-1', from: '5511988887777', text: 'oi', provider: 'evolution',
      })

      expect(result).toEqual({ reply: '', scheduled: null })
      expect(mockState.sendText).not.toHaveBeenCalled() // sem reply, nada é enviado
      const takeoverUpdate = callsFor('leads', 'update').find((c) => c.args[0]?.human_takeover === true)
      expect(takeoverUpdate).toBeTruthy()
      const notifInsert = callsFor('notifications', 'insert').find((c) => c.args[0]?.type === 'ai_reply_failed')
      expect(notifInsert).toBeTruthy()
      expect(notifInsert.args[0]).toMatchObject({ tenant_id: 'tenant-ia-falha-1', user_id: 'admin-1' })
    })

    it('quando o envio da resposta da IA falha, ainda assim persiste a mensagem (send_status=failed) e alerta os admins', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
          { data: [{ id: 'msg-ai-1' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
        notifications: [{ data: [], error: null }],
        users: [{ data: [{ id: 'admin-1' }], error: null }],
      })
      mockState.runAgent.mockResolvedValue({ reply: 'Oi! Como posso ajudar?', scheduled: null })
      mockState.sendText.mockRejectedValue(new Error('Evolution indisponível'))

      await handleInboundMessage({ tenantId: 'tenant-send-falha-1', from: '5511988887777', text: 'oi', provider: 'evolution' })

      const aiMsgInsert = callsFor('messages', 'insert').find((c) => c.args[0]?.role === 'ai')
      expect(aiMsgInsert.args[0]).toMatchObject({ send_status: 'failed', send_error: 'Evolution indisponível' })
      const notifInsert = callsFor('notifications', 'insert').find((c) => c.args[0]?.type === 'message_send_failed')
      expect(notifInsert).toBeTruthy()
    })

    it('busca só as últimas 40 mensagens (desc+limit) e entrega ao agente em ordem cronológica', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          // simula o que o banco devolve com .order({ascending:false}): mais nova primeiro
          { data: [
            { role: 'ai', text: 'terceira' },
            { role: 'lead', text: 'segunda' },
            { role: 'lead', text: 'primeira' },
          ], error: null },
          { data: [{ id: 'msg-ai-1' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.runAgent.mockResolvedValue({ reply: 'ok', scheduled: null })

      await handleInboundMessage({ tenantId: 'tenant-hist-1', from: '5511988887777', text: 'oi', provider: 'evolution' })

      const historySelect = callsFor('messages', 'select').find((c) => c.args[0] === 'role, text')
      expect(historySelect).toBeTruthy()
      const orderCall = callsFor('messages', 'order').find((c) => c.args[0] === 'created_at' && c.args[1]?.ascending === false)
      expect(orderCall).toBeTruthy()
      const limitCall = callsFor('messages', 'limit').find((c) => c.args[0] === 40)
      expect(limitCall).toBeTruthy()

      expect(mockState.runAgent).toHaveBeenCalledWith(expect.objectContaining({
        history: [
          { role: 'lead', text: 'primeira' },
          { role: 'lead', text: 'segunda' },
          { role: 'ai', text: 'terceira' },
        ],
      }))
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

    it('quando o teto diário de mensagens de IA é atingido, não chama o agente e move a conversa pra humano', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
        usage_events: [{ data: null, error: null, count: 2000 }], // >= AI_DAILY_MESSAGE_CAP default (2000)
        notifications: [{ data: [], error: null }],
        users: [{ data: [{ id: 'admin-1' }], error: null }],
      })

      const result = await handleInboundMessage({
        tenantId: 'tenant-teto-1', from: '5511988887777', text: 'oi', provider: 'evolution',
      })

      expect(result).toEqual({ reply: '', scheduled: null })
      expect(mockState.runAgent).not.toHaveBeenCalled()
      const takeoverUpdate = callsFor('leads', 'update').find((c) => c.args[0]?.human_takeover === true)
      expect(takeoverUpdate).toBeTruthy()
      const notifInsert = callsFor('notifications', 'insert').find((c) => c.args[0]?.type === 'ai_daily_cap_reached')
      expect(notifInsert).toBeTruthy()
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

  describe('handleInboundMessage — patch consolidado do lead (nome/atribuição/status num update só)', () => {
    it('aplica assigned_to e queue_id do canal num único update quando o lead ainda não tem nenhum dos dois', async () => {
      setSupabase({
        channels: [
          { data: [{ id: 'ch-1' }], error: null }, // resolve channelId por instance_name
          { data: [{ assigned_user_id: 'user-9', assigned_queue_id: 'queue-9' }], error: null }, // auto-atribuição
        ],
        leads: [{ data: { ...baseLead, assigned_to: null, queue_id: null }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
          { data: [{ id: 'msg-off-1' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.isWithinBusinessHours.mockResolvedValue(false)

      await handleInboundMessage({
        tenantId: 'tenant-assign-1', from: '5511988887777', text: 'oi', provider: 'evolution', instanceName: 'inst-1',
      })

      const leadUpdates = callsFor('leads', 'update')
      expect(leadUpdates).toHaveLength(1)
      expect(leadUpdates[0].args[0]).toEqual({ assigned_to: 'user-9', queue_id: 'queue-9' })
    })

    it('não reatribui quando o lead já tem assigned_to e queue_id', async () => {
      setSupabase({
        channels: [
          { data: [{ id: 'ch-1' }], error: null },
          { data: [{ assigned_user_id: 'user-9', assigned_queue_id: 'queue-9' }], error: null },
        ],
        leads: [{ data: { ...baseLead, assigned_to: 'user-existente', queue_id: 'queue-existente' }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
          { data: [{ id: 'msg-off-1' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.isWithinBusinessHours.mockResolvedValue(false)

      await handleInboundMessage({
        tenantId: 'tenant-assign-2', from: '5511988887777', text: 'oi', provider: 'evolution', instanceName: 'inst-1',
      })

      expect(callsFor('leads', 'update')).toHaveLength(0)
    })

    it('reabrir uma conversa "resolved" grava conversation_status+updated_at num update só e insere o separador visual', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead, conversation_status: 'resolved' }, error: null }],
        messages: [
          { data: [{ id: 'msg-sep-1' }], error: null },
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
          { data: [{ id: 'msg-off-1' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.isWithinBusinessHours.mockResolvedValue(false)

      await handleInboundMessage({
        tenantId: 'tenant-reopen-1', from: '5511988887777', text: 'oi', provider: 'evolution',
      })

      const leadUpdates = callsFor('leads', 'update')
      expect(leadUpdates).toHaveLength(1)
      expect(leadUpdates[0].args[0].conversation_status).toBe('pending')
      expect(leadUpdates[0].args[0].updated_at).toBeTruthy()
      const sepMsg = callsFor('messages', 'insert').find((c) => c.args[0]?.role === 'system')
      expect(sepMsg.args[0].text).toBe('— Nova conversa iniciada —')
    })
  })

  describe('handleInboundMessage — mídia recebida (resolveMedia)', () => {
    it('baixa imagem via Meta Graph API e grava a media_url/mimetype na mensagem', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: '[imagem]' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.metaDownloadMedia.mockResolvedValue({ buffer: Buffer.from('imgbytes'), mimetype: 'image/jpeg' })
      mockState.isWithinBusinessHours.mockResolvedValue(false) // encurta o teste, não precisa da IA aqui

      await handleInboundMessage({
        tenantId: 'tenant-media-1', from: '5511988887777', text: '', provider: 'meta_whatsapp',
        mediaType: 'image', mediaId: 'media-123', mediaMimeType: 'image/jpeg', mediaFilename: 'foto.jpg',
      })

      expect(mockState.metaDownloadMedia).toHaveBeenCalledWith('tenant-media-1', 'media-123')
      expect(mockState.uploadChatMedia).toHaveBeenCalledWith('tenant-media-1', Buffer.from('imgbytes'), 'image/jpeg', 'foto.jpg')
      const leadMsgInsert = callsFor('messages', 'insert').find((c) => c.args[0]?.role === 'lead')
      expect(leadMsgInsert.args[0]).toMatchObject({ media_url: 'https://cdn.exemplo.com/midia.bin', media_type: 'image', media_mimetype: 'image/jpeg' })
    })

    it('baixa áudio via Evolution, transcreve e usa a transcrição como texto da mensagem (pra IA "escutar")', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'Isso é uma transcrição de teste.' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
        ai_configs: [{ data: [], error: null }],
      })
      mockState.evolutionDownloadMediaBase64.mockResolvedValue({ base64: Buffer.from('audiobytes').toString('base64'), mimetype: 'audio/ogg' })
      mockState.transcribeAudio.mockResolvedValue('Isso é uma transcrição de teste.')
      mockState.isWithinBusinessHours.mockResolvedValue(false)

      await handleInboundMessage({
        tenantId: 'tenant-media-2', from: '5511988887777', text: '', provider: 'evolution', instanceName: 'inst-1',
        mediaType: 'audio', mediaMessageId: 'wa-msg-1', mediaRemoteJid: '5511988887777@s.whatsapp.net', mediaFromMe: false,
        mediaMimeType: 'audio/ogg', mediaFilename: 'audio.ogg',
      })

      expect(mockState.evolutionDownloadMediaBase64).toHaveBeenCalledWith('inst-1', 'wa-msg-1', '5511988887777@s.whatsapp.net', false)
      expect(mockState.transcribeAudio).toHaveBeenCalled()
      const leadMsgInsert = callsFor('messages', 'insert').find((c) => c.args[0]?.role === 'lead')
      expect(leadMsgInsert.args[0]).toMatchObject({ text: 'Isso é uma transcrição de teste.', media_type: 'audio' })
    })

    it('não quebra o fluxo quando o download da mídia falha', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: '[imagem]' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.metaDownloadMedia.mockRejectedValue(new Error('Graph API indisponível'))
      mockState.isWithinBusinessHours.mockResolvedValue(false)

      await handleInboundMessage({
        tenantId: 'tenant-media-3', from: '5511988887777', text: '', provider: 'meta_whatsapp',
        mediaType: 'image', mediaId: 'media-123',
      })

      const leadMsgInsert = callsFor('messages', 'insert').find((c) => c.args[0]?.role === 'lead')
      expect(leadMsgInsert.args[0].media_url).toBeNull()
    })
  })

  describe('handleInboundMessage — citação de mensagem (resolveReplyToId)', () => {
    it('resolve o reply_to_id a partir do wa_message_id citado no webhook', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 77 }], error: null }, // resolveReplyToId: acha a mensagem citada
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'respondendo' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.isWithinBusinessHours.mockResolvedValue(false)

      await handleInboundMessage({
        tenantId: 'tenant-reply-1', from: '5511988887777', text: 'respondendo', provider: 'evolution',
        replyToWaId: 'wa-quoted-1',
      })

      const leadMsgInsert = callsFor('messages', 'insert').find((c) => c.args[0]?.role === 'lead')
      expect(leadMsgInsert.args[0].reply_to_id).toBe(77)
    })

    it('reply_to_id fica null quando não há replyToWaId', async () => {
      setSupabase({
        leads: [{ data: { ...baseLead }, error: null }],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.isWithinBusinessHours.mockResolvedValue(false)

      await handleInboundMessage({
        tenantId: 'tenant-reply-2', from: '5511988887777', text: 'oi', provider: 'evolution',
      })

      const leadMsgInsert = callsFor('messages', 'insert').find((c) => c.args[0]?.role === 'lead')
      expect(leadMsgInsert.args[0].reply_to_id).toBeNull()
    })
  })

  describe('handleInboundMessage — reanálise em background após a resposta da IA', () => {
    it('depois que analyzeLead resolve, grava score/intenção/estágio e registra a mudança de estágio', async () => {
      setSupabase({
        leads: [
          { data: { ...baseLead, stage: 'Novo' }, error: null }, // upsert inicial
          { data: null, error: null }, // update de score/intention/stage feito pela reanálise
        ],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'quero comprar' }], error: null },
          { data: [{ id: 'msg-ai-1' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.runAgent.mockResolvedValue({ reply: 'Ótimo, vou te ajudar!', scheduled: null })
      mockState.analyzeLead.mockResolvedValue({ score: 85, intention: 'Quer comprar', stage: 'Qualificado', interests: ['plano-pro'] })

      await handleInboundMessage({
        tenantId: 'tenant-reanalyze-1', from: '5511988887777', text: 'quero comprar', provider: 'evolution',
      })
      await flushMicrotasks()

      const leadUpdate = callsFor('leads', 'update').find((c) => c.args[0]?.score === 85)
      expect(leadUpdate.args[0]).toMatchObject({ score: 85, intention: 'Quer comprar', stage: 'Qualificado' })
      const historyInsert = callsFor('lead_stage_history', 'insert')[0]
      expect(historyInsert.args[0]).toMatchObject({ from_stage: 'Novo', to_stage: 'Qualificado', notes: 'Movido automaticamente pela IA' })
    })

    it('não registra mudança de estágio quando a reanálise mantém o mesmo estágio', async () => {
      setSupabase({
        leads: [
          { data: { ...baseLead, stage: 'Qualificado' }, error: null },
          { data: null, error: null },
        ],
        messages: [
          { data: [{ id: 'msg-lead-1' }], error: null },
          { data: [{ role: 'lead', text: 'oi de novo' }], error: null },
          { data: [{ id: 'msg-ai-1' }], error: null },
        ],
        tenants: [{ data: [{ name: 'Empresa Teste', ai_enabled: true }], error: null }],
      })
      mockState.runAgent.mockResolvedValue({ reply: 'Oi de novo!', scheduled: null })
      mockState.analyzeLead.mockResolvedValue({ score: 80, intention: 'Quer comprar', stage: 'Qualificado', interests: [] })

      await handleInboundMessage({
        tenantId: 'tenant-reanalyze-2', from: '5511988887777', text: 'oi de novo', provider: 'evolution',
      })
      await flushMicrotasks()

      expect(callsFor('lead_stage_history', 'insert')).toHaveLength(0)
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

    it('normaliza o telefone (dígitos) ao casar a marca de dedup, então "(11) 98888-7777" bate com "11988887777"', async () => {
      setSupabase({})
      markSentByPlatform('tenant-dedupe-norm', '(11) 98888-7777', 'texto idêntico')

      await handleOutboundMessage({
        tenantId: 'tenant-dedupe-norm', to: '11988887777', text: 'texto idêntico', provider: 'evolution',
      })

      expect(supabaseMock.supabase.from).not.toHaveBeenCalled()
    })

    describe('expiração da marca de dedup após 30s (vi.useFakeTimers)', () => {
      afterEach(() => {
        vi.useRealTimers()
      })

      it('volta a processar normalmente a mesma mensagem depois que a marca de 30s expira', async () => {
        vi.useFakeTimers()
        setSupabase({})
        markSentByPlatform('tenant-ttl-1', '5511988887777', 'mensagem enviada pela IA')

        // ainda dentro da janela de 30s — deve ser descartada sem tocar o banco
        await handleOutboundMessage({
          tenantId: 'tenant-ttl-1', to: '5511988887777', text: 'mensagem enviada pela IA', provider: 'evolution',
        })
        expect(supabaseMock.supabase.from).not.toHaveBeenCalled()

        // marca de novo (a chamada acima consumiu/deletou a entrada) e avança o relógio
        // além dos 30s configurados em orchestrator.js — a entrada deve expirar sozinha
        markSentByPlatform('tenant-ttl-1', '5511988887777', 'mensagem enviada pela IA')
        await vi.advanceTimersByTimeAsync(30_001)

        setSupabase({
          leads: [{ data: { id: 'lead-ttl-1', group_subject: null }, error: null }],
          messages: [{ data: [], error: null }],
        })

        await handleOutboundMessage({
          tenantId: 'tenant-ttl-1', to: '5511988887777', text: 'mensagem enviada pela IA', provider: 'evolution',
        })

        // como a marca expirou, o fluxo normal roda de verdade (consulta/upserta o lead)
        expect(callsFor('leads', 'upsert')).toHaveLength(1)
      })
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
