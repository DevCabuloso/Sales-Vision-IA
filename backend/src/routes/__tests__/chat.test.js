import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({
  box: {}, user: null, logUsage: null, uploadChatMedia: null, getTenantTimezone: null,
  sendText: null, sendMedia: null, sendLocation: null, editMessage: null, deleteMessage: null,
  markSentByPlatform: null,
}))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../../services/usage.js', () => ({
  logUsage: (...args) => mockState.logUsage(...args),
}))

vi.mock('../../services/mediaStorage.js', () => ({
  uploadChatMedia: (...args) => mockState.uploadChatMedia(...args),
}))

vi.mock('../business-hours.js', () => ({
  getTenantTimezone: (...args) => mockState.getTenantTimezone(...args),
}))

vi.mock('../../services/whatsapp/index.js', () => ({
  sendText: (...args) => mockState.sendText(...args),
  sendMedia: (...args) => mockState.sendMedia(...args),
  sendLocation: (...args) => mockState.sendLocation(...args),
  editMessage: (...args) => mockState.editMessage(...args),
  deleteMessage: (...args) => mockState.deleteMessage(...args),
}))

vi.mock('../../services/orchestrator.js', () => ({
  markSentByPlatform: (...args) => mockState.markSentByPlatform(...args),
}))

const { chatRouter } = await import('../chat.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/chat', chatRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function updateCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update') }
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }
function deleteCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'delete') }

describe('routes/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin', name: 'Ana' }
    mockState.logUsage = vi.fn().mockResolvedValue(undefined)
    mockState.uploadChatMedia = vi.fn().mockResolvedValue('https://cdn.exemplo.com/arquivo.png')
    mockState.getTenantTimezone = vi.fn().mockResolvedValue('America/Sao_Paulo')
    mockState.sendText = vi.fn().mockResolvedValue({ id: 'wa-1', provider: 'evolution', remoteJid: '5511@s.whatsapp.net' })
    mockState.sendMedia = vi.fn().mockResolvedValue({ id: 'wa-2', provider: 'evolution' })
    mockState.sendLocation = vi.fn().mockResolvedValue({ id: 'wa-3', provider: 'evolution' })
    mockState.editMessage = vi.fn().mockResolvedValue({ ok: true })
    mockState.deleteMessage = vi.fn().mockResolvedValue({ ok: true })
    mockState.markSentByPlatform = vi.fn()
  })

  describe('GET / (listar conversas)', () => {
    it('manager vê todas as conversas sem filtro adicional', async () => {
      setSupabase({
        leads: [{ data: [{ id: 'lead-1', is_group: false, assigned_to: null, conversation_status: 'pending', queue_id: null, updated_at: '2026-01-01' }], error: null }],
        messages: [{ data: [{ lead_id: 'lead-1', text: 'Oi', role: 'lead', created_at: '2026-01-01' }], error: null }],
        channels: [{ data: [], error: null }],
      })
      const app = buildApp()
      const res = await request(app).get('/api/chat')
      expect(res.status).toBe(200)
      expect(res.body.leads).toHaveLength(1)
      expect(res.body.leads[0].lastMessage.text).toBe('Oi')
    })

    it('operador não-manager só vê tickets pendentes sem fila atribuída (quando show_unassigned_tickets é true) ou atribuídos a ele', async () => {
      mockState.user = { id: 'user-2', tenantId: 'tenant-1', role: 'agent', name: 'Operador' }
      setSupabase({
        leads: [{
          data: [
            { id: 'lead-A', is_group: false, assigned_to: null, conversation_status: 'pending', queue_id: null, updated_at: '2026-01-01' },
            { id: 'lead-B', is_group: false, assigned_to: 'outro-user', conversation_status: 'pending', queue_id: 'queue-x', updated_at: '2026-01-01' },
            { id: 'lead-C', is_group: false, assigned_to: 'user-2', conversation_status: 'open', queue_id: null, updated_at: '2026-01-01' },
          ], error: null,
        }],
        messages: [{ data: [], error: null }],
        channels: [{ data: [], error: null }],
        queue_operators: [{ data: [], error: null }],
        tenants: [{ data: [{ op_settings: {} }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).get('/api/chat')
      const ids = res.body.leads.map((l) => l.id)
      expect(ids).toContain('lead-A') // pending sem fila, show_unassigned padrão true
      expect(ids).toContain('lead-C') // atribuído a mim
      expect(ids).not.toContain('lead-B') // pendente com fila que não é minha
    })
  })

  describe('POST /start', () => {
    it('exige telefone', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/start').send({ name: 'Ana' })
      expect(res.status).toBe(400)
    })

    it('cria/atualiza o lead, registra o log do ticket e envia a mensagem inicial', async () => {
      setSupabase({
        leads: [{ data: { id: 'lead-1', name: 'Ana', phone: '5511988887777', stage: 'Novo Lead', conversation_status: 'open', assigned_to: 'user-1' }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/start').send({ phone: '(11) 98888-7777', name: 'Ana', message: 'Oi, tudo bem?' })

      expect(res.status).toBe(201)
      expect(insertCallsFor('ticket_logs')[0].args[0]).toMatchObject({ action: 'opened' })
      expect(insertCallsFor('messages')[0].args[0]).toMatchObject({ role: 'agent', text: 'Oi, tudo bem?' })
      expect(mockState.sendText).toHaveBeenCalledWith('tenant-1', '11988887777', 'Oi, tudo bem?')
    })
  })

  describe('GET /:leadId/messages', () => {
    it('retorna as mensagens em ordem cronológica (mais antiga primeiro) por padrão', async () => {
      setSupabase({
        messages: [{ data: [{ id: 3, text: 'terceira' }, { id: 2, text: 'segunda' }, { id: 1, text: 'primeira' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-1/messages')
      expect(res.body.messages.map((m) => m.id)).toEqual([1, 2, 3])
    })
  })

  describe('POST /:leadId/messages', () => {
    it('retorna 404 quando o lead não existe', async () => {
      setSupabase({ leads: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-x/messages').send({ text: 'Oi' })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o ticket não está aberto', async () => {
      setSupabase({ leads: [{ data: [{ id: 'lead-1', phone: '5511988887777', conversation_status: 'pending' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages').send({ text: 'Oi' })
      expect(res.status).toBe(403)
    })

    it('envia a mensagem, marca como enviada pela plataforma e atualiza o wa_message_id', async () => {
      setSupabase({
        leads: [{ data: [{ id: 'lead-1', phone: '5511988887777', human_takeover: true, conversation_status: 'open' }], error: null }],
        messages: [{ data: { id: 10, text: 'Olá!' }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages').send({ text: 'Olá!' })

      expect(res.status).toBe(201)
      expect(mockState.markSentByPlatform).toHaveBeenCalledWith('tenant-1', '5511988887777', 'Olá!')
      expect(mockState.sendText).toHaveBeenCalledWith('tenant-1', '5511988887777', 'Olá!', expect.any(Object))
      const waUpdate = updateCallsFor('messages').find((c) => c.args[0]?.wa_message_id === 'wa-1')
      expect(waUpdate).toBeTruthy()
      expect(mockState.logUsage).toHaveBeenCalledWith('tenant-1', 'user-1', 'message_sent', { by: 'agent' })
    })

    it('não tenta enviar via WhatsApp quando o lead não tem telefone', async () => {
      setSupabase({
        leads: [{ data: [{ id: 'lead-1', phone: null, conversation_status: 'open' }], error: null }],
        messages: [{ data: { id: 11, text: 'Olá!' }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages').send({ text: 'Olá!' })
      expect(res.status).toBe(201)
      expect(mockState.sendText).not.toHaveBeenCalled()
    })
  })

  describe('PATCH /:leadId/messages/:messageId (editar)', () => {
    it('retorna 404 quando a mensagem não existe', async () => {
      setSupabase({ messages: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/chat/lead-1/messages/1').send({ text: 'novo texto' })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando a mensagem não foi enviada pela plataforma (role != agent)', async () => {
      setSupabase({ messages: [{ data: [{ id: 1, role: 'lead', provider: 'evolution', wa_message_id: 'wa-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/chat/lead-1/messages/1').send({ text: 'novo texto' })
      expect(res.status).toBe(403)
    })

    it('retorna 400 quando o provider não é evolution', async () => {
      setSupabase({ messages: [{ data: [{ id: 1, role: 'agent', provider: 'meta_whatsapp', wa_message_id: 'wa-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/chat/lead-1/messages/1').send({ text: 'novo texto' })
      expect(res.status).toBe(400)
    })

    it('edita a mensagem com sucesso quando todas as condições são atendidas', async () => {
      setSupabase({
        messages: [
          { data: [{ id: 1, role: 'agent', provider: 'evolution', wa_message_id: 'wa-1', wa_remote_jid: null }], error: null },
          { data: { id: 1, text: 'texto editado' }, error: null },
        ],
        leads: [{ data: [{ wa_remote_jid: '5511988887777@s.whatsapp.net' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).patch('/api/chat/lead-1/messages/1').send({ text: 'texto editado' })

      expect(res.status).toBe(200)
      expect(mockState.editMessage).toHaveBeenCalledWith('tenant-1', { waMessageId: 'wa-1', remoteJid: '5511988887777@s.whatsapp.net', newText: 'texto editado' })
    })

    it('mapeia a limitação conhecida de remoteJid/LID para 400', async () => {
      setSupabase({
        messages: [{ data: [{ id: 1, role: 'agent', provider: 'evolution', wa_message_id: 'wa-1', wa_remote_jid: '5511@lid' }], error: null }],
        leads: [{ data: [{ wa_remote_jid: '5511@lid' }], error: null }],
      })
      mockState.editMessage.mockRejectedValue(new Error('Invalid remoteJid'))
      const app = buildApp()
      const res = await request(app).patch('/api/chat/lead-1/messages/1').send({ text: 'x' })
      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /:leadId/messages/:messageId (apagar)', () => {
    it('é idempotente quando a mensagem já foi apagada', async () => {
      setSupabase({ messages: [{ data: [{ id: 1, deleted_at: '2026-01-01T00:00:00Z' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1/messages/1')
      expect(res.status).toBe(200)
      expect(mockState.deleteMessage).not.toHaveBeenCalled()
    })

    it('apaga a mensagem no WhatsApp e faz o soft-delete local', async () => {
      setSupabase({
        messages: [{ data: [{ id: 1, role: 'agent', provider: 'evolution', wa_message_id: 'wa-1', wa_remote_jid: '5511@s.whatsapp.net', deleted_at: null }], error: null }],
        leads: [{ data: [{ wa_remote_jid: '5511@s.whatsapp.net' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1/messages/1')

      expect(res.status).toBe(200)
      expect(mockState.deleteMessage).toHaveBeenCalledWith('tenant-1', { waMessageId: 'wa-1', remoteJid: '5511@s.whatsapp.net' })
      const softDelete = updateCallsFor('messages')[0]
      expect(softDelete.args[0]).toMatchObject({ text: '', media_url: null })
    })
  })

  describe('POST /:leadId/transfer', () => {
    it('transfere para humano: atualiza lead, loga uso e encerra sessão de fluxo ativa', async () => {
      setSupabase({ leads: [{ data: { id: 'lead-1', human_takeover: true }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/transfer').send({ human_takeover: true })

      expect(res.status).toBe(200)
      expect(mockState.logUsage).toHaveBeenCalledWith('tenant-1', 'user-1', 'human_takeover', { lead_id: 'lead-1' })
      const flowUpdate = updateCallsFor('flow_sessions').find((c) => c.args[0]?.status === 'transferred')
      expect(flowUpdate).toBeTruthy()
    })

    it('devolve para a IA: não loga uso nem encerra sessão de fluxo', async () => {
      setSupabase({ leads: [{ data: { id: 'lead-1', human_takeover: false }, error: null }] })
      const app = buildApp()
      await request(app).post('/api/chat/lead-1/transfer').send({ human_takeover: false })

      expect(mockState.logUsage).not.toHaveBeenCalled()
      expect(updateCallsFor('flow_sessions').length).toBe(0)
    })
  })

  describe('DELETE /:leadId (excluir conversa)', () => {
    it('retorna 403 para quem não é manager', async () => {
      mockState.user = { id: 'user-2', tenantId: 'tenant-1', role: 'agent', name: 'Operador' }
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1')
      expect(res.status).toBe(403)
    })

    it('manager exclui a conversa e todos os registros relacionados', async () => {
      setSupabase({ leads: [{ data: [{ id: 'lead-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1')

      expect(res.status).toBe(200)
      expect(deleteCallsFor('messages').length).toBe(1)
      expect(deleteCallsFor('ticket_logs').length).toBe(1)
      expect(deleteCallsFor('leads').length).toBe(1)
    })
  })

  describe('POST /:leadId/followup/start', () => {
    it('exige sequence_id', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/start').send({})
      expect(res.status).toBe(400)
    })

    it('retorna 409 quando já existe um acompanhamento ativo', async () => {
      setSupabase({
        followup_enrollments: [{ data: [{ id: 'enr-existing', sequence_id: 'seq-1', status: 'active', started_at: '2026-01-01T00:00:00.000Z' }], error: null }],
        followup_sequences: [{ data: [{ name: 'Seq X' }], error: null }],
        followup_enrollment_messages: [{ data: [{ order_index: 0, status: 'sent', send_at: '2026-01-01T00:00:00.000Z' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/start').send({ sequence_id: 'seq-1' })
      expect(res.status).toBe(409)
    })

    it('inicia um novo acompanhamento e materializa as mensagens da sequência', async () => {
      setSupabase({
        followup_enrollments: [
          { data: [], error: null },
          { data: { id: 'enr-1', sequence_id: 'seq-1' }, error: null },
          { data: [{ id: 'enr-1', sequence_id: 'seq-1', status: 'active', started_at: '2026-01-01T00:00:00.000Z' }], error: null },
        ],
        leads: [{ data: [{ id: 'lead-1' }], error: null }],
        followup_sequences: [
          { data: [{ id: 'seq-1', name: 'Sequência Pós-Venda', time_mode: 'default', default_send_time: '09:00' }], error: null },
          { data: [{ name: 'Sequência Pós-Venda' }], error: null },
        ],
        followup_steps: [{ data: [{ id: 'step-1', order_index: 0, delay_days: 0, text: 'Oi! Passando para saber se ficou alguma dúvida.' }], error: null }],
        followup_enrollment_messages: [
          { data: [{ id: 'fm-1' }], error: null },
          { data: [{ order_index: 0, status: 'pending', send_at: '2026-01-01T00:00:00.000Z' }], error: null },
        ],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/start').send({ sequence_id: 'seq-1' })

      expect(res.status).toBe(201)
      expect(res.body.followup).toMatchObject({ id: 'enr-1', sequence_name: 'Sequência Pós-Venda', status: 'active', total_steps: 1, sent_count: 0 })
      const materializeInsert = insertCallsFor('followup_enrollment_messages')[0]
      expect(materializeInsert.args[0]).toHaveLength(1)
    })
  })
})
