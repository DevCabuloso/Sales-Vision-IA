import { describe, it, expect, vi } from 'vitest'

vi.mock('../../config/index.js', () => ({
  config: {
    jwt: { secret: 'test-secret-vitest', expiresIn: '1h' },
    encryptionKey: 'a'.repeat(64),
  },
}))

import { encrypt, decryptJSON } from '../crypto.js'

describe('crypto service', () => {
  it('criptografa e descriptografa objeto corretamente', () => {
    const dados = { token: 'meu-token-secreto', user: 'joao' }
    const payload = encrypt(dados)
    expect(typeof payload).toBe('string')
    expect(payload.split(':').length).toBe(3) // iv:tag:ciphertext
    expect(decryptJSON(payload)).toEqual(dados)
  })

  it('retorna null para payload null ou vazio', () => {
    expect(decryptJSON(null)).toBeNull()
    expect(decryptJSON('')).toBeNull()
  })

  it('gera ciphertexts diferentes para o mesmo dado (IV aleatório)', () => {
    const dados = { valor: 42 }
    const p1 = encrypt(dados)
    const p2 = encrypt(dados)
    expect(p1).not.toBe(p2)
    expect(decryptJSON(p1)).toEqual(dados)
    expect(decryptJSON(p2)).toEqual(dados)
  })

  it('criptografa tipos variados: string, número, array', () => {
    expect(decryptJSON(encrypt('texto simples'))).toBe('texto simples')
    expect(decryptJSON(encrypt(12345))).toBe(12345)
    expect(decryptJSON(encrypt([1, 2, 3]))).toEqual([1, 2, 3])
  })

  it('lança erro ao descriptografar payload corrompido', () => {
    const payload = encrypt({ ok: true })
    const parts = payload.split(':')
    parts[2] = Buffer.from('dados_corrompidos').toString('base64')
    expect(() => decryptJSON(parts.join(':'))).toThrow()
  })
})
