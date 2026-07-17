import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null, logAudit: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

vi.mock('../../services/usage.js', () => ({
  logAudit: (...args) => mockState.logAudit(...args),
}))

const { privacyRouter } = await import('../privacy.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/privacy', privacyRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}

describe('routes/privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    mockState.logAudit = vi.fn().mockResolvedValue(undefined)
    setRls()
  })

  describe('GET /export/:leadId', () => {
    it('retorna 403 para quem não é admin/owner', async () => {
      mockState.user = { id: 'user-2', tenantId: 'tenant-1', role: 'agent' }
      const app = buildApp()
      const res = await request(app).get('/api/privacy/export/l1')
      expect(res.status).toBe(403)
    })

    it('retorna 404 quando o lead não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/privacy/export/l-x')
      expect(res.status).toBe(404)
    })

    it('monta um JSON com o lead e todas as tabelas relacionadas, como download', async () => {
      rlsMock.queueRows([{ id: 'l1', name: 'Ana', phone: '11988887777' }]) // lead
      rlsMock.queueRows([{ id: 1, text: 'oi' }]) // messages
      rlsMock.queueRows([{ id: 'a1', title: 'Reunião' }]) // appointments
      rlsMock.queueRows([{ id: 't1', action: 'opened' }]) // ticket_logs
      rlsMock.queueRows([{ id: 'h1', to_stage: 'Qualificado' }]) // lead_stage_history
      rlsMock.queueRows([{ id: 'f1', status: 'active' }]) // followup_enrollments
      rlsMock.queueRows([{ id: 's1', current_node_id: 'n1' }]) // flow_sessions

      const app = buildApp()
      const res = await request(app).get('/api/privacy/export/l1')
      expect(res.status).toBe(200)
      expect(res.headers['content-disposition']).toContain('attachment')
      const body = JSON.parse(res.text)
      expect(body.lead.name).toBe('Ana')
      expect(body.messages).toHaveLength(1)
      expect(body.appointments).toHaveLength(1)
      expect(body.ticketLogs).toHaveLength(1)
      expect(body.stageHistory).toHaveLength(1)
      expect(body.followupEnrollments).toHaveLength(1)
      expect(body.flowSessions).toHaveLength(1)
    })
  })

  describe('POST /erase/:leadId', () => {
    it('retorna 403 para quem não é admin/owner', async () => {
      mockState.user = { id: 'user-2', tenantId: 'tenant-1', role: 'agent' }
      const app = buildApp()
      const res = await request(app).post('/api/privacy/erase/l1')
      expect(res.status).toBe(403)
    })

    it('retorna 404 quando o lead não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/privacy/erase/l-x')
      expect(res.status).toBe(404)
    })

    it('anonimiza o lead e as mensagens, e registra auditoria', async () => {
      rlsMock.queueRows([{ id: 'l1' }]) // existsR
      rlsMock.queueRows([{ id: 'l1', erased_at: '2026-07-17T10:00:00Z' }]) // UPDATE leads RETURNING
      const app = buildApp()
      const res = await request(app).post('/api/privacy/erase/l1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ erased: true, erasedAt: '2026-07-17T10:00:00Z' })

      const leadUpdate = rlsMock.calls.find((c) => /^UPDATE leads SET/.test(c.sql))
      expect(leadUpdate.params).toEqual(['[dado removido - LGPD]', '[dado removido - LGPD]', 'l1', 'tenant-1'])
      const messagesUpdate = rlsMock.calls.find((c) => /^UPDATE messages SET/.test(c.sql))
      expect(messagesUpdate.params).toEqual(['[dado removido - LGPD]', 'l1', 'tenant-1'])

      expect(mockState.logAudit).toHaveBeenCalledWith('tenant-1', 'user-1', 'lead', 'erase', 'l1')
    })
  })
})
