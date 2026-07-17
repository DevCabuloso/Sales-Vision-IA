import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({
  box: {}, user: null, logUsage: null, uploadChatMedia: null, getTenantTimezone: null,
  sendText: null, sendMedia: null, sendLocation: null, editMessage: null, deleteMessage: null,
  markSentByPlatform: null, permCalls: [],
}))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
  requirePermission: (...keys) => { mockState.permCalls.push(keys); return (req, res, next) => next() },
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
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

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function updateCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^UPDATE/.test(c.sql)) }
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^INSERT/.test(c.sql)) }
function deleteCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^DELETE/.test(c.sql)) }

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
    setRls()
  })

  it('exige a permissão "chat" (enforcement de operador restrito) em toda a rota', () => {
    expect(mockState.permCalls).toContainEqual(['chat', 'view'])
  })

  describe('GET / (listar conversas)', () => {
    it('manager vê todas as conversas sem filtro adicional', async () => {
      rlsMock.queueRows([{ id: 'lead-1', is_group: false, assigned_to: null, conversation_status: 'pending', queue_id: null, updated_at: '2026-01-01' }])
      rlsMock.queueRows([{ lead_id: 'lead-1', text: 'Oi', role: 'lead', created_at: '2026-01-01' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/chat')
      expect(res.status).toBe(200)
      expect(res.body.leads).toHaveLength(1)
      expect(res.body.leads[0].lastMessage.text).toBe('Oi')
    })

    it('operador não-manager só vê tickets pendentes sem fila atribuída (quando show_unassigned_tickets é true) ou atribuídos a ele', async () => {
      mockState.user = { id: 'user-2', tenantId: 'tenant-1', role: 'agent', name: 'Operador' }
      rlsMock.queueRows([
        { id: 'lead-A', is_group: false, assigned_to: null, conversation_status: 'pending', queue_id: null, updated_at: '2026-01-01' },
        { id: 'lead-B', is_group: false, assigned_to: 'outro-user', conversation_status: 'pending', queue_id: 'queue-x', updated_at: '2026-01-01' },
        { id: 'lead-C', is_group: false, assigned_to: 'user-2', conversation_status: 'open', queue_id: null, updated_at: '2026-01-01' },
      ])
      rlsMock.queueRows([])
      rlsMock.queueRows([])
      rlsMock.queueRows([])
      rlsMock.queueRows([{ op_settings: {} }])
      const app = buildApp()
      const res = await request(app).get('/api/chat')
      const ids = res.body.leads.map((l) => l.id)
      expect(ids).toContain('lead-A') // pending sem fila, show_unassigned padrão true
      expect(ids).toContain('lead-C') // atribuído a mim
      expect(ids).not.toContain('lead-B') // pendente com fila que não é minha
    })

    it('aceita limit/offset e reflete na resposta e nos parâmetros da query', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/chat').query({ limit: '20', offset: '40' })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ limit: 20, offset: 40 })
      const call = rlsMock.calls.find((c) => /FROM leads/.test(c.sql))
      expect(call.params.slice(-2)).toEqual([20, 40])
    })

    it('usa limit=300 e offset=0 por padrão, e limita o teto a 1000', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const defaultRes = await request(app).get('/api/chat')
      expect(defaultRes.body).toMatchObject({ limit: 300, offset: 0 })

      rlsMock.queueRows([])
      const cappedRes = await request(app).get('/api/chat').query({ limit: '5000' })
      expect(cappedRes.body.limit).toBe(1000)
    })
  })

  describe('POST /start', () => {
    it('exige telefone', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/start').send({ name: 'Ana' })
      expect(res.status).toBe(400)
    })

    it('cria/atualiza o lead, registra o log do ticket e envia a mensagem inicial', async () => {
      rlsMock.queueRows([{ id: 'lead-1', name: 'Ana', phone: '5511988887777', stage: 'Novo Lead', conversation_status: 'open', assigned_to: 'user-1' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/start').send({ phone: '(11) 98888-7777', name: 'Ana', message: 'Oi, tudo bem?' })

      expect(res.status).toBe(201)
      const ticketInsert = insertCallsMatching(/INSERT INTO ticket_logs/)[0]
      expect(ticketInsert.params).toContain('opened')
      const msgInsert = insertCallsMatching(/INSERT INTO messages/)[0]
      expect(msgInsert.sql).toContain("'agent'")
      expect(msgInsert.params).toContain('Oi, tudo bem?')
      expect(mockState.sendText).toHaveBeenCalledWith('tenant-1', '11988887777', 'Oi, tudo bem?')
    })
  })

  describe('GET /:leadId/messages', () => {
    it('retorna as mensagens em ordem cronológica (mais antiga primeiro) por padrão', async () => {
      rlsMock.queueRows([{ id: 3, text: 'terceira' }, { id: 2, text: 'segunda' }, { id: 1, text: 'primeira' }])
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-1/messages')
      expect(res.body.messages.map((m) => m.id)).toEqual([1, 2, 3])
    })
  })

  describe('POST /:leadId/messages', () => {
    it('retorna 404 quando o lead não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-x/messages').send({ text: 'Oi' })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o ticket não está aberto', async () => {
      rlsMock.queueRows([{ id: 'lead-1', phone: '5511988887777', conversation_status: 'pending' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages').send({ text: 'Oi' })
      expect(res.status).toBe(403)
    })

    it('envia a mensagem, marca como enviada pela plataforma e atualiza o wa_message_id', async () => {
      rlsMock.queueRows([{ id: 'lead-1', phone: '5511988887777', human_takeover: true, conversation_status: 'open' }])
      rlsMock.queueRows([{ id: 10, text: 'Olá!' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages').send({ text: 'Olá!' })

      expect(res.status).toBe(201)
      expect(mockState.markSentByPlatform).toHaveBeenCalledWith('tenant-1', '5511988887777', 'Olá!')
      expect(mockState.sendText).toHaveBeenCalledWith('tenant-1', '5511988887777', 'Olá!', expect.any(Object))
      // envia ANTES de persistir — o wa_message_id/send_status já vêm no próprio insert, sem update posterior
      const insertCall = insertCallsMatching(/INSERT INTO messages/)[0]
      expect(insertCall.params).toContain('wa-1')
      expect(insertCall.params).toContain('sent')
      expect(updateCallsMatching(/messages/)).toHaveLength(0)
      expect(mockState.logUsage).toHaveBeenCalledWith('tenant-1', 'user-1', 'message_sent', { by: 'agent' })
    })

    it('persiste a mensagem com send_status "failed" quando o envio ao WhatsApp falha (sem sumir com o texto digitado)', async () => {
      rlsMock.queueRows([{ id: 'lead-1', phone: '5511988887777', human_takeover: true, conversation_status: 'open' }])
      rlsMock.queueRows([{ id: 11, text: 'Olá!', send_status: 'failed' }])
      mockState.sendText.mockRejectedValue(new Error('Evolution indisponível'))
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages').send({ text: 'Olá!' })

      expect(res.status).toBe(201)
      const insertCall = insertCallsMatching(/INSERT INTO messages/)[0]
      expect(insertCall.params).toContain('failed')
      expect(insertCall.params).toContain('Evolution indisponível')
    })

    it('não tenta enviar via WhatsApp quando o lead não tem telefone', async () => {
      rlsMock.queueRows([{ id: 'lead-1', phone: null, conversation_status: 'open' }])
      rlsMock.queueRows([{ id: 11, text: 'Olá!' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages').send({ text: 'Olá!' })
      expect(res.status).toBe(201)
      expect(mockState.sendText).not.toHaveBeenCalled()
    })
  })

  describe('PATCH /:leadId/messages/:messageId (editar)', () => {
    it('retorna 404 quando a mensagem não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/chat/lead-1/messages/1').send({ text: 'novo texto' })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando a mensagem não foi enviada pela plataforma (role != agent)', async () => {
      rlsMock.queueRows([{ id: 1, role: 'lead', provider: 'evolution', wa_message_id: 'wa-1' }])
      const app = buildApp()
      const res = await request(app).patch('/api/chat/lead-1/messages/1').send({ text: 'novo texto' })
      expect(res.status).toBe(403)
    })

    it('retorna 400 quando o provider não é evolution', async () => {
      rlsMock.queueRows([{ id: 1, role: 'agent', provider: 'meta_whatsapp', wa_message_id: 'wa-1' }])
      const app = buildApp()
      const res = await request(app).patch('/api/chat/lead-1/messages/1').send({ text: 'novo texto' })
      expect(res.status).toBe(400)
    })

    it('edita a mensagem com sucesso quando todas as condições são atendidas', async () => {
      rlsMock.queueRows([{ id: 1, role: 'agent', provider: 'evolution', wa_message_id: 'wa-1', wa_remote_jid: null }])
      rlsMock.queueRows([{ wa_remote_jid: '5511988887777@s.whatsapp.net' }])
      rlsMock.queueRows([{ id: 1, text: 'texto editado' }])
      const app = buildApp()
      const res = await request(app).patch('/api/chat/lead-1/messages/1').send({ text: 'texto editado' })

      expect(res.status).toBe(200)
      expect(mockState.editMessage).toHaveBeenCalledWith('tenant-1', { waMessageId: 'wa-1', remoteJid: '5511988887777@s.whatsapp.net', newText: 'texto editado' })
    })

    it('mapeia a limitação conhecida de remoteJid/LID para 400', async () => {
      rlsMock.queueRows([{ id: 1, role: 'agent', provider: 'evolution', wa_message_id: 'wa-1', wa_remote_jid: '5511@lid' }])
      rlsMock.queueRows([{ wa_remote_jid: '5511@lid' }])
      mockState.editMessage.mockRejectedValue(new Error('Invalid remoteJid'))
      const app = buildApp()
      const res = await request(app).patch('/api/chat/lead-1/messages/1').send({ text: 'x' })
      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /:leadId/messages/:messageId (apagar)', () => {
    it('é idempotente quando a mensagem já foi apagada', async () => {
      rlsMock.queueRows([{ id: 1, deleted_at: '2026-01-01T00:00:00Z' }])
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1/messages/1')
      expect(res.status).toBe(200)
      expect(mockState.deleteMessage).not.toHaveBeenCalled()
    })

    it('apaga a mensagem no WhatsApp e faz o soft-delete local', async () => {
      rlsMock.queueRows([{ id: 1, role: 'agent', provider: 'evolution', wa_message_id: 'wa-1', wa_remote_jid: '5511@s.whatsapp.net', deleted_at: null }])
      rlsMock.queueRows([{ wa_remote_jid: '5511@s.whatsapp.net' }])
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1/messages/1')

      expect(res.status).toBe(200)
      expect(mockState.deleteMessage).toHaveBeenCalledWith('tenant-1', { waMessageId: 'wa-1', remoteJid: '5511@s.whatsapp.net' })
      const softDelete = updateCallsMatching(/messages/)[0]
      expect(softDelete.sql).toContain('deleted_at')
    })
  })

  describe('POST /:leadId/transfer', () => {
    it('rejeita quando human_takeover não é booleano', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/transfer').send({ human_takeover: 'sim' })
      expect(res.status).toBe(400)
    })

    it('transfere para humano: atualiza lead, loga uso e encerra sessão de fluxo ativa', async () => {
      rlsMock.queueRows([{ id: 'lead-1', human_takeover: true }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/transfer').send({ human_takeover: true })

      expect(res.status).toBe(200)
      expect(mockState.logUsage).toHaveBeenCalledWith('tenant-1', 'user-1', 'human_takeover', { lead_id: 'lead-1' })
      const flowUpdate = updateCallsMatching(/flow_sessions/).find((c) => c.sql.includes("'transferred'"))
      expect(flowUpdate).toBeTruthy()
    })

    it('devolve para a IA: não loga uso nem encerra sessão de fluxo', async () => {
      rlsMock.queueRows([{ id: 'lead-1', human_takeover: false }])
      const app = buildApp()
      await request(app).post('/api/chat/lead-1/transfer').send({ human_takeover: false })

      expect(mockState.logUsage).not.toHaveBeenCalled()
      expect(updateCallsMatching(/flow_sessions/).length).toBe(0)
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
      rlsMock.queueRows([{ id: 'lead-1' }])
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1')

      expect(res.status).toBe(200)
      expect(deleteCallsMatching(/messages/).length).toBe(1)
      expect(deleteCallsMatching(/ticket_logs/).length).toBe(1)
      expect(deleteCallsMatching(/leads/).length).toBe(1)
    })
  })

  describe('POST /:leadId/followup/start', () => {
    it('exige sequence_id', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/start').send({})
      expect(res.status).toBe(400)
    })

    it('retorna 409 quando já existe um acompanhamento ativo', async () => {
      rlsMock.queueRows([{ id: 'enr-existing', sequence_id: 'seq-1', status: 'active', started_at: '2026-01-01T00:00:00.000Z' }])
      rlsMock.queueRows([{ name: 'Seq X' }])
      rlsMock.queueRows([{ order_index: 0, status: 'sent', send_at: '2026-01-01T00:00:00.000Z' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/start').send({ sequence_id: 'seq-1' })
      expect(res.status).toBe(409)
    })

    it('inicia um novo acompanhamento e materializa as mensagens da sequência', async () => {
      rlsMock.queueRows([]) // loadActiveFollowup#1: sem enrollment ativo
      rlsMock.queueRows([{ id: 'lead-1' }]) // lead existe
      rlsMock.queueRows([{ id: 'seq-1', name: 'Sequência Pós-Venda', time_mode: 'default', default_send_time: '09:00' }]) // sequência
      rlsMock.queueRows([{ id: 'enr-1', sequence_id: 'seq-1' }]) // insert enrollment
      rlsMock.queueRows([{ id: 'step-1', order_index: 0, delay_days: 0, text: 'Oi! Passando para saber se ficou alguma dúvida.' }]) // followup_steps
      rlsMock.queueRows([{ id: 'fm-1' }]) // insert enrollment_messages
      rlsMock.queueRows([{ id: 'enr-1', sequence_id: 'seq-1', status: 'active', started_at: '2026-01-01T00:00:00.000Z' }]) // loadActiveFollowup#2
      rlsMock.queueRows([{ name: 'Sequência Pós-Venda' }])
      rlsMock.queueRows([{ order_index: 0, status: 'pending', send_at: '2026-01-01T00:00:00.000Z' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/start').send({ sequence_id: 'seq-1' })

      expect(res.status).toBe(201)
      expect(res.body.followup).toMatchObject({ id: 'enr-1', sequence_name: 'Sequência Pós-Venda', status: 'active', total_steps: 1, sent_count: 0 })
      const materializeInsert = insertCallsMatching(/INSERT INTO followup_enrollment_messages/)[0]
      expect(materializeInsert).toBeTruthy()
    })
  })

  describe('GET /operators', () => {
    it('lista os operadores ativos do tenant', async () => {
      rlsMock.queueRows([{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'agent' }])
      const app = buildApp()
      const res = await request(app).get('/api/chat/operators')
      expect(res.status).toBe(200)
      expect(res.body.operators).toHaveLength(1)
    })
  })

  describe('GET /:leadId/logs', () => {
    it('lista os logs do ticket', async () => {
      rlsMock.queueRows([{ id: 'log-1', action: 'opened' }])
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
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-x/group-access')
      expect(res.status).toBe(404)
    })

    it('GET retorna 400 quando a conversa não é um grupo', async () => {
      rlsMock.queueRows([{ id: 'lead-1', is_group: false }])
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-1/group-access')
      expect(res.status).toBe(400)
    })

    it('GET lista operadores do tenant e quem já tem acesso ao grupo', async () => {
      rlsMock.queueRows([{ id: 'lead-1', is_group: true }])
      rlsMock.queueRows([{ id: 'u1', name: 'Ana', email: 'ana@ex.com' }])
      rlsMock.queueRows([{ user_id: 'u1' }])
      const app = buildApp()
      const res = await request(app).get('/api/chat/lead-1/group-access')
      expect(res.status).toBe(200)
      expect(res.body.granted_user_ids).toEqual(['u1'])
    })

    it('PUT exige um array de user_ids', async () => {
      const app = buildApp()
      const res = await request(app).put('/api/chat/lead-1/group-access').send({})
      expect(res.status).toBe(400)
    })

    it('PUT substitui a lista de acesso do grupo', async () => {
      rlsMock.queueRows([{ id: 'lead-1', is_group: true }])
      const app = buildApp()
      const res = await request(app).put('/api/chat/lead-1/group-access').send({ user_ids: ['u1', 'u2'] })
      expect(res.status).toBe(200)
      expect(deleteCallsMatching(/whatsapp_group_access/)).toHaveLength(1)
      const insert = insertCallsMatching(/INSERT INTO whatsapp_group_access/)[0]
      expect(insert.params).toEqual(['tenant-1', 'lead-1', 'u1', 'tenant-1', 'lead-1', 'u2'])
    })
  })

  describe('POST /:leadId/media', () => {
    it('retorna 400 quando nenhum arquivo é enviado', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/media')
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando o lead não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/media').attach('file', Buffer.from('img'), { filename: 'foto.png', contentType: 'image/png' })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o ticket não está aberto', async () => {
      rlsMock.queueRows([{ id: 'lead-1', conversation_status: 'pending' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/media').attach('file', Buffer.from('img'), { filename: 'foto.png', contentType: 'image/png' })
      expect(res.status).toBe(403)
    })

    it('sobe a mídia, salva a mensagem e envia via WhatsApp', async () => {
      rlsMock.queueRows([{ id: 'lead-1', phone: '5511988887777', conversation_status: 'open', human_takeover: true }])
      rlsMock.queueRows([{ id: 20 }])
      const app = buildApp()
      const res = await request(app)
        .post('/api/chat/lead-1/media')
        .field('caption', 'Segue o catálogo')
        .attach('file', Buffer.from('img'), { filename: 'foto.png', contentType: 'image/png' })

      expect(res.status).toBe(201)
      expect(mockState.uploadChatMedia).toHaveBeenCalled()
      expect(mockState.sendMedia).toHaveBeenCalledWith('tenant-1', '5511988887777', expect.objectContaining({ filename: 'foto.png', caption: 'Segue o catálogo' }))
      const insert = insertCallsMatching(/INSERT INTO messages/)[0]
      expect(insert.params).toContain('image')
      expect(insert.params).toContain('image/png')
    })

    it('rejeita tipo de arquivo não permitido', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/media').attach('file', Buffer.from('x'), { filename: 'virus.exe', contentType: 'application/x-msdownload' })
      expect(res.status).toBe(400)
    })

    it('salva a duração do áudio quando enviada pelo frontend', async () => {
      rlsMock.queueRows([{ id: 'lead-1', phone: '5511988887777', conversation_status: 'open', human_takeover: true }])
      rlsMock.queueRows([{ id: 21 }])
      const app = buildApp()
      const res = await request(app)
        .post('/api/chat/lead-1/media')
        .field('duration', '10')
        .attach('file', Buffer.from('audiobytes'), { filename: 'audio.webm', contentType: 'audio/webm' })

      expect(res.status).toBe(201)
      const insert = insertCallsMatching(/INSERT INTO messages/)[0]
      expect(insert.params).toContain('audio')
      expect(insert.params).toContain(10)
    })

    it('ignora duração ausente, inválida ou fora do plausível', async () => {
      rlsMock.queueRows([{ id: 'lead-1', conversation_status: 'open' }])
      rlsMock.queueRows([{ id: 22 }])
      const app = buildApp()
      const res = await request(app)
        .post('/api/chat/lead-1/media')
        .field('duration', '-5')
        .attach('file', Buffer.from('audiobytes'), { filename: 'audio.webm', contentType: 'audio/webm' })

      expect(res.status).toBe(201)
      const insert = insertCallsMatching(/INSERT INTO messages/)[0]
      expect(insert.params).toContain('audio')
      expect(insert.params).not.toContain(-5)
    })

    it('ignora duração enviada para tipos de mídia que não são áudio', async () => {
      rlsMock.queueRows([{ id: 'lead-1', conversation_status: 'open' }])
      rlsMock.queueRows([{ id: 23 }])
      const app = buildApp()
      const res = await request(app)
        .post('/api/chat/lead-1/media')
        .field('duration', '10')
        .attach('file', Buffer.from('img'), { filename: 'foto.png', contentType: 'image/png' })

      expect(res.status).toBe(201)
      const insert = insertCallsMatching(/INSERT INTO messages/)[0]
      expect(insert.params).toContain('image')
      expect(insert.params).not.toContain(10)
    })
  })

  describe('POST /:leadId/location', () => {
    it('retorna 400 com coordenadas inválidas', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/location').send({ latitude: 'x', longitude: 'y' })
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando o lead não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/location').send({ latitude: 1, longitude: 2 })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o ticket não está aberto', async () => {
      rlsMock.queueRows([{ id: 'lead-1', conversation_status: 'pending' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/location').send({ latitude: 1, longitude: 2 })
      expect(res.status).toBe(403)
    })

    it('salva e envia a localização', async () => {
      rlsMock.queueRows([{ id: 'lead-1', phone: '5511988887777', conversation_status: 'open' }])
      rlsMock.queueRows([{ id: 30 }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/location').send({ latitude: -25.4, longitude: -49.2 })

      expect(res.status).toBe(201)
      expect(mockState.sendLocation).toHaveBeenCalledWith('tenant-1', '5511988887777', { latitude: -25.4, longitude: -49.2 })
      const insertCall = insertCallsMatching(/INSERT INTO messages/)[0]
      expect(insertCall.params).toContain('wa-3')
      expect(insertCall.params).toContain('sent')
    })
  })

  describe('POST /:leadId/messages/:messageId/forward', () => {
    it('exige toLeadId', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({})
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando a mensagem original não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-2' })
      expect(res.status).toBe(404)
    })

    it('retorna 404 quando o lead de destino não existe', async () => {
      rlsMock.queueRows([{ id: 1, text: 'Oi', deleted_at: null }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-x' })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o ticket de destino não está aberto', async () => {
      rlsMock.queueRows([{ id: 1, text: 'Oi', deleted_at: null }])
      rlsMock.queueRows([{ id: 'lead-2', conversation_status: 'pending' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-2' })
      expect(res.status).toBe(403)
    })

    it('encaminha texto simples via sendText', async () => {
      rlsMock.queueRows([{ id: 1, text: 'Olá, tudo bem?', deleted_at: null }])
      rlsMock.queueRows([{ id: 'lead-2', phone: '5511977776666', conversation_status: 'open', human_takeover: false }])
      rlsMock.queueRows([{ id: 40 }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-2' })

      expect(res.status).toBe(201)
      expect(mockState.sendText).toHaveBeenCalledWith('tenant-1', '5511977776666', 'Olá, tudo bem?')
      const insert = insertCallsMatching(/INSERT INTO messages/)[0]
      expect(insert.params).toContain(1) // forwarded_from_id
      expect(insert.params).toContain('lead-2')
    })

    it('encaminha localização via sendLocation', async () => {
      rlsMock.queueRows([{ id: 1, text: 'Localização compartilhada', location_lat: -25.4, location_lng: -49.2, deleted_at: null }])
      rlsMock.queueRows([{ id: 'lead-2', phone: '5511977776666', conversation_status: 'open' }])
      rlsMock.queueRows([{ id: 41 }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/messages/1/forward').send({ toLeadId: 'lead-2' })

      expect(res.status).toBe(201)
      expect(mockState.sendLocation).toHaveBeenCalledWith('tenant-1', '5511977776666', { latitude: -25.4, longitude: -49.2 })
    })

    it('encaminha mídia buscando o media_url via safeFetch e reenviando via sendMedia', async () => {
      rlsMock.queueRows([{ id: 1, text: '[imagem]', media_url: 'https://cdn.exemplo.com/foto.png', media_mimetype: 'image/png', media_filename: 'foto.png', deleted_at: null }])
      rlsMock.queueRows([{ id: 'lead-2', phone: '5511977776666', conversation_status: 'open' }])
      rlsMock.queueRows([{ id: 42 }])
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
      rlsMock.queueRows([{ id: 'u2', name: 'Bia', email: 'bia@ex.com' }])
      rlsMock.queueRows([{ id: 'lead-1', conversation_status: 'open', assigned_to: 'u2' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/transfer-to').send({ userId: 'u2' })

      expect(res.status).toBe(200)
      expect(res.body.to).toMatchObject({ id: 'u2', name: 'Bia' })
      const logEvent = insertCallsMatching(/INSERT INTO ticket_logs/)[0]
      expect(logEvent.params).toContain('transferred')
      expect(logEvent.params).toContain('u2')
    })

    it('POST /:leadId/transfer-to exige userId', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/transfer-to').send({})
      expect(res.status).toBe(400)
    })

    it('POST /:leadId/transfer-to retorna 404 quando o operador não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/transfer-to').send({ userId: 'u-x' })
      expect(res.status).toBe(404)
    })

    it('POST /:leadId/attend assume o atendimento e loga a abertura', async () => {
      rlsMock.queueRows([{ id: 'lead-1', conversation_status: 'open', assigned_to: 'user-1' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/attend')
      expect(res.status).toBe(200)
      const logEvent = insertCallsMatching(/INSERT INTO ticket_logs/)[0]
      expect(logEvent.params).toContain('opened')
    })

    it('POST /:leadId/reopen reabre o ticket e loga', async () => {
      rlsMock.queueRows([{ id: 'lead-1', conversation_status: 'open' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/reopen')
      expect(res.status).toBe(200)
      const logEvent = insertCallsMatching(/INSERT INTO ticket_logs/)[0]
      expect(logEvent.params).toContain('reopened')
    })

    it('POST /:leadId/return-to-queue devolve pra fila (limpa assigned_to e human_takeover)', async () => {
      rlsMock.queueRows([{ id: 'lead-1', conversation_status: 'pending' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/return-to-queue')
      expect(res.status).toBe(200)
      const leadUpdate = updateCallsMatching(/leads/)[0]
      expect(leadUpdate.sql).toContain("conversation_status = 'pending'")
      expect(leadUpdate.sql).toContain('assigned_to = NULL')
      const logEvent = insertCallsMatching(/INSERT INTO ticket_logs/)[0]
      expect(logEvent.params).toContain('pending')
    })

    it('POST /:leadId/resolve finaliza o atendimento e loga o fechamento', async () => {
      rlsMock.queueRows([{ id: 'lead-1', conversation_status: 'resolved' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/resolve')
      expect(res.status).toBe(200)
      const logEvent = insertCallsMatching(/INSERT INTO ticket_logs/)[0]
      expect(logEvent.params).toContain('closed')
    })
  })

  describe('mensagens agendadas', () => {
    it('GET /:leadId/schedule lista as pendentes', async () => {
      rlsMock.queueRows([{ id: 's1', text: 'Lembrete', status: 'pending' }])
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
      rlsMock.queueRows([])
      const app = buildApp()
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      const res = await request(app).post('/api/chat/lead-1/schedule').send({ text: 'Oi', send_at: futureDate })
      expect(res.status).toBe(404)
    })

    it('POST /:leadId/schedule agenda a mensagem', async () => {
      rlsMock.queueRows([{ id: 'lead-1' }])
      rlsMock.queueRows([{ id: 's1', text: 'Oi' }])
      const app = buildApp()
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      const res = await request(app).post('/api/chat/lead-1/schedule').send({ text: 'Oi', send_at: futureDate })
      expect(res.status).toBe(201)
    })

    it('DELETE /:leadId/schedule/:id retorna 404 quando não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1/schedule/s1')
      expect(res.status).toBe(404)
    })

    it('DELETE /:leadId/schedule/:id retorna 400 quando já foi processado', async () => {
      rlsMock.queueRows([{ status: 'sent' }])
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1/schedule/s1')
      expect(res.status).toBe(400)
    })

    it('DELETE /:leadId/schedule/:id cancela o agendamento pendente', async () => {
      rlsMock.queueRows([{ status: 'pending' }])
      const app = buildApp()
      const res = await request(app).delete('/api/chat/lead-1/schedule/s1')
      expect(res.status).toBe(200)
      const update = updateCallsMatching(/scheduled_messages/)[0]
      expect(update.sql).toContain("'cancelled'")
    })
  })

  describe('acompanhamentos — cancelar/finalizar/reiniciar', () => {
    it('POST /:leadId/followup/:enrollmentId/cancel retorna 404 quando não há acompanhamento ativo', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/enr-1/cancel')
      expect(res.status).toBe(404)
    })

    it('POST /:leadId/followup/:enrollmentId/cancel cancela e marca as mensagens pendentes como canceladas', async () => {
      rlsMock.queueRows([{ id: 'enr-1' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/enr-1/cancel')
      expect(res.status).toBe(200)
      expect(res.body.cancelled).toBe(true)
      const enrollmentUpdate = updateCallsMatching(/followup_enrollments\b/).find((c) => c.params.includes('cancelled'))
      expect(enrollmentUpdate).toBeTruthy()
      const msgsUpdate = updateCallsMatching(/followup_enrollment_messages/).find((c) => c.sql.includes("'cancelled'"))
      expect(msgsUpdate).toBeTruthy()
    })

    it('POST /:leadId/followup/:enrollmentId/finish finaliza o acompanhamento', async () => {
      rlsMock.queueRows([{ id: 'enr-1' }])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/enr-1/finish')
      expect(res.status).toBe(200)
      expect(res.body.finished).toBe(true)
      const enrollmentUpdate = updateCallsMatching(/followup_enrollments\b/).find((c) => c.params.includes('completed'))
      expect(enrollmentUpdate).toBeTruthy()
    })

    it('POST /:leadId/followup/:enrollmentId/restart retorna 404 quando o acompanhamento não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/enr-1/restart')
      expect(res.status).toBe(404)
    })

    it('POST /:leadId/followup/:enrollmentId/restart para o atual e cria um novo enrollment', async () => {
      rlsMock.queueRows([{ sequence_id: 'seq-1' }]) // busca sequence_id do enrollment atual
      rlsMock.queueRows([{ id: 'seq-1', name: 'Seq X', time_mode: 'default', default_send_time: '09:00' }]) // sequência
      rlsMock.queueRows([{ id: 'enr-1' }]) // stopEnrollment: confirma que está ativo
      rlsMock.queueRows([{ id: 'enr-2', sequence_id: 'seq-1' }]) // insert do novo enrollment
      rlsMock.queueRows([]) // followup_steps vazio
      rlsMock.queueRows([{ id: 'enr-2', sequence_id: 'seq-1', status: 'active', started_at: '2026-01-01T00:00:00.000Z' }]) // loadActiveFollowup final
      rlsMock.queueRows([{ name: 'Seq X' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/chat/lead-1/followup/enr-1/restart')
      expect(res.status).toBe(201)
      const cancelledUpdate = updateCallsMatching(/followup_enrollments\b/).find((c) => c.params.includes('cancelled'))
      expect(cancelledUpdate).toBeTruthy()
      const newInsert = insertCallsMatching(/INSERT INTO followup_enrollments/)[0]
      expect(newInsert.params).toContain('seq-1')
    })
  })
})
