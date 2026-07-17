import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockState = vi.hoisted(() => ({ sendMail: null, config: null }))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: (...a) => mockState.sendMail(...a) })),
  },
}))

vi.mock('../../config/index.js', () => ({
  get config() { return mockState.config },
}))

describe('services/email', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.sendMail = vi.fn().mockResolvedValue(undefined)
  })

  it('não envia e faz no-op logado quando SMTP_HOST não está configurado', async () => {
    mockState.config = { smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' } }
    const { sendEmail } = await import('../email.js')
    const result = await sendEmail({ to: 'a@ex.com', subject: 'Oi', html: '<p>Oi</p>' })
    expect(result).toEqual({ sent: false, reason: 'smtp_not_configured' })
    expect(mockState.sendMail).not.toHaveBeenCalled()
  })

  it('envia via nodemailer quando SMTP está configurado', async () => {
    mockState.config = { smtp: { host: 'smtp.ex.com', port: 587, secure: false, user: 'user', pass: 'pass', from: 'noreply@ex.com' } }
    const { sendEmail } = await import('../email.js')
    const result = await sendEmail({ to: 'a@ex.com', subject: 'Oi', html: '<p>Oi</p>' })
    expect(result).toEqual({ sent: true })
    expect(mockState.sendMail).toHaveBeenCalledWith({ from: 'noreply@ex.com', to: 'a@ex.com', subject: 'Oi', html: '<p>Oi</p>' })
  })

  it('nunca lança erro — falha do transporte é engolida e reportada no retorno', async () => {
    mockState.config = { smtp: { host: 'smtp.ex.com', port: 587, secure: false, user: '', pass: '', from: '' } }
    mockState.sendMail = vi.fn().mockRejectedValue(new Error('conexão recusada'))
    const { sendEmail } = await import('../email.js')
    const result = await sendEmail({ to: 'a@ex.com', subject: 'Oi', html: '<p>Oi</p>' })
    expect(result).toEqual({ sent: false, reason: 'conexão recusada' })
  })
})
