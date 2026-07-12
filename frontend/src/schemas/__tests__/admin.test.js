import { describe, it, expect } from 'vitest'
import { createOwnerSchema, ownerResetPasswordSchema, editUserSchema, userResetPasswordSchema, createClientSchema } from '../admin'

describe('createOwnerSchema', () => {
  it('aceita dados completos', () => {
    expect(createOwnerSchema.safeParse({ name: 'Ana', email: 'ana@ex.com', password: 'senha1234' }).success).toBe(true)
  })

  it('rejeita campo vazio com a mensagem genérica', () => {
    const result = createOwnerSchema.safeParse({ name: '', email: 'ana@ex.com', password: 'senha1234' })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('Preencha todos os campos.')
  })

  it('rejeita senha curta com mensagem específica', () => {
    const result = createOwnerSchema.safeParse({ name: 'Ana', email: 'ana@ex.com', password: '123' })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('Senha deve ter pelo menos 8 caracteres.')
  })
})

describe('ownerResetPasswordSchema / userResetPasswordSchema', () => {
  it('exigem 8+ caracteres', () => {
    expect(ownerResetPasswordSchema.safeParse({ password: '1234567' }).success).toBe(false)
    expect(ownerResetPasswordSchema.safeParse({ password: '12345678' }).success).toBe(true)
    expect(userResetPasswordSchema.safeParse({ password: '1234567' }).success).toBe(false)
  })
})

describe('editUserSchema', () => {
  it('exige nome e um role válido', () => {
    expect(editUserSchema.safeParse({ name: 'Ana', role: 'admin' }).success).toBe(true)
    expect(editUserSchema.safeParse({ name: '', role: 'admin' }).success).toBe(false)
    expect(editUserSchema.safeParse({ name: 'Ana', role: 'owner' }).success).toBe(false)
  })
})

describe('createClientSchema', () => {
  const valid = { name: 'Empresa', slug: 'empresa', adminEmail: 'admin@ex.com', adminPassword: 'senha1234' }

  it('aceita dados completos', () => {
    expect(createClientSchema.safeParse(valid).success).toBe(true)
  })

  it('rejeita quando falta algum campo obrigatório', () => {
    expect(createClientSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
    expect(createClientSchema.safeParse({ ...valid, slug: '' }).success).toBe(false)
    expect(createClientSchema.safeParse({ ...valid, adminEmail: '' }).success).toBe(false)
    expect(createClientSchema.safeParse({ ...valid, adminPassword: '' }).success).toBe(false)
  })

  it('rejeita senha do admin com menos de 8 caracteres', () => {
    const result = createClientSchema.safeParse({ ...valid, adminPassword: '123' })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('A senha do admin deve ter pelo menos 8 caracteres.')
  })

  it('rejeita slug com maiúsculas, espaços ou símbolos', () => {
    expect(createClientSchema.safeParse({ ...valid, slug: 'Minha Empresa!' }).success).toBe(false)
    expect(createClientSchema.safeParse({ ...valid, slug: 'minha-empresa-2' }).success).toBe(true)
  })
})
