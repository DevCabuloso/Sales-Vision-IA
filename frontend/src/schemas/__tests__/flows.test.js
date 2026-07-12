import { describe, it, expect } from 'vitest'
import { createFlowSchema } from '../flows'

describe('createFlowSchema', () => {
  it('aceita nome válido, demais campos opcionais', () => {
    expect(createFlowSchema.safeParse({ name: 'Boas-vindas' }).success).toBe(true)
  })

  it('rejeita nome vazio', () => {
    expect(createFlowSchema.safeParse({ name: '' }).success).toBe(false)
    expect(createFlowSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('aceita channel_id nulo e trigger_keywords', () => {
    expect(createFlowSchema.safeParse({ name: 'x', channel_id: null, trigger_keywords: ['oi'] }).success).toBe(true)
  })
})
