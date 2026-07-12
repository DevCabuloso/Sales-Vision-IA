import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, createEvent: null, cancelEvent: null, listEvents: null, updateEvent: null, logUsage: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
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

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }
function updateCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update') }

describe('routes/appointments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.createEvent = vi.fn()
    mockState.cancelEvent = vi.fn().mockResolvedValue({ cancelled: true })
    mockState.listEvents = vi.fn()
    mockState.updateEvent = vi.fn()
    mockState.logUsage = vi.fn().mockResolvedValue(undefined)
  })

  it('GET / lista as reuniões do tenant', async () => {
    setSupabase({ appointments: [{ data: [{ id: 'a1', title: 'Demo' }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/appointments')
    expect(res.body.appointments).toHaveLength(1)
  })

  describe('POST /sync', () => {
    it('insere eventos novos e atualiza os já existentes', async () => {
      mockState.listEvents.mockResolvedValue([
        { externalId: 'ext-1', title: 'Novo evento', start: '2026-01-01T10:00:00Z', end: '2026-01-01T10:30:00Z', meetingLink: 'https://meet/1', status: 'confirmed' },
        { externalId: 'ext-2', title: 'Evento existente atualizado', start: '2026-01-02T10:00:00Z', end: '2026-01-02T10:30:00Z', meetingLink: null, status: 'confirmed' },
      ])
      setSupabase({
        appointments: [
          { data: [{ id: 'a-existing', external_id: 'ext-2', status: 'scheduled' }], error: null },
          { data: {}, error: null }, // update do existente
          { data: {}, error: null }, // insert do novo
        ],
      })
      const app = buildApp()
      const res = await request(app).post('/api/appointments/sync')
      expect(res.body).toEqual({ synced: 2 })
      expect(insertCallsFor('appointments')).toHaveLength(1)
      expect(updateCallsFor('appointments')).toHaveLength(1)
    })

    it('marca como cancelado quando o evento do Google foi cancelado', async () => {
      mockState.listEvents.mockResolvedValue([{ externalId: 'ext-1', title: 'x', start: 'a', end: 'b', status: 'cancelled' }])
      setSupabase({ appointments: [{ data: [], error: null }, { data: {}, error: null }] })
      const app = buildApp()
      await request(app).post('/api/appointments/sync')
      expect(insertCallsFor('appointments')[0].args[0].status).toBe('cancelled')
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
      setSupabase({ appointments: [{ data: { id: 'a1', title: 'Demo' }, error: null }] })
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
      setSupabase({ appointments: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a-x').send({ title: 'Novo título' })
      expect(res.status).toBe(404)
    })

    it('rejeita reagendar reunião cancelada', async () => {
      setSupabase({ appointments: [{ data: [{ external_id: 'ext-1', status: 'cancelled' }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a1').send({ title: 'Novo título' })
      expect(res.status).toBe(400)
    })

    it('atualiza sem chamar o Google quando não há external_id', async () => {
      setSupabase({
        appointments: [{ data: [{ external_id: null, status: 'scheduled' }], error: null }, { data: { id: 'a1', title: 'Novo título' }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a1').send({ title: 'Novo título' })
      expect(res.status).toBe(200)
      expect(mockState.updateEvent).not.toHaveBeenCalled()
    })

    it('atualiza o evento no Google e usa o novo meeting_link quando há external_id', async () => {
      mockState.updateEvent.mockResolvedValue({ meetingLink: 'https://meet/novo' })
      setSupabase({
        appointments: [{ data: [{ external_id: 'ext-1', status: 'scheduled' }], error: null }, { data: { id: 'a1' }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a1').send({ start: '2026-01-02T10:00:00Z' })
      expect(res.status).toBe(200)
      const update = updateCallsFor('appointments')[0]
      expect(update.args[0].meeting_link).toBe('https://meet/novo')
    })

    it('retorna 502 quando falha ao reagendar no Google', async () => {
      mockState.updateEvent.mockRejectedValue(new Error('falha de rede'))
      setSupabase({ appointments: [{ data: [{ external_id: 'ext-1', status: 'scheduled' }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/appointments/a1').send({ title: 'x' })
      expect(res.status).toBe(502)
    })
  })

  describe('POST /:id/cancel', () => {
    it('retorna 404 quando não encontrado', async () => {
      setSupabase({ appointments: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/appointments/a-x/cancel')
      expect(res.status).toBe(404)
    })

    it('cancela no Google e marca como cancelado localmente', async () => {
      setSupabase({ appointments: [{ data: [{ external_id: 'ext-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/appointments/a1/cancel')
      expect(res.status).toBe(200)
      expect(mockState.cancelEvent).toHaveBeenCalledWith('tenant-1', 'ext-1')
      const update = updateCallsFor('appointments')[0]
      expect(update.args[0].status).toBe('cancelled')
    })

    it('cancela localmente mesmo se a chamada ao Google falhar', async () => {
      mockState.cancelEvent.mockRejectedValue(new Error('erro Google'))
      setSupabase({ appointments: [{ data: [{ external_id: 'ext-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/appointments/a1/cancel')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ cancelled: true })
    })
  })
})
