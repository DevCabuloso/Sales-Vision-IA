import { describe, it, expect } from 'vitest'
import { campaignSchema, intervalSchema, importContactsSchema } from '../broadcast'

describe('campaignSchema', () => {
  const valid = { name: 'Promoção', content: 'Oi!', min_interval_seconds: 2, max_interval_seconds: 5 }

  it('aceita dados válidos', () => {
    expect(campaignSchema.safeParse(valid).success).toBe(true)
  })

  it('rejeita quando falta nome ou mensagem', () => {
    const noName = campaignSchema.safeParse({ ...valid, name: '' })
    expect(noName.success).toBe(false)
    expect(noName.error.issues[0].message).toBe('Nome e mensagem são obrigatórios.')

    expect(campaignSchema.safeParse({ ...valid, content: '' }).success).toBe(false)
  })

  it('rejeita quando o intervalo máximo é menor que o mínimo', () => {
    const result = campaignSchema.safeParse({ ...valid, min_interval_seconds: 10, max_interval_seconds: 5 })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('O intervalo máximo deve ser maior ou igual ao mínimo.')
  })
})

describe('intervalSchema', () => {
  it('rejeita máximo menor que o mínimo', () => {
    expect(intervalSchema.safeParse({ min_interval_seconds: 10, max_interval_seconds: 5 }).success).toBe(false)
  })

  it('aceita valores válidos', () => {
    expect(intervalSchema.safeParse({ min_interval_seconds: 2, max_interval_seconds: 5 }).success).toBe(true)
  })
})

describe('importContactsSchema', () => {
  it('aceita lista de contatos válida', () => {
    expect(importContactsSchema.safeParse({ contacts: [{ name: 'Ana', phone: '11988887777' }] }).success).toBe(true)
  })

  it('rejeita lista vazia', () => {
    expect(importContactsSchema.safeParse({ contacts: [] }).success).toBe(false)
  })

  it('rejeita telefone curto', () => {
    expect(importContactsSchema.safeParse({ contacts: [{ phone: '123' }] }).success).toBe(false)
  })
})
