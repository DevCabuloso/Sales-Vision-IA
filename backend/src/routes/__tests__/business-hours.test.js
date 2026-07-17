import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

vi.mock('../../services/usage.js', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

const { businessHoursRouter, isWithinBusinessHours, getTenantTimezone, getOffMessage } = await import('../business-hours.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/business-hours', businessHoursRouter)
  return app
}

function setRls() {
  const mock = createRlsMock()
  mockState.box.withTenant = mock.withTenant
  return mock
}

describe('routes/business-hours', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET / e PUT /', () => {
    it('GET / retorna a configuração padrão quando o tenant não tem uma salva', async () => {
      setRls().queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/business-hours')
      expect(res.body.config.enabled).toBe(false)
      expect(res.body.config.timezone).toBe('America/Sao_Paulo')
    })

    it('GET / retorna a configuração salva quando existe', async () => {
      setRls().queueRows([{ enabled: true, timezone: 'America/Sao_Paulo' }])
      const app = buildApp()
      const res = await request(app).get('/api/business-hours')
      expect(res.body.config.enabled).toBe(true)
    })

    it('PUT / salva a configuração com defaults para campos omitidos', async () => {
      setRls().queueRows([{ enabled: true, timezone: 'America/Sao_Paulo' }])
      const app = buildApp()
      const res = await request(app).put('/api/business-hours').send({ enabled: true })
      expect(res.status).toBe(200)
      expect(res.body.config.enabled).toBe(true)
    })

    it('PUT / rejeita enabled que não seja booleano', async () => {
      const app = buildApp()
      const res = await request(app).put('/api/business-hours').send({ enabled: 'sim' })
      expect(res.status).toBe(400)
    })

    it('PUT / rejeita horário de schedule fora do formato HH:mm', async () => {
      const app = buildApp()
      const res = await request(app).put('/api/business-hours')
        .send({ schedule: { 1: { open: true, start: '8h', end: '18:00' } } })
      expect(res.status).toBe(400)
    })

    it('PUT / aceita um schedule válido', async () => {
      setRls().queueRows([{ enabled: true }])
      const app = buildApp()
      const res = await request(app).put('/api/business-hours')
        .send({ schedule: { 1: { open: true, start: '08:00', end: '18:00' } } })
      expect(res.status).toBe(200)
    })
  })

  describe('isWithinBusinessHours', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('retorna true quando o horário comercial está desabilitado', async () => {
      setRls().queueRows([{ enabled: false }])
      expect(await isWithinBusinessHours('tenant-1')).toBe(true)
    })

    it('retorna true quando não há configuração salva', async () => {
      setRls().queueRows([])
      expect(await isWithinBusinessHours('tenant-1')).toBe(true)
    })

    it('retorna true dentro do horário configurado', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-07T10:00:00.000Z')) // quarta-feira, 10h UTC
      setRls().queueRows([{
        enabled: true, timezone: 'UTC',
        schedule: { 3: { open: true, start: '08:00', end: '18:00' } },
      }])
      expect(await isWithinBusinessHours('tenant-1')).toBe(true)
    })

    it('retorna false fora do horário configurado', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-07T22:00:00.000Z')) // quarta-feira, 22h UTC
      setRls().queueRows([{
        enabled: true, timezone: 'UTC',
        schedule: { 3: { open: true, start: '08:00', end: '18:00' } },
      }])
      expect(await isWithinBusinessHours('tenant-1')).toBe(false)
    })

    it('retorna false quando o dia está marcado como fechado', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-04T10:00:00.000Z')) // domingo, 10h UTC
      setRls().queueRows([{
        enabled: true, timezone: 'UTC',
        schedule: { 0: { open: false, start: '08:00', end: '12:00' } },
      }])
      expect(await isWithinBusinessHours('tenant-1')).toBe(false)
    })

    it('retorna true (fail-open) quando a consulta falha', async () => {
      setRls().queueError(new Error('erro'))
      expect(await isWithinBusinessHours('tenant-1')).toBe(true)
    })
  })

  describe('getTenantTimezone', () => {
    it('retorna o fuso salvo', async () => {
      setRls().queueRows([{ timezone: 'America/Bahia' }])
      expect(await getTenantTimezone('tenant-1')).toBe('America/Bahia')
    })

    it('retorna o fuso padrão quando não há configuração', async () => {
      setRls().queueRows([])
      expect(await getTenantTimezone('tenant-1')).toBe('America/Sao_Paulo')
    })

    it('retorna o fuso padrão em caso de erro', async () => {
      setRls().queueError(new Error('erro'))
      expect(await getTenantTimezone('tenant-1')).toBe('America/Sao_Paulo')
    })
  })

  describe('getOffMessage', () => {
    it('retorna a mensagem salva', async () => {
      setRls().queueRows([{ off_message: 'Voltamos amanhã!' }])
      expect(await getOffMessage('tenant-1')).toBe('Voltamos amanhã!')
    })

    it('retorna a mensagem padrão quando não há configuração', async () => {
      setRls().queueRows([])
      expect(await getOffMessage('tenant-1')).toBe('Estamos fora do horário de atendimento. Retornaremos em breve!')
    })

    it('retorna a mensagem padrão em caso de erro', async () => {
      setRls().queueError(new Error('erro'))
      expect(await getOffMessage('tenant-1')).toBe('Estamos fora do horário de atendimento.')
    })
  })
})
