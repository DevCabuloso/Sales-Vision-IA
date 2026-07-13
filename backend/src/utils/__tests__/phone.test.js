import { describe, it, expect } from 'vitest'
import { normalizePhone } from '../phone.js'

describe('utils/phone', () => {
  it('remove tudo que não é dígito', () => {
    expect(normalizePhone('+55 (11) 91234-5678')).toBe('5511912345678')
  })

  it('retorna string vazia para null/undefined', () => {
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
  })

  it('retorna string vazia para string vazia', () => {
    expect(normalizePhone('')).toBe('')
  })

  it('mantém string já só com dígitos inalterada', () => {
    expect(normalizePhone('5511912345678')).toBe('5511912345678')
  })
})
