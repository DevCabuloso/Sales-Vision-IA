import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { http, tokenStore } from '../api.js'

const TOKEN_KEY = 'sdr_token'
const USER_KEY = 'sdr_user'

function requestFulfilled(cfg) {
  return http.interceptors.request.handlers[0].fulfilled(cfg)
}
function responseRejected(err) {
  return http.interceptors.response.handlers[0].rejected(err)
}

describe('services/api.js — interceptors', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  describe('request interceptor', () => {
    it('injeta Authorization Bearer quando há token de impersonação em sessionStorage', () => {
      sessionStorage.setItem(TOKEN_KEY, 'abc123')
      const cfg = requestFulfilled({ headers: {} })
      expect(cfg.headers.Authorization).toBe('Bearer abc123')
    })

    it('não injeta Authorization quando não há token de sessão', () => {
      const cfg = requestFulfilled({ headers: {} })
      expect(cfg.headers.Authorization).toBeUndefined()
    })
  })

  describe('response interceptor', () => {
    it('normaliza o erro para a mensagem em err.response.data.error', async () => {
      const original = { response: { status: 400, data: { error: 'Dados inválidos' } } }
      await expect(responseRejected(original)).rejects.toThrow('Dados inválidos')
    })

    it('usa err.message quando não há response.data.error', async () => {
      const original = { message: 'Network Error' }
      await expect(responseRejected(original)).rejects.toThrow('Network Error')
    })

    it('usa "Erro de rede" como fallback final', async () => {
      const original = {}
      await expect(responseRejected(original)).rejects.toThrow('Erro de rede')
    })

    it('em 401, limpa o token de sessão e o usuário de localStorage', async () => {
      sessionStorage.setItem(TOKEN_KEY, 'abc123')
      localStorage.setItem(USER_KEY, JSON.stringify({ id: 'u1' }))
      const original = { response: { status: 401, data: { error: 'Não autorizado' } } }
      await expect(responseRejected(original)).rejects.toThrow('Não autorizado')
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
      expect(localStorage.getItem(USER_KEY)).toBeNull()
    })

    it('em erro não-401, não mexe no token/usuário armazenados', async () => {
      sessionStorage.setItem(TOKEN_KEY, 'abc123')
      localStorage.setItem(USER_KEY, JSON.stringify({ id: 'u1' }))
      const original = { response: { status: 500, data: { error: 'Erro interno' } } }
      await expect(responseRejected(original)).rejects.toThrow('Erro interno')
      expect(sessionStorage.getItem(TOKEN_KEY)).toBe('abc123')
      expect(localStorage.getItem(USER_KEY)).not.toBeNull()
    })
  })

  describe('tokenStore', () => {
    it('get() lê o token de sessionStorage', () => {
      sessionStorage.setItem(TOKEN_KEY, 'xyz')
      expect(tokenStore.get()).toBe('xyz')
    })

    it('get() retorna null quando não há token', () => {
      expect(tokenStore.get()).toBeNull()
    })

    it('set() é um no-op (login normal usa cookie httpOnly, não localStorage)', () => {
      tokenStore.set('qualquer-coisa')
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    })

    it('setSession(v) grava o token em sessionStorage', () => {
      tokenStore.setSession('token-de-impersonacao')
      expect(sessionStorage.getItem(TOKEN_KEY)).toBe('token-de-impersonacao')
    })

    it('setSession(null) remove o token de sessionStorage', () => {
      sessionStorage.setItem(TOKEN_KEY, 'algo')
      tokenStore.setSession(null)
      expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    })
  })
})
