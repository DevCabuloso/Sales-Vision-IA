import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {} }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

const { supportRouter } = await import('../support.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/support', supportRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^INSERT/.test(c.sql)) }

describe('routes/support', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setRls()
  })

  describe('GET /tickets', () => {
    it('lista os chamados do usuário logado', async () => {
      rlsMock.queueRows([{ id: 't1', category: 'tecnico', status: 'open' }])
      const app = buildApp()
      const res = await request(app).get('/api/support/tickets')
      expect(res.status).toBe(200)
      expect(res.body.tickets).toHaveLength(1)
      const call = rlsMock.calls.find((c) => /FROM support_tickets/.test(c.sql))
      expect(call.params).toEqual(['tenant-1', 'user-1'])
    })
  })

  describe('POST /tickets', () => {
    it('rejeita categoria inválida', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/support/tickets').send({ category: 'inexistente' })
      expect(res.status).toBe(400)
    })

    it('cria o chamado', async () => {
      rlsMock.queueRows([{ id: 't1', category: 'whatsapp', status: 'open' }])
      const app = buildApp()
      const res = await request(app).post('/api/support/tickets').send({ category: 'whatsapp', description: 'Não conecta o QR code' })
      expect(res.status).toBe(201)
      const insert = insertCallsMatching(/INSERT INTO support_tickets/)[0]
      expect(insert.params).toEqual(['tenant-1', 'user-1', 'whatsapp', 'Não conecta o QR code'])
    })
  })

  describe('GET /tickets/:id/messages', () => {
    it('retorna 404 quando o chamado não existe ou não é do usuário', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/support/tickets/t-x/messages')
      expect(res.status).toBe(404)
    })

    it('lista as mensagens do chamado', async () => {
      rlsMock.queueRows([{ id: 't1' }])
      rlsMock.queueRows([{ id: 'm1', sender_type: 'owner', text: 'Como posso ajudar?' }])
      const app = buildApp()
      const res = await request(app).get('/api/support/tickets/t1/messages')
      expect(res.status).toBe(200)
      expect(res.body.messages).toHaveLength(1)
    })
  })

  describe('POST /tickets/:id/messages', () => {
    it('rejeita texto vazio', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/support/tickets/t1/messages').send({ text: '' })
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando o chamado não existe ou não é do usuário', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/support/tickets/t-x/messages').send({ text: 'Oi' })
      expect(res.status).toBe(404)
    })

    it('retorna 400 quando o chamado já está encerrado', async () => {
      rlsMock.queueRows([{ id: 't1', status: 'closed' }])
      const app = buildApp()
      const res = await request(app).post('/api/support/tickets/t1/messages').send({ text: 'Oi' })
      expect(res.status).toBe(400)
    })

    it('envia a mensagem e atualiza o chamado', async () => {
      rlsMock.queueRows([{ id: 't1', status: 'open' }])
      rlsMock.queueRows([{ id: 'm1', sender_type: 'user', text: 'Preciso de ajuda' }])
      const app = buildApp()
      const res = await request(app).post('/api/support/tickets/t1/messages').send({ text: 'Preciso de ajuda' })
      expect(res.status).toBe(201)
      const insert = insertCallsMatching(/INSERT INTO support_messages/)[0]
      expect(insert.params).toEqual(['t1', 'tenant-1', 'user-1', 'Preciso de ajuda'])
    })
  })
})
