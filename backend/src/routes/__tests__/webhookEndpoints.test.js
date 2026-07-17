import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null, logAudit: null, assertPublicUrl: null }))

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

vi.mock('../../utils/ssrfGuard.js', () => ({
  assertPublicUrl: (...args) => mockState.assertPublicUrl(...args),
}))

const { webhookEndpointsRouter } = await import('../webhookEndpoints.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/webhook-endpoints', webhookEndpointsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}

describe('routes/webhookEndpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    mockState.logAudit = vi.fn().mockResolvedValue(undefined)
    mockState.assertPublicUrl = vi.fn().mockResolvedValue(undefined)
    setRls()
  })

  it('retorna 403 para quem não é admin/owner', async () => {
    mockState.user = { id: 'user-2', tenantId: 'tenant-1', role: 'agent' }
    const app = buildApp()
    const res = await request(app).get('/api/webhook-endpoints')
    expect(res.status).toBe(403)
  })

  describe('GET /', () => {
    it('lista os endpoints do tenant', async () => {
      rlsMock.queueRows([{ id: 'e1', url: 'https://ex.com/hook', events: ['lead.created'], active: true }])
      const app = buildApp()
      const res = await request(app).get('/api/webhook-endpoints')
      expect(res.body.endpoints).toHaveLength(1)
    })
  })

  describe('POST /', () => {
    it('rejeita URL inválida', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/webhook-endpoints').send({ url: 'não-é-url', events: ['lead.created'] })
      expect(res.status).toBe(400)
    })

    it('rejeita evento fora da allowlist', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/webhook-endpoints').send({ url: 'https://ex.com/hook', events: ['evento.inventado'] })
      expect(res.status).toBe(400)
    })

    it('rejeita URL apontando pra rede privada (SSRF)', async () => {
      mockState.assertPublicUrl = vi.fn().mockRejectedValue(new Error('URL aponta para rede privada ou loopback — não permitido.'))
      const app = buildApp()
      const res = await request(app).post('/api/webhook-endpoints').send({ url: 'http://192.168.1.1/hook', events: ['lead.created'] })
      expect(res.status).toBe(500)
      expect(res.body.error).toMatch(/rede privada/)
    })

    it('cria o endpoint, retorna o segredo só nesta chamada e registra auditoria', async () => {
      rlsMock.queueRows([{ id: 'e1', url: 'https://ex.com/hook', events: ['lead.created'], active: true, created_at: '2026-07-17T10:00:00Z' }])
      const app = buildApp()
      const res = await request(app).post('/api/webhook-endpoints').send({ url: 'https://ex.com/hook', events: ['lead.created'] })
      expect(res.status).toBe(201)
      expect(res.body.endpoint.secret).toEqual(expect.any(String))
      expect(mockState.logAudit).toHaveBeenCalledWith('tenant-1', 'user-1', 'webhook_endpoint', 'create', 'e1', { url: 'https://ex.com/hook', events: ['lead.created'] })
    })
  })

  describe('PATCH /:id', () => {
    it('retorna 404 quando o endpoint não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/webhook-endpoints/e-x').send({ active: false })
      expect(res.status).toBe(404)
    })

    it('atualiza e registra auditoria', async () => {
      rlsMock.queueRows([{ id: 'e1', url: 'https://ex.com/hook', events: ['lead.created'], active: false }])
      const app = buildApp()
      const res = await request(app).patch('/api/webhook-endpoints/e1').send({ active: false })
      expect(res.status).toBe(200)
      expect(mockState.logAudit).toHaveBeenCalledWith('tenant-1', 'user-1', 'webhook_endpoint', 'update', 'e1', { active: false })
    })
  })

  describe('POST /:id/regenerate-secret', () => {
    it('retorna 404 quando o endpoint não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/webhook-endpoints/e-x/regenerate-secret')
      expect(res.status).toBe(404)
    })

    it('gera um novo segredo', async () => {
      rlsMock.queueRows([{ id: 'e1', url: 'https://ex.com/hook', events: ['lead.created'], active: true }])
      const app = buildApp()
      const res = await request(app).post('/api/webhook-endpoints/e1/regenerate-secret')
      expect(res.status).toBe(200)
      expect(res.body.endpoint.secret).toEqual(expect.any(String))
    })
  })

  describe('DELETE /:id', () => {
    it('exclui e registra auditoria', async () => {
      const app = buildApp()
      const res = await request(app).delete('/api/webhook-endpoints/e1')
      expect(res.status).toBe(200)
      expect(mockState.logAudit).toHaveBeenCalledWith('tenant-1', 'user-1', 'webhook_endpoint', 'delete', 'e1')
    })
  })
})
