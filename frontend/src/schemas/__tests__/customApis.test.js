import { describe, it, expect } from 'vitest'
import { customApiSchema } from '../customApis'

describe('customApiSchema', () => {
  const valid = { name: 'Minha OpenAI', provider: 'openai', base_url: 'https://api.openai.com/v1', api_key: 'sk-x', model: 'gpt-4o-mini' }

  it('aceita dados válidos', () => {
    expect(customApiSchema.safeParse(valid).success).toBe(true)
  })

  it('rejeita nome vazio', () => {
    expect(customApiSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })

  it('rejeita URL base inválida', () => {
    const result = customApiSchema.safeParse({ ...valid, base_url: 'nao-e-url' })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('URL base inválida.')
  })
})
