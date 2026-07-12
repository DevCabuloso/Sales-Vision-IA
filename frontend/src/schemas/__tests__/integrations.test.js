import { describe, it, expect } from 'vitest'
import { googleSetupSchema, metaConnectSchema, evolutionConnectSchema } from '../integrations'

describe('googleSetupSchema', () => {
  it('exige clientId e clientSecret com 10+ caracteres', () => {
    expect(googleSetupSchema.safeParse({ clientId: 'a'.repeat(10), clientSecret: 'b'.repeat(10) }).success).toBe(true)
    expect(googleSetupSchema.safeParse({ clientId: 'curto', clientSecret: 'b'.repeat(10) }).success).toBe(false)
  })
})

describe('metaConnectSchema', () => {
  const valid = { accessToken: 'a'.repeat(10), phoneNumberId: '123456' }

  it('aceita dados válidos, wabaId é opcional', () => {
    expect(metaConnectSchema.safeParse(valid).success).toBe(true)
  })

  it('rejeita accessToken ou phoneNumberId curtos', () => {
    expect(metaConnectSchema.safeParse({ ...valid, accessToken: 'curto' }).success).toBe(false)
    expect(metaConnectSchema.safeParse({ ...valid, phoneNumberId: 'ab' }).success).toBe(false)
  })
})

describe('evolutionConnectSchema', () => {
  const valid = { baseUrl: 'https://evo.example.com', apiKey: 'abc', instance: 'inst1' }

  it('aceita dados válidos', () => {
    expect(evolutionConnectSchema.safeParse(valid).success).toBe(true)
  })

  it('rejeita URL base inválida', () => {
    expect(evolutionConnectSchema.safeParse({ ...valid, baseUrl: 'nao-e-url' }).success).toBe(false)
  })

  it('rejeita instância vazia', () => {
    expect(evolutionConnectSchema.safeParse({ ...valid, instance: '' }).success).toBe(false)
  })
})
