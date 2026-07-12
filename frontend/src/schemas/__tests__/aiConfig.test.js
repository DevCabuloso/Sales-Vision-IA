import { describe, it, expect } from 'vitest'
import { aiConfigSchema } from '../aiConfig'

describe('aiConfigSchema', () => {
  const valid = { name: 'SDR IA', model: 'gpt-4o-mini', system_prompt: '', main_prompt: '', temperature: 0.7, max_tokens: 1000 }

  it('aceita dados válidos', () => {
    expect(aiConfigSchema.safeParse(valid).success).toBe(true)
  })

  it('rejeita temperatura fora do intervalo 0-2', () => {
    expect(aiConfigSchema.safeParse({ ...valid, temperature: 2.5 }).success).toBe(false)
    expect(aiConfigSchema.safeParse({ ...valid, temperature: -1 }).success).toBe(false)
  })

  it('rejeita max_tokens fora do intervalo 100-32000', () => {
    expect(aiConfigSchema.safeParse({ ...valid, max_tokens: 50 }).success).toBe(false)
    expect(aiConfigSchema.safeParse({ ...valid, max_tokens: 40000 }).success).toBe(false)
  })

  it('rejeita prompts acima de 8000 caracteres', () => {
    expect(aiConfigSchema.safeParse({ ...valid, system_prompt: 'a'.repeat(8001) }).success).toBe(false)
  })
})
