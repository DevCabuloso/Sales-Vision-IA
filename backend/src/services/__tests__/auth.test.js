import { describe, it, expect, vi } from 'vitest'

vi.mock('../../config/index.js', () => ({
  config: {
    jwt: { secret: 'test-secret-vitest', expiresIn: '1h' },
    encryptionKey: 'a'.repeat(64),
  },
}))

import { hashPassword, verifyPassword, signToken, verifyToken } from '../auth.js'

describe('auth service', () => {
  describe('hashPassword / verifyPassword', () => {
    it('gera hash e verifica senha corretamente', async () => {
      const hash = await hashPassword('minhasenha123')
      expect(hash).not.toBe('minhasenha123')
      expect(await verifyPassword('minhasenha123', hash)).toBe(true)
    })

    it('rejeita senha incorreta', async () => {
      const hash = await hashPassword('minhasenha123')
      expect(await verifyPassword('senhaerrada', hash)).toBe(false)
    })

    it('hashes diferentes para a mesma senha', async () => {
      const h1 = await hashPassword('igual')
      const h2 = await hashPassword('igual')
      expect(h1).not.toBe(h2)
    })
  })

  describe('signToken / verifyToken', () => {
    it('gera e verifica token JWT com payload correto', () => {
      const payload = { sub: 'user-123', role: 'admin', tenantId: 'tenant-abc' }
      const token = signToken(payload)
      const decoded = verifyToken(token)
      expect(decoded.sub).toBe('user-123')
      expect(decoded.role).toBe('admin')
      expect(decoded.tenantId).toBe('tenant-abc')
    })

    it('token é uma string em formato JWT', () => {
      const token = signToken({ sub: 'x' })
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)
    })

    it('lança erro com token inválido', () => {
      expect(() => verifyToken('token.invalido.aqui')).toThrow()
    })

    it('lança erro com token adulterado', () => {
      const token = signToken({ sub: 'user-1' })
      const tampered = token.slice(0, -4) + 'xxxx'
      expect(() => verifyToken(tampered)).toThrow()
    })
  })
})
