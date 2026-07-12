import { describe, it, expect } from 'vitest'
import { followupSequenceSchema } from '../followups'

describe('followupSequenceSchema', () => {
  const validStep = { delay_days: 0, text: 'Olá!', media_url: null, media_type: null, media_mimetype: null, media_filename: null, send_time: null }
  const valid = { name: 'Pós-venda', description: null, time_mode: 'general', default_send_time: '09:00', steps: [validStep] }

  it('aceita dados válidos', () => {
    expect(followupSequenceSchema.safeParse(valid).success).toBe(true)
  })

  it('rejeita nome vazio (mensagem aparece primeiro mesmo com outros erros)', () => {
    const result = followupSequenceSchema.safeParse({ ...valid, name: '', steps: [{ ...validStep, text: '' }] })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('Informe um nome para o acompanhamento.')
  })

  it('rejeita mensagem de etapa vazia', () => {
    const result = followupSequenceSchema.safeParse({ ...valid, steps: [{ ...validStep, text: '' }] })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toBe('Todas as mensagens precisam de conteúdo.')
  })

  it('rejeita lista de etapas vazia', () => {
    expect(followupSequenceSchema.safeParse({ ...valid, steps: [] }).success).toBe(false)
  })

  it('rejeita horário fora do formato HH:mm', () => {
    expect(followupSequenceSchema.safeParse({ ...valid, default_send_time: '9h' }).success).toBe(false)
    expect(followupSequenceSchema.safeParse({ ...valid, steps: [{ ...validStep, send_time: '9h' }] }).success).toBe(false)
  })
})
