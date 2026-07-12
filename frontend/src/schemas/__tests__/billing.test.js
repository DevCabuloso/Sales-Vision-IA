import { describe, it, expect } from 'vitest'
import { trialSignupSchema } from '../billing'

describe('trialSignupSchema', () => {
  const valid = { name: 'Ana', companyName: 'Empresa Ana', email: 'ana@ex.com', phone: '', password: 'senha1234' }

  it('aceita dados válidos e converte telefone vazio em undefined', () => {
    const result = trialSignupSchema.safeParse(valid)
    expect(result.success).toBe(true)
    expect(result.data.phone).toBeUndefined()
  })

  it('rejeita quando falta nome, empresa, e-mail ou senha', () => {
    expect(trialSignupSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
    expect(trialSignupSchema.safeParse({ ...valid, companyName: '' }).success).toBe(false)
    expect(trialSignupSchema.safeParse({ ...valid, email: '' }).success).toBe(false)
  })

  it('rejeita senha com menos de 8 caracteres', () => {
    const result = trialSignupSchema.safeParse({ ...valid, password: '1234567' })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('A senha deve ter pelo menos 8 caracteres.')
  })

  it('rejeita telefone preenchido com menos de 8 caracteres', () => {
    const result = trialSignupSchema.safeParse({ ...valid, phone: '123' })
    expect(result.success).toBe(false)
  })
})
