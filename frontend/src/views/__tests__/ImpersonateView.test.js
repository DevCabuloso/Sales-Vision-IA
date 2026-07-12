import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ query: {}, replace: null, impersonate: null }))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRouter: () => ({ replace: (...a) => mockState.replace(...a) }),
    useRoute: () => ({ query: mockState.query }),
  }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ impersonate: (...a) => mockState.impersonate(...a) }),
}))

const ImpersonateView = (await import('../ImpersonateView.vue')).default

describe('ImpersonateView', () => {
  beforeEach(() => {
    mockState.query = {}
    mockState.replace = vi.fn()
    mockState.impersonate = vi.fn()
  })

  it('redireciona para /login quando faltam token ou usuário na query', async () => {
    mount(ImpersonateView, pluginOptions())
    await new Promise((r) => setTimeout(r, 0))
    expect(mockState.replace).toHaveBeenCalledWith('/login')
    expect(mockState.impersonate).not.toHaveBeenCalled()
  })

  it('redireciona para /login quando o usuário codificado é inválido', async () => {
    mockState.query = { token: 'jwt-abc', u: 'não-é-base64-válido!!!' }
    mount(ImpersonateView, pluginOptions())
    await new Promise((r) => setTimeout(r, 0))
    expect(mockState.replace).toHaveBeenCalledWith('/login')
  })

  it('faz a impersonação e redireciona para /dashboard com token/usuário válidos', async () => {
    const user = { id: 'user-1', role: 'admin' }
    mockState.query = { token: 'jwt-abc', u: btoa(encodeURIComponent(JSON.stringify(user))) }
    mount(ImpersonateView, pluginOptions())
    await new Promise((r) => setTimeout(r, 0))
    expect(mockState.impersonate).toHaveBeenCalledWith('jwt-abc', user)
    expect(mockState.replace).toHaveBeenCalledWith('/dashboard')
  })
})
