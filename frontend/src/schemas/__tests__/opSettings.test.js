import { describe, it, expect } from 'vitest'
import { DEFAULTS, opSettingsSchema } from '../opSettings'

describe('opSettingsSchema', () => {
  it('aceita os valores padrão (DEFAULTS)', () => {
    expect(opSettingsSchema.safeParse(DEFAULTS).success).toBe(true)
  })

  it('rejeita tipo errado num campo booleano', () => {
    expect(opSettingsSchema.safeParse({ ...DEFAULTS, auto_close_enabled: 'sim' }).success).toBe(false)
  })

  it('rejeita tipo errado num campo numérico', () => {
    expect(opSettingsSchema.safeParse({ ...DEFAULTS, auto_close_minutes: 'trinta' }).success).toBe(false)
  })

  it('descarta chaves desconhecidas (mesmo comportamento não-strict do backend)', () => {
    const result = opSettingsSchema.safeParse({ ...DEFAULTS, campo_inexistente: true })
    expect(result.success).toBe(true)
    expect(result.data.campo_inexistente).toBeUndefined()
  })
})
