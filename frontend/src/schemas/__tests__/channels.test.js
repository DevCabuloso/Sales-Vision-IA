import { describe, it, expect } from 'vitest'
import { channelNameSchema, channelSettingsSchema } from '../channels'

describe('channelNameSchema', () => {
  it('aceita nome válido', () => {
    expect(channelNameSchema.safeParse({ name: 'Canal Principal' }).success).toBe(true)
  })

  it('rejeita nome vazio', () => {
    expect(channelNameSchema.safeParse({ name: '' }).success).toBe(false)
    expect(channelNameSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('rejeita nome acima de 60 caracteres', () => {
    expect(channelNameSchema.safeParse({ name: 'a'.repeat(61) }).success).toBe(false)
  })
})

describe('channelSettingsSchema', () => {
  it('aceita configuração válida com atribuição a usuário', () => {
    const result = channelSettingsSchema.safeParse({ name: 'Canal', goodbye_message: 'Até logo!', assigned_user_id: 'u1', assigned_queue_id: null })
    expect(result.success).toBe(true)
  })

  it('rejeita nome vazio', () => {
    expect(channelSettingsSchema.safeParse({ name: '', goodbye_message: null, assigned_user_id: null, assigned_queue_id: null }).success).toBe(false)
  })
})
