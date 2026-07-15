import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, createEvent: null, cancelEvent: null, listEvents: null, updateEvent: null, logUsage: null, permCalls: [] }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
  requirePermission: (...keys) => { mockState.permCalls.push(keys); return (req, res, next) => next() },
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

vi.mock('../../services/googleCalendar.js', () => ({
  createEvent: (...args) => mockState.createEvent(...args),
  cancelEvent: (...args) => mockState.cancelEvent(...args),
  listEvents: (...args) => mockState.listEvents(...args),
  updateEvent: (...args) => mockState.updateEvent(...args),
}))

vi.mock('../../services/usage.js', () => ({
  logUsage: (...args) => mockState.logUsage(...args),
}))

const { appointmentsRouter } = await import('../appointments.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/appointments', appointmentsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^INSERT/.test(c.sql)) }
function updateCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^UPDATE/.test(c.sql)) }

describe('routes/appointments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.createEvent = vi.fn()
    mockState.cancelEvent = vi.fn().mockResolvedValue({ cancelled: true })
    mockState.listEvents = vi.fn()
    mockState.updateEvent = vi.fn()
    mockState.logUsage = vi.fn().mockResolvedValue(undefined)
    setRls()
  })

  it('exige a permissão "agenda" (enforcement de operador restrito) em toda a rota', () => {
    expect(mockState.permCalls).toContainEqual(['agenda'])
  })

  it('GET / lista as reuniões do tenant paginando com limit/offset padrão (500/0)', async () => {
    rlsMock.queueRows([{ id: 'a1', title: 'Demo' }])
    const app = buildApp()
    const res = await request(app).get('/api/appointments')
    expect(res.body.appointments).toHaveLength(1)
    expect(res.body).toMatchObject({ limit: 500, offset: 0 })
    const call = rlsMock.calls.find((c) => /FROM appointments/.test(c.sql))
    expect(call.params.slice(-2)).toEqual([500, 0])
  })

  it('GET / aceita limit/offset customizados via query, respeitando o teto de 1000', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).get('/api/appointments?limit=99999&offset=20')
    expect(res.body).toMatchObject({ limit: 1000, offset: 20 })
    const call = rlsMock.calls.find((c) => /FROM appointments/.test(c.sql))
    expect(call.params.slice(-2)).toEqual([1000, 20])
  })

  describe('POST /sync', () => {
    it('insere eventos novos e atualiza os já existentes', async () => {
      mockState.listEvents.mockResolvedValue([
        { externalId: 'ext-1', title: 'Novo evento', start: '2026-01-01T10:00:00Z', end: '2026-01-01T10:30:00Z', meetingLink: 'https://meet/1', status: 'confirmed' },
        { externalId: 'ext-2', title: 'Evento existente atualizado', start: '2026-01-02T10:00:00Z', end: '2026-01-02T10:30:00Z', meetingLink: null, status: 'confirmed' },
      ])
      rlsMock.queueRows([{ id: 'a-existing', external_id: 'ext-2', status: 'scheduled' }])
      const app = buildApp()
      const res = await request(app).post('/api/appointments/sync')
      expect(res.body).toEqual({ synced: 2 })
      expect(insertCallsMatching(/appointments/)).toHaveLength(1)
      expect(updateCallsMatching(/appointments/)).toHaveLength(1)
    })

    it('marca como cancelado quando o evento do Google foi cancelado', async () => {
      mockState.listEvents.mockResolvedValue([{ externalId: 'ext-1', title: 'x', start: 'a', end: 'b', status: 'cancelled' }])
      rlsMock.queueRows([])
      const app = buildApp()
      await request(app).post('/api/appointments/sync')
      const insert = insertCallsMatching(/appointments/)[0]
      expect(insert.params).toContain('cancelled')
    })

    it('retorna aviso amigável quando o Google Calendar não está conectado', async () => {
      mockState.listEvents.mockRejectedValue(new Error('Google Calendar não conectado para este cliente.'))
      const app = buildApp()
      const res = await request(app).post('/api/appointments/sync')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ synced: 0, warning: 'Google Calendar não conectado. Reconecte em Integrações.' })
    })

    it('retorna aviso amigável quando o token expirou', async () => {
      mockState.listEvents.mockRejectedValue(new Error('invalid_grant: Token has been expired'))
      const app = buildApp()
      const res = await request(app).post('/api/appointments/sync')
      expect(res.body.warning).toMatch(/expirado/)
    })

    it('retorna 500 quando a ENCRYPTION_KEY não está configurada', async () => {
      mockState.listEvents.mockRejectedValue(new Error('ENCRYPTION_KEY ausente'))
      const app = buildApp()
      const res = await request(app).post('/api/appointments/sync')
      expect(res.status).toBe(500)
    })

    it('retorna 500 genérico para outros erros', async () => {
      mockState.listEvents.mockRejectedValue(new Error('erro desconhecido'))
      const app = buildApp()
      const res = await request(app).post('/api/appointments/sync')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /', () => {
    it('rejeita payload inválido', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/appointments').send({ title: '' })
      expect(res.status).toBe(400)
    })

    it('cria o evento no Google e persiste o agendamento', async () => {
      mockState.createEvent.mockResolvedValue({ externalId: 'ext-1', meetingLink: 'https://meet/1' })
      rlsMock.queueRows([{ id: 'a1', title: 'Demo' }])
      const app = buildApp()
      const res = await request(app).post('/api/appointments').send({
        title: 'Demo', start: '2026-01-01T10:00:00Z', end: '2026-01-01T10:30:00Z',
      })
      expect(res.status).toBe(201)
      expect(res.body.meetingLink).toBe('https://meet/1')
      expect(mockState.logUsage).toHaveBeenCalledWith('tenant-1', 'user-1', 'appointment_created')
    })

    it('retorna 502 quando falha ao criar o evento no Google', async () => {
      mockState.createEvent.mockRejectedValue(new Error('Google Calendar não conectado para este cliente.'))
      const app = buildApp()
      const res = await request(app).post('/api/appointments').send({
        title: 'Demo', start: '2026-01-01T10:00:00Z', end: '2026-01-01T10:30:00Z',
      })
      expect(res.status).toBe(502)
    })
  })

  describe('PATCH /:id (reagendar)', () => {
    it('rejeita quando nenhum campo é enviado', async () => {
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a1').send({})
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando não encontrado', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a-x').send({ title: 'Novo título' })
      expect(res.status).toBe(404)
    })

    it('rejeita reagendar reunião cancelada', async () => {
      rlsMock.queueRows([{ external_id: 'ext-1', status: 'cancelled' }])
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a1').send({ title: 'Novo título' })
      expect(res.status).toBe(400)
    })

    it('atualiza sem chamar o Google quando não há external_id', async () => {
      rlsMock.queueRows([{ external_id: null, status: 'scheduled' }])
      rlsMock.queueRows([{ id: 'a1', title: 'Novo título' }])
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a1').send({ title: 'Novo título' })
      expect(res.status).toBe(200)
      expect(mockState.updateEvent).not.toHaveBeenCalled()
    })

    it('atualiza o evento no Google e usa o novo meeting_link quando há external_id', async () => {
      mockState.updateEvent.mockResolvedValue({ meetingLink: 'https://meet/novo' })
      rlsMock.queueRows([{ external_id: 'ext-1', status: 'scheduled' }])
      rlsMock.queueRows([{ id: 'a1' }])
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a1').send({ start: '2026-01-02T10:00:00Z' })
      expect(res.status).toBe(200)
      const update = updateCallsMatching(/appointments/)[0]
      expect(update.params).toContain('https://meet/novo')
    })

    it('retorna 502 quando falha ao reagendar no Google', async () => {
      mockState.updateEvent.mockRejectedValue(new Error('falha de rede'))
      rlsMock.queueRows([{ external_id: 'ext-1', status: 'scheduled' }])
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a1').send({ title: 'x' })
      expect(res.status).toBe(502)
    })
  })

  describe('POST /:id/cancel', () => {
    it('retorna 404 quando não encontrado', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/appointments/a-x/cancel')
      expect(res.status).toBe(404)
    })

    it('cancela no Google e marca como cancelado localmente', async () => {
      rlsMock.queueRows([{ external_id: 'ext-1' }])
      const app = buildApp()
      const res = await request(app).post('/api/appointments/a1/cancel')
      expect(res.status).toBe(200)
      expect(mockState.cancelEvent).toHaveBeenCalledWith('tenant-1', 'ext-1')
      const update = updateCallsMatching(/appointments/)[0]
      expect(update.sql).toContain('cancelled')
    })

    it('cancela localmente mesmo se a chamada ao Google falhar', async () => {
      mockState.cancelEvent.mockRejectedValue(new Error('erro Google'))
      rlsMock.queueRows([{ external_id: 'ext-1' }])
      const app = buildApp()
      const res = await request(app).post('/api/appointments/a1/cancel')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ cancelled: true })
    })
  })
})
