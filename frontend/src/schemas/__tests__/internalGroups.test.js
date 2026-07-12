import { describe, it, expect } from 'vitest'
import { internalGroupSchema } from '../internalGroups'

describe('internalGroupSchema', () => {
  it('aceita nome e lista de membros', () => {
    expect(internalGroupSchema.safeParse({ name: 'Financeiro', member_ids: ['u1', 'u2'] }).success).toBe(true)
  })

  it('member_ids é opcional', () => {
    expect(internalGroupSchema.safeParse({ name: 'Financeiro' }).success).toBe(true)
  })

  it('rejeita nome vazio', () => {
    expect(internalGroupSchema.safeParse({ name: '' }).success).toBe(false)
    expect(internalGroupSchema.safeParse({ name: '   ' }).success).toBe(false)
  })
})
