import { describe, it, expect } from 'vitest'
import { teamMemberSchema, queueNameSchema, aiSetupSchema } from '../onboarding'

describe('teamMemberSchema', () => {
  it('aceita nome, e-mail e role válidos', () => {
    expect(teamMemberSchema.safeParse({ name: 'Bia', email: 'bia@ex.com', role: 'agent' }).success).toBe(true)
  })

  it('rejeita e-mail com formato inválido', () => {
    const result = teamMemberSchema.safeParse({ name: 'Bia', email: 'nao-e-email', role: 'agent' })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('E-mail inválido para um dos membros da equipe.')
  })

  it('rejeita nome vazio', () => {
    expect(teamMemberSchema.safeParse({ name: '', email: 'bia@ex.com', role: 'agent' }).success).toBe(false)
  })
})

describe('queueNameSchema', () => {
  it('rejeita nome vazio ou muito longo', () => {
    expect(queueNameSchema.safeParse({ name: '' }).success).toBe(false)
    expect(queueNameSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })
})

describe('aiSetupSchema', () => {
  it('exige nome e chave OpenAI com 10+ caracteres', () => {
    expect(aiSetupSchema.safeParse({ name: 'Ana', openaiKey: 'sk-12345678' }).success).toBe(true)
    expect(aiSetupSchema.safeParse({ name: 'Ana', openaiKey: 'curto' }).success).toBe(false)
    expect(aiSetupSchema.safeParse({ name: '', openaiKey: 'sk-12345678' }).success).toBe(false)
  })
})
