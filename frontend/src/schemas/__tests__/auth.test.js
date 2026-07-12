import { describe, it, expect } from 'vitest'
import { loginSchema, registerSchema, changePasswordSchema } from '../auth'

describe('loginSchema', () => {
  it('aceita e-mail e senha válidos', () => {
    expect(loginSchema.safeParse({ email: 'ana@ex.com', password: '123' }).success).toBe(true)
  })

  it('rejeita e-mail vazio ou com formato inválido', () => {
    expect(loginSchema.safeParse({ email: '', password: '123' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'nao-e-email', password: '123' }).success).toBe(false)
  })

  it('rejeita senha vazia', () => {
    expect(loginSchema.safeParse({ email: 'ana@ex.com', password: '' }).success).toBe(false)
  })
})

describe('registerSchema', () => {
  const valid = { name: 'Ana Silva', companyName: 'Empresa da Ana', email: 'ana@ex.com', password: 'senha1234' }

  it('aceita dados completos', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true)
  })

  it('rejeita nome ou empresa com menos de 2 caracteres', () => {
    expect(registerSchema.safeParse({ ...valid, name: 'A' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, companyName: 'A' }).success).toBe(false)
  })

  it('rejeita senha com menos de 8 caracteres', () => {
    const result = registerSchema.safeParse({ ...valid, password: '1234567' })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('A senha deve ter pelo menos 8 caracteres.')
  })

  it('rejeita quando falta e-mail, nome ou empresa', () => {
    expect(registerSchema.safeParse({ ...valid, email: '' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...valid, companyName: '' }).success).toBe(false)
  })
})

describe('changePasswordSchema', () => {
  it('aceita quando a nova senha tem 8+ caracteres e confere com a confirmação', () => {
    const result = changePasswordSchema.safeParse({ current: 'atual', newPw: 'novasenha123', confirm: 'novasenha123' })
    expect(result.success).toBe(true)
  })

  it('rejeita nova senha com menos de 8 caracteres', () => {
    const result = changePasswordSchema.safeParse({ current: 'atual', newPw: '1234567', confirm: '1234567' })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('Nova senha deve ter pelo menos 8 caracteres.')
  })

  it('rejeita quando a confirmação não confere', () => {
    const result = changePasswordSchema.safeParse({ current: 'atual', newPw: 'novasenha123', confirm: 'diferente' })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('Confirmação de senha não confere.')
  })

  it('rejeita quando falta a senha atual', () => {
    const result = changePasswordSchema.safeParse({ current: '', newPw: 'novasenha123', confirm: 'novasenha123' })
    expect(result.success).toBe(false)
  })
})
