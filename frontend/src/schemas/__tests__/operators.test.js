import { describe, it, expect } from 'vitest'
import { operatorSchema, operatorResetPasswordSchema } from '../operators'

describe('operatorSchema', () => {
  it('aceita nome, e-mail e senha válidos', () => {
    expect(operatorSchema.safeParse({ name: 'Ana', email: 'ana@ex.com', password: 'senha123' }).success).toBe(true)
  })

  it('password é opcional no schema (obrigatoriedade tratada fora, só em criação)', () => {
    expect(operatorSchema.safeParse({ name: 'Ana', email: 'ana@ex.com' }).success).toBe(true)
  })

  it('rejeita nome vazio ou e-mail inválido', () => {
    expect(operatorSchema.safeParse({ name: '', email: 'ana@ex.com' }).success).toBe(false)
    expect(operatorSchema.safeParse({ name: 'Ana', email: 'nao-e-email' }).success).toBe(false)
  })

  it('rejeita senha com menos de 8 caracteres quando informada', () => {
    expect(operatorSchema.safeParse({ name: 'Ana', email: 'ana@ex.com', password: '1234567' }).success).toBe(false)
  })
})

describe('operatorResetPasswordSchema', () => {
  it('exige 8+ caracteres', () => {
    expect(operatorResetPasswordSchema.safeParse({ password: '1234567' }).success).toBe(false)
    expect(operatorResetPasswordSchema.safeParse({ password: '12345678' }).success).toBe(true)
  })
})
