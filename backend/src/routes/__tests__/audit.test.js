import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

const { auditRouter } = await import('../audit.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/audit-log', auditRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}

describe('routes/audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }
    setRls()
  })

  it('retorna 403 para quem não é admin/owner', async () => {
    mockState.user = { id: 'user-2', tenantId: 'tenant-1', role: 'agent' }
    const app = buildApp()
    const res = await request(app).get('/api/audit-log')
    expect(res.status).toBe(403)
  })

  it('lista entradas de auditoria já com entity/action extraídos do event_type', async () => {
    rlsMock.queueRows([
      {
        id: '1', event_type: 'audit.lead.update', meta: { entityId: 'l1', changes: { stage: 'Qualificado' } },
        created_at: '2026-07-17T10:00:00Z', user_id: 'user-1', actor_name: 'Ana', actor_email: 'ana@ex.com',
      },
    ])
    const app = buildApp()
    const res = await request(app).get('/api/audit-log')
    expect(res.status).toBe(200)
    expect(res.body.entries[0]).toMatchObject({
      entity: 'lead', action: 'update', entityId: 'l1',
      changes: { stage: 'Qualificado' }, actorName: 'Ana',
    })
  })

  it('filtra por entity montando o LIKE correto', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    await request(app).get('/api/audit-log').query({ entity: 'template' })
    const call = rlsMock.calls.find((c) => /FROM usage_events/.test(c.sql))
    expect(call.params).toContain('audit.template.%')
  })

  it('limita o "limit" em no máximo 200', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).get('/api/audit-log').query({ limit: 5000 })
    expect(res.body.limit).toBe(200)
  })

  it('usa "Desconhecido" quando não há ator (evento de sistema)', async () => {
    rlsMock.queueRows([
      { id: '1', event_type: 'audit.lead.delete', meta: {}, created_at: '2026-07-17T10:00:00Z', user_id: null, actor_name: null, actor_email: null },
    ])
    const app = buildApp()
    const res = await request(app).get('/api/audit-log')
    expect(res.body.entries[0].actorName).toBe('Desconhecido')
  })
})
