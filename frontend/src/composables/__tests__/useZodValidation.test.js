import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { validateForm, zodRule } from '../useZodValidation'

describe('validateForm', () => {
  const schema = z.object({ email: z.string().email('E-mail inválido.') })

  it('retorna success e os dados parseados quando válido', () => {
    const result = validateForm(schema, { email: 'ana@ex.com' })
    expect(result).toEqual({ success: true, data: { email: 'ana@ex.com' }, error: null })
  })

  it('retorna a mensagem do primeiro issue quando inválido', () => {
    const result = validateForm(schema, { email: 'nao-e-email' })
    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
    expect(result.error).toBe('E-mail inválido.')
  })
})

describe('zodRule', () => {
  const rule = zodRule(z.string().min(3, 'Mínimo de 3 caracteres.'))

  it('retorna true quando o valor passa no schema', () => {
    expect(rule('abcd')).toBe(true)
  })

  it('retorna a mensagem de erro quando o valor falha', () => {
    expect(rule('ab')).toBe('Mínimo de 3 caracteres.')
  })
})
