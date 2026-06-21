import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

export function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn })
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret)
}
