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

  describe('GET /operators', () => {
    it('lista os operadores ativos do tenant', async () => {
      setSupabase({ users: [{ data: [{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'agent' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/chat/operators')
      expect(res.status).toBe(200)
      expect(res.body.operators).toHaveLength(1)
    })
  })

  describe('GET /:leadId/logs', () => {
    it('lista os logs do ticket', async () => {
      setSupabase({ ticket_logs: [{ data: [{ id: 'log-1', action: 'opened' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-1/logs')
      expect(res.status).toBe(200)
      expect(res.body.logs).toHaveLength(1)
    })
  })

  describe('GET/PUT /:leadId/group-access', () => {
    it('GET retorna 403 para quem não é manager', async () => {
      mockState.user = { id: 'user-2', tenantId: 'tenant-1', role: 'agent', name: 'Operador' }
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-1/group-access')
      expect(res.status).toBe(403)
    })

    it('GET retorna 404 quando a conversa não existe', async () => {
      setSupabase({ leads: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-x/group-access')
      expect(res.status).toBe(404)
    })

    it('GET retorna 400 quando a conversa não é um grupo', async () => {
      setSupabase({ leads: [{ data: [{ id: 'lead-1', is_group: false }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-1/group-access')
      expect(res.status).toBe(400)
    })

    it('GET lista operadores do tenant e quem já tem acesso ao grupo', async () => {
      setSupabase({
        leads: [{ data: [{ id: 'lead-1', is_group: true }], error: null }],
        users: [{ data: [{ id: 'u1', name: 'Ana', email: 'ana@ex.com' }], error: null }],
        whatsapp_group_access: [{ data: [{ user_id: 'u1' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-1/group-access')
      expect(res.status).toBe(200)
      expect(res.body.granted_user_ids).toEqual(['u1'])
    })

    it('PUT exige um array de user_ids', async () => {
      setSupabase({ leads: [{ data: [{ id: 'lead-1', is_group: true }], error: null }] })
      const app = buildApp()
      const res = await request(app).put('/api/chat/lead-1/group-access').send({})
      expect(res.status).toBe(400)
    })

    it('PUT substitui a lista de acesso do grupo', async () => {
      setSupabase({ leads: [{ data: [{ id: 'lead-1', is_group: true }], error: null }] })
      const app = buildApp()
      const res = await request(app).put('/api/chat/lead-1/group-access').send({ user_ids: ['u1', 'u2'] })
      expect(res.status).toBe(200)
      expect(deleteCallsFor('whatsapp_group_access')).toHaveLength(1)
      const insert = insertCallsFor('whatsapp_group_access')[0]
      expect(insert.args[0]).toEqual([
        { tenant_id: 'tenant-1', lead_id: 'lead-1', user_id: 'u1' },
        { tenant_id: 'tenant-1', lead_id: 'lead-1', user_id: 'u2' },
      ])
    })
  })

  describe('POST /:leadId/media', () => {
    it('retorna 400 quando nenhum arquivo é enviado', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/media')
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando o lead não existe', async () => {
      setSupabase({ leads: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/media').attach('file', Buffer.from('img'), { filename: 'foto.png', contentType: 'image/png' })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o ticket não está aberto', async () => {
      setSupabase({ leads: [{ data: [{ id: 'lead-1', conversation_status: 'pending' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/media').attach('file', Buffer.from('img'), { filename: 'foto.png', contentType: 'image/png' })
      expect(res.status).toBe(403)
    })

    it('sobe a mídia, salva a mensagem e envia via WhatsApp', async () => {
      setSupabase({
        leads: [{ data: [{ id: 'lead-1', phone: '5511988887777', conversation_status: 'open', human_takeover: true }], error: null }],
        messages: [{ data: { id: 20 }, error: null }],
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/chat/lead-1/media')
        .field('caption', 'Segue o catálogo')
        .attach('file', Buffer.from('img'), { filename: 'foto.png', contentType: 'image/png' })

      expect(res.status).toBe(201)
      expect(mockState.uploadChatMedia).toHaveBeenCalled()
      expect(mockState.sendMedia).toHaveBeenCalledWith('tenant-1', '5511988887777', expect.objectContaining({ filename: 'foto.png', caption: 'Segue o catálogo' }))
      const insert = insertCallsFor('messages')[0]
      expect(insert.args[0]).toMatchObject({ media_type: 'image', media_mimetype: 'image/png' })
    })

    it('rejeita tipo de arquivo não permitido', async () => {
      setSupabase({ leads: [{ data: [{ id: 'lead-1', conversation_status: 'open' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/media').attach('file', Buffer.from('x'), { filename: 'virus.exe', contentType: 'application/x-msdownload' })
      expect(res.status).toBe(400)
    })

    it('salva a duração do áudio quando enviada pelo frontend', async () => {
      setSupabase({
        leads: [{ data: [{ id: 'lead-1', phone: '5511988887777', conversation_status: 'open', human_takeover: true }], error: null }],
        messages: [{ data: { id: 21 }, error: null }],
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/chat/lead-1/media')
        .field('duration', '10')
        .attach('file', Buffer.from('audiobytes'), { filename: 'audio.webm', contentType: 'audio/webm' })

      expect(res.status).toBe(201)
      const insert = insertCallsFor('messages')[0]
      expect(insert.args[0]).toMatchObject({ media_type: 'audio', media_duration_seconds: 10 })
    })

    it('ignora duração ausente, inválida ou fora do plausível', async () => {
      setSupabase({
        leads: [{ data: [{ id: 'lead-1', conversation_status: 'open' }], error: null }],
        messages: [{ data: { id: 22 }, error: null }],
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/chat/lead-1/media')
        .field('duration', '-5')
        .attach('file', Buffer.from('audiobytes'), { filename: 'audio.webm', contentType: 'audio/webm' })

      expect(res.status).toBe(201)
      const insert = insertCallsFor('messages')[0]
      expect(insert.args[0]).toMatchObject({ media_type: 'audio', media_duration_seconds: null })
    })

    it('ignora duração enviada para tipos de mídia que não são áudio', async () => {
      setSupabase({
        leads: [{ data: [{ id: 'lead-1', conversation_status: 'open' }], error: null }],
        messages: [{ data: { id: 23 }, error: null }],
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/chat/lead-1/media')
        .field('duration', '10')
        .attach('file', Buffer.from('img'), { filename: 'foto.png', contentType: 'image/png' })

      expect(res.status).toBe(201)
      const insert = insertCallsFor('messages')[0]
      expect(insert.args[0]).toMatchObject({ media_type: 'image', media_duration_seconds: null })
    })
  })

  describe('POST /:leadId/location', () => {
    it('retorna 400 com coordenadas inválidas', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/location').send({ latitude: 'x', longitude: 'y' })
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando o lead não existe', async () => {
      setSupabase({ leads: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/location').send({ latitude: 1, longitude: 2 })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o ticket não está aberto', async () => {
      setSupabase({ leads: [{ data: [{ id: 'lead-1', conversation_status: 'pending' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/location').send({ latitude: 1, longitude: 2 })
      expect(res.status).toBe(403)
    })

    it('salva e envia a localização', async () => {
      setSupabase({
        leads: [{ data: [{ id: 'lead-1', phone: '5511988887777', conversation_status: 'open' }], error: null }],
        messages: [{ data: { id: 30 }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/location').send({ latitude: -25.4, longitude: -49.2 })

      expect(res.status).toBe(201)
      expect(mockState.sendLocation).toHaveBeenCalledWith('tenant-1', '5511988887777', { latitude: -25.4, longitude: -49.2 })
      const waUpdate = updateCallsFor('messages').find((c) => c.args[0]?.wa_message_id === 'wa-3')
      expect(waUpdate).toBeTruthy()
    })
  })

  describe('POST /:leadId/messages/:messageId/forward', () => {
    it('exige toLeadId', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({})
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando a mensagem original não existe', async () => {
      setSupabase({ messages: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-2' })
      expect(res.status).toBe(404)
    })

    it('retorna 404 quando o lead de destino não existe', async () => {
      setSupabase({
        messages: [{ data: [{ id: 1, text: 'Oi', deleted_at: null }], error: null }],
        leads: [{ data: [], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-x' })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o ticket de destino não está aberto', async () => {
      setSupabase({
        messages: [{ data: [{ id: 1, text: 'Oi', deleted_at: null }], error: null }],
        leads: [{ data: [{ id: 'lead-2', conversation_status: 'pending' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-2' })
      expect(res.status).toBe(403)
    })

    it('encaminha texto simples via sendText', async () => {
      setSupabase({
        messages: [
          { data: [{ id: 1, text: 'Olá, tudo bem?', deleted_at: null }], error: null },
          { data: { id: 40 }, error: null },
        ],
        leads: [{ data: [{ id: 'lead-2', phone: '5511977776666', conversation_status: 'open', human_takeover: false }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-2' })

      expect(res.status).toBe(201)
      expect(mockState.sendText).toHaveBeenCalledWith('tenant-1', '5511977776666', 'Olá, tudo bem?')
      const insert = insertCallsFor('messages')[0]
      expect(insert.args[0]).toMatchObject({ forwarded_from_id: 1, lead_id: 'lead-2' })
    })

    it('encaminha localização via sendLocation', async () => {
      setSupabase({
        messages: [
          { data: [{ id: 1, text: 'Localização compartilhada', location_lat: -25.4, location_lng: -49.2, deleted_at: null }], error: null },
          { data: { id: 41 }, error: null },
        ],
        leads: [{ data: [{ id: 'lead-2', phone: '5511977776666', conversation_status: 'open' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-2' })

      expect(res.status).toBe(201)
      expect(mockState.sendLocation).toHaveBeenCalledWith('tenant-1', '5511977776666', { latitude: -25.4, longitude: -49.2 })
    })

    it('encaminha mídia buscando o media_url via safeFetch e reenviando via sendMedia', async () => {
      setSupabase({
        messages: [
          { data: [{ id: 1, text: '[imagem]', media_url: 'https://cdn.exemplo.com/foto.png', media_mimetype: 'image/png', media_filename: 'foto.png', deleted_at: null }], error: null },
          { data: { id: 42 }, error: null },
        ],
        leads: [{ data: [{ id: 'lead-2', phone: '5511977776666', conversation_status: 'open' }], error: null }],
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, arrayBuffer: async () => new TextEncoder().encode('imgbytes').buffer }))
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-2' })

      expect(res.status).toBe(201)
      expect(mockState.sendMedia).toHaveBeenCalledWith('tenant-1', '5511977776666', expect.objectContaining({ mimetype: 'image/png', filename: 'foto.png' }))
      vi.unstubAllGlobals()
    })
  })

  describe('ciclo de vida do ticket', () => {
    it('POST /:leadId/transfer-to transfere para outro operador e registra o log', async () => {
      setSupabase({
        users: [{ data: [{ id: 'u2', name: 'Bia', email: 'bia@ex.com' }], error: null }],
        leads: [{ data: { id: 'lead-1', conversation_status: 'open', assigned_to: 'u2' }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/transfer-to').send({ userId: 'u2' })

      expect(res.status).toBe(200)
      expect(res.body.to).toMatchObject({ id: 'u2', name: 'Bia' })
      const logEvent = insertCallsFor('ticket_logs')[0]
      expect(logEvent.args[0]).toMatchObject({ action: 'transferred', to_user_id: 'u2' })
    })

    it('POST /:leadId/transfer-to exige userId', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/transfer-to').send({})
      expect(res.status).toBe(400)
    })

    it('POST /:leadId/transfer-to retorna 404 quando o operador não existe', async () => {
      setSupabase({ users: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/transfer-to').send({ userId: 'u-x' })
      expect(res.status).toBe(404)
    })

    it('POST /:leadId/attend assume o atendimento e loga a abertura', async () => {
      setSupabase({ leads: [{ data: { id: 'lead-1', conversation_status: 'open', assigned_to: 'user-1' }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/attend')
      expect(res.status).toBe(200)
      const logEvent = insertCallsFor('ticket_logs')[0]
      expect(logEvent.args[0]).toMatchObject({ action: 'opened' })
    })

    it('POST /:leadId/reopen reabre o ticket e loga', async () => {
      setSupabase({ leads: [{ data: { id: 'lead-1', conversation_status: 'open' }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/reopen')
      expect(res.status).toBe(200)
      const logEvent = insertCallsFor('ticket_logs')[0]
      expect(logEvent.args[0]).toMatchObject({ action: 'reopened' })
    })

    it('POST /:leadId/return-to-queue devolve pra fila (limpa assigned_to e human_takeover)', async () => {
      setSupabase({ leads: [{ data: { id: 'lead-1', conversation_status: 'pending' }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/return-to-queue')
      expect(res.status).toBe(200)
      const leadUpdate = updateCallsFor('leads')[0]
      expect(leadUpdate.args[0]).toMatchObject({ conversation_status: 'pending', human_takeover: false, assigned_to: null })
      const logEvent = insertCallsFor('ticket_logs')[0]
      expect(logEvent.args[0]).toMatchObject({ action: 'pending' })
    })

    it('POST /:leadId/resolve finaliza o atendimento e loga o fechamento', async () => {
      setSupabase({ leads: [{ data: { id: 'lead-1', conversation_status: 'resolved' }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/resolve')
      expect(res.status).toBe(200)
      const logEvent = insertCallsFor('ticket_logs')[0]
      expect(logEvent.args[0]).toMatchObject({ action: 'closed' })
    })
  })

  describe('mensagens agendadas', () => {
    it('GET /:leadId/schedule lista as pendentes', async () => {
      setSupabase({ scheduled_messages: [{ data: [{ id: 's1', text: 'Lembrete', status: 'pending' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-1/schedule')
      expect(res.status).toBe(200)
      expect(res.body.scheduled).toHaveLength(1)
    })

    it('POST /:leadId/schedule rejeita data no passado', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/schedule').send({ text: 'Oi', send_at: '2020-01-01T00:00:00.000Z' })
      expect(res.status).toBe(400)
    })

    it('POST /:leadId/schedule retorna 404 quando o lead não existe', async () => {
      setSupabase({ leads: [{ data: [], error: null }] })
      const app = buildApp()
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      const res = await request(app).post('/api/chat/lead-1/schedule').send({ text: 'Oi', send_at: futureDate })
      expect(res.status).toBe(404)
    })

    it('POST /:leadId/schedule agenda a mensagem', async () => {
      setSupabase({
        leads: [{ data: [{ id: 'lead-1' }], error: null }],
        scheduled_messages: [{ data: { id: 's1', text: 'Oi' }, error: null }],
      })
      const app = buildApp()
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      const res = await request(app).post('/api/chat/lead-1/schedule').send({ text: 'Oi', send_at: futureDate })
      expect(res.status).toBe(201)
    })

    it('DELETE /:leadId/schedule/:id retorna 404 quando não existe', async () => {
      setSupabase({ scheduled_messages: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1/schedule/s1')
      expect(res.status).toBe(404)
    })

    it('DELETE /:leadId/schedule/:id retorna 400 quando já foi processado', async () => {
      setSupabase({ scheduled_messages: [{ data: [{ status: 'sent' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1/schedule/s1')
      expect(res.status).toBe(400)
    })

    it('DELETE /:leadId/schedule/:id cancela o agendamento pendente', async () => {
      setSupabase({ scheduled_messages: [{ data: [{ status: 'pending' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1/schedule/s1')
      expect(res.status).toBe(200)
      const update = updateCallsFor('scheduled_messages')[0]
      expect(update.args[0]).toEqual({ status: 'cancelled' })
    })
  })

  describe('acompanhamentos — cancelar/finalizar/reiniciar', () => {
    it('POST /:leadId/followup/:enrollmentId/cancel retorna 404 quando não há acompanhamento ativo', async () => {
      setSupabase({ followup_enrollments: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/enr-1/cancel')
      expect(res.status).toBe(404)
    })

    it('POST /:leadId/followup/:enrollmentId/cancel cancela e marca as mensagens pendentes como canceladas', async () => {
      setSupabase({ followup_enrollments: [{ data: [{ id: 'enr-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/enr-1/cancel')
      expect(res.status).toBe(200)
      expect(res.body.cancelled).toBe(true)
      const enrollmentUpdate = updateCallsFor('followup_enrollments').find((c) => c.args[0]?.status === 'cancelled')
      expect(enrollmentUpdate).toBeTruthy()
      const msgsUpdate = updateCallsFor('followup_enrollment_messages').find((c) => c.args[0]?.status === 'cancelled')
      expect(msgsUpdate).toBeTruthy()
    })

    it('POST /:leadId/followup/:enrollmentId/finish finaliza o acompanhamento', async () => {
      setSupabase({ followup_enrollments: [{ data: [{ id: 'enr-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/enr-1/finish')
      expect(res.status).toBe(200)
      expect(res.body.finished).toBe(true)
      const enrollmentUpdate = updateCallsFor('followup_enrollments').find((c) => c.args[0]?.status === 'completed')
      expect(enrollmentUpdate).toBeTruthy()
    })

    it('POST /:leadId/followup/:enrollmentId/restart retorna 404 quando o acompanhamento não existe', async () => {
      setSupabase({ followup_enrollments: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/enr-1/restart')
      expect(res.status).toBe(404)
    })

    it('POST /:leadId/followup/:enrollmentId/restart para o atual e cria um novo enrollment', async () => {
      setSupabase({
        followup_enrollments: [
          { data: [{ sequence_id: 'seq-1' }], error: null }, // busca sequence_id do enrollment atual
          { data: [{ id: 'enr-1' }], error: null }, // stopEnrollment: confirma que está ativo
          { data: { id: 'enr-2', sequence_id: 'seq-1' }, error: null }, // insert do novo enrollment
          { data: [{ id: 'enr-2', sequence_id: 'seq-1', status: 'active', started_at: '2026-01-01T00:00:00.000Z' }], error: null }, // loadActiveFollowup final
        ],
        followup_sequences: [
          { data: [{ id: 'seq-1', name: 'Seq X', time_mode: 'default', default_send_time: '09:00' }], error: null },
          { data: [{ name: 'Seq X' }], error: null },
        ],
        followup_steps: [{ data: [], error: null }],
        followup_enrollment_messages: [
          { data: [], error: null },
        ],
      })
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/enr-1/restart')
      expect(res.status).toBe(201)
      const cancelledUpdate = updateCallsFor('followup_enrollments').find((c) => c.args[0]?.status === 'cancelled')
      expect(cancelledUpdate).toBeTruthy()
      const newInsert = insertCallsFor('followup_enrollments')[0]
      expect(newInsert.args[0]).toMatchObject({ sequence_id: 'seq-1' })
    })
  })
})
