import { describe, it, expect } from 'vitest'
import { templateSchema, templateCategorySchema } from '../templates'

describe('templateSchema', () => {
  it('aceita nome, categoria e conteúdo válidos', () => {
    expect(templateSchema.safeParse({ name: 'Boas-vindas', category: 'Marketing', content: 'Olá!' }).success).toBe(true)
  })

  it('rejeita quando falta nome ou conteúdo', () => {
    const noName = templateSchema.safeParse({ name: '', category: 'Marketing', content: 'Olá!' })
    expect(noName.success).toBe(false)
    expect(noName.error.issues[0].message).toBe('Nome e conteúdo são obrigatórios.')

    const noContent = templateSchema.safeParse({ name: 'Boas-vindas', category: 'Marketing', content: '' })
    expect(noContent.success).toBe(false)
  })

  it('rejeita conteúdo acima de 4000 caracteres', () => {
    const result = templateSchema.safeParse({ name: 'x', category: 'Marketing', content: 'a'.repeat(4001) })
    expect(result.success).toBe(false)
  })
})

describe('templateCategorySchema', () => {
  it('rejeita nome vazio', () => {
    expect(templateCategorySchema.safeParse({ name: '' }).success).toBe(false)
    expect(templateCategorySchema.safeParse({ name: '  ' }).success).toBe(false)
  })

  it('aceita nome válido', () => {
    expect(templateCategorySchema.safeParse({ name: 'Suporte' }).success).toBe(true)
  })
})
