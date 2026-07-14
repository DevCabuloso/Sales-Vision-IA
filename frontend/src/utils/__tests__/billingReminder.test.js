import { describe, it, expect } from 'vitest'
import { billingReminderInfo } from '../billingReminder'

describe('billingReminderInfo', () => {
  const now = new Date('2026-07-14T12:00:00.000Z')

  it('retorna estado neutro quando não há data', () => {
    expect(billingReminderInfo(null, now)).toEqual({ label: 'Sem vencimento definido', color: 'grey', days: null })
  })

  it('marca como vencido quando a data já passou', () => {
    const info = billingReminderInfo('2026-07-10T12:00:00.000Z', now)
    expect(info.color).toBe('error')
    expect(info.label).toContain('Vencido')
  })

  it('marca "vence hoje" quando a data é hoje', () => {
    const info = billingReminderInfo('2026-07-14T10:00:00.000Z', now)
    expect(info.color).toBe('error')
    expect(info.label).toBe('Vence hoje')
  })

  it('marca como atenção (warning) quando vence em até 7 dias', () => {
    const info = billingReminderInfo('2026-07-20T12:00:00.000Z', now)
    expect(info.color).toBe('warning')
    expect(info.days).toBe(6)
  })

  it('marca como ok (success) quando vence em mais de 7 dias', () => {
    const info = billingReminderInfo('2026-08-14T12:00:00.000Z', now)
    expect(info.color).toBe('success')
  })
})
