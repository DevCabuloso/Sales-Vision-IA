import crypto from 'node:crypto'
import { config } from '../config/index.js'

// AES-256-GCM. A chave deve ter 32 bytes (64 chars hex) no ENCRYPTION_KEY.
const ALGO = 'aes-256-gcm'

function getKey() {
  const hex = config.encryptionKey
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY inválida: defina 32 bytes em hex (64 caracteres). ' +
      'Gere com: openssl rand -hex 32'
    )
  }
  return Buffer.from(hex, 'hex')
}

/** Criptografa um objeto/valor; retorna string "iv:tag:ciphertext" em base64. */
export function encrypt(data) {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

/** Descriptografa o que foi gerado por encrypt() e faz JSON.parse. */
export function decryptJSON(payload) {
  if (!payload) return null
  const key = getKey()
  const [ivB64, tagB64, dataB64] = payload.split(':')
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(plaintext.toString('utf8'))
}
