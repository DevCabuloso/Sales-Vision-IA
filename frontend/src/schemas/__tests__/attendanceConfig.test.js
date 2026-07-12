import { describe, it, expect } from 'vitest'
import { labelSchema, queueSchema, businessHoursSchema } from '../attendanceConfig'

describe('labelSchema', () => {
  it('aceita nome e cor válidos', () => {
    expect(labelSchema.safeParse({ name: 'VIP', color: '#6366F1' }).success).toBe(true)
  })

  it('rejeita nome vazio e cor em formato inválido', () => {
    expect(labelSchema.safeParse({ name: '', color: '#6366F1' }).success).toBe(false)
    expect(labelSchema.safeParse({ name: 'VIP', color: 'azul' }).success).toBe(false)
  })
})

describe('queueSchema', () => {
  const valid = { name: 'Suporte', description: 'Fila de suporte', color: '#6366F1', operator_ids: ['u1'] }

  it('aceita dados válidos', () => {
    expect(queueSchema.safeParse(valid).success).toBe(true)
  })

  it('rejeita nome vazio', () => {
    expect(queueSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })
})

describe('businessHoursSchema', () => {
  const valid = {
    enabled: true,
    timezone: 'America/Sao_Paulo',
    schedule: { 1: { open: true, start: '08:00', end: '18:00' } },
    off_message: 'Fora do horário',
  }

  it('aceita configuração válida', () => {
    expect(businessHoursSchema.safeParse(valid).success).toBe(true)
  })

  it('rejeita horário fora do formato HH:mm', () => {
    const result = businessHoursSchema.safeParse({
      ...valid,
      schedule: { 1: { open: true, start: '8h', end: '18:00' } },
    })
    expect(result.success).toBe(false)
  })
})
