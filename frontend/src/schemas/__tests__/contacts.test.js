import { describe, it, expect } from 'vitest'
import { contactSchema } from '../contacts'

describe('contactSchema', () => {
  const valid = { name: 'Ana', phone: '11988887777', email: 'ana@ex.com', tags: [], stage: 'Novo Lead' }

  it('aceita dados completos', () => {
    expect(contactSchema.safeParse(valid).success).toBe(true)
  })

  it('aceita e-mail vazio (opcional)', () => {
    expect(contactSchema.safeParse({ ...valid, email: '' }).success).toBe(true)
  })

  it('rejeita telefone ausente ou curto', () => {
    expect(contactSchema.safeParse({ ...valid, phone: '' }).success).toBe(false)
    expect(contactSchema.safeParse({ ...valid, phone: '123' }).success).toBe(false)
  })

  it('rejeita e-mail com formato inválido', () => {
    const result = contactSchema.safeParse({ ...valid, email: 'nao-e-email' })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('E-mail inválido.')
  })
})
