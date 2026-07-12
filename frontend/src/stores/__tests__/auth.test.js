import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    completeOnboarding: vi.fn(),
  },
  tokenStore: {
    get: vi.fn(() => null),
    set: vi.fn(),
    setSession: vi.fn(),
  },
}))

import { api, tokenStore } from '@/services/api'
import { useAuthStore } from '../auth.js'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('inicia deslogado quando não há usuário persistido', () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
  })

  it('login popula o usuário e persiste em localStorage', async () => {
    const user = { id: 'u1', role: 'admin', tenantId: 't1' }
    api.login.mockResolvedValue({ user })

    const store = useAuthStore()
    const result = await store.login('a@b.com', 'senha123')

    expect(result).toEqual(user)
    expect(store.user).toEqual(user)
    expect(store.isAuthenticated).toBe(true)
    expect(JSON.parse(localStorage.getItem('sdr_user'))).toEqual(user)
  })

  it('isOwner reflete o role do usuário logado', async () => {
    api.login.mockResolvedValue({ user: { id: 'u1', role: 'owner' } })
    const store = useAuthStore()
    await store.login('owner@b.com', 'senha123')
    expect(store.isOwner).toBe(true)
  })

  it('loginSuperAdmin desloga e lança erro se usuário não for owner', async () => {
    api.login.mockResolvedValue({ user: { id: 'u1', role: 'admin' } })
    api.logout.mockResolvedValue({})

    const store = useAuthStore()
    await expect(store.loginSuperAdmin('a@b.com', 'senha123')).rejects.toThrow('Acesso restrito ao superadmin.')
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('loginSuperAdmin mantém sessão quando usuário é owner', async () => {
    const user = { id: 'u1', role: 'owner' }
    api.login.mockResolvedValue({ user })
    const store = useAuthStore()
    const result = await store.loginSuperAdmin('owner@b.com', 'senha123')
    expect(result).toEqual(user)
    expect(store.isAuthenticated).toBe(true)
  })

  it('logout limpa sessão mesmo se a chamada à API falhar', async () => {
    api.login.mockResolvedValue({ user: { id: 'u1', role: 'admin' } })
    api.logout.mockRejectedValue(new Error('rede fora'))

    const store = useAuthStore()
    await store.login('a@b.com', 'senha123')
    await store.logout()

    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
    expect(localStorage.getItem('sdr_user')).toBeNull()
  })

  it('impersonate define token de sessão e usuário sem afetar localStorage', () => {
    const store = useAuthStore()
    store.impersonate('token-abc', { id: 'u2', role: 'admin' })

    expect(store.token).toBe('token-abc')
    expect(store.user).toEqual({ id: 'u2', role: 'admin' })
    expect(tokenStore.setSession).toHaveBeenCalledWith('token-abc')
  })

  it('completeOnboarding marca onboardingCompleted como true no usuário atual', async () => {
    api.login.mockResolvedValue({ user: { id: 'u1', role: 'admin', onboardingCompleted: false } })
    api.completeOnboarding.mockResolvedValue({})

    const store = useAuthStore()
    await store.login('a@b.com', 'senha123')
    expect(store.onboardingCompleted).toBe(false)

    await store.completeOnboarding()
    expect(store.onboardingCompleted).toBe(true)
  })

  it('hydrate popula o usuário a partir de um objeto externo (ex.: retorno de pagamento)', () => {
    const store = useAuthStore()
    store.hydrate({ id: 'u3', role: 'admin' })
    expect(store.user).toEqual({ id: 'u3', role: 'admin' })
    expect(JSON.parse(localStorage.getItem('sdr_user'))).toEqual({ id: 'u3', role: 'admin' })
  })
})
