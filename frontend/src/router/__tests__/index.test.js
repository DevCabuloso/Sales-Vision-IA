import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn().mockResolvedValue({}),
    completeOnboarding: vi.fn(),
  },
  tokenStore: {
    get: vi.fn(() => null),
    set: vi.fn(),
    setSession: vi.fn(),
  },
}))

const router = (await import('../index.js')).default
const { useAuthStore } = await import('@/stores/auth')

function setUser(user) {
  const auth = useAuthStore()
  if (user) auth.hydrate(user)
  else auth.clearSession()
}

describe('router/index.js — beforeEach guard', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    setUser(null)
    // ponto de partida neutro (rota pública, distinta de /login) — evita que o
    // vue-router trate a navegação do teste como "mesma rota" (no-op) quando
    // o teste anterior já tiver deixado o router em cima do alvo testado
    await router.replace('/apresentacao')
  })

  it('rota pública é acessível sem autenticação', async () => {
    setUser(null)
    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('rota que requer auth redireciona para login quando não autenticado', async () => {
    setUser(null)
    await router.push('/dashboard')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('path raiz "/" é resolvido pelo redirect da rota filha antes do guard rodar (achado: o ramo "sempre limpa sessão" do guard é inalcançável nesta configuração de rotas)', async () => {
    // A rota '/' tem um filho { path: '', redirect: '/dashboard' }. O vue-router resolve
    // esse redirect durante o matching, ANTES de rodar o beforeEach — então o guard nunca
    // vê to.path === '/'; ele já recebe '/dashboard' como alvo. Documentando o comportamento
    // real (não o que o comentário do código sugere).
    setUser({ id: 'u1', role: 'admin', onboardingCompleted: true })
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('dashboard')
    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(true)
  }, 20000) // primeira resolução real (cold) do AppLayout+DashboardView via import dinâmico — sob
  // contenção da suíte completa em paralelo, isso pode passar dos 5s padrão do vitest

  it('owner navegando para rota fora de /admin é redirecionado para admin-overview', async () => {
    setUser({ id: 'owner-1', role: 'owner', onboardingCompleted: true })
    await router.push('/dashboard')
    expect(router.currentRoute.value.name).toBe('admin-overview')
  })

  it('owner pode acessar rotas /admin normalmente', async () => {
    setUser({ id: 'owner-1', role: 'owner', onboardingCompleted: true })
    await router.push('/admin/clientes')
    expect(router.currentRoute.value.name).toBe('admin-clients')
  })

  it('não-owner tentando acessar rota requiresOwner é redirecionado para dashboard', async () => {
    setUser({ id: 'u1', role: 'admin', onboardingCompleted: true })
    await router.push('/admin/overview')
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('tenant autenticado com onboarding incompleto é forçado para /onboarding', async () => {
    setUser({ id: 'u1', role: 'admin', onboardingCompleted: false })
    await router.push('/dashboard')
    expect(router.currentRoute.value.name).toBe('onboarding')
  })

  it('tenant com onboarding incompleto pode permanecer em /onboarding sem loop', async () => {
    setUser({ id: 'u1', role: 'admin', onboardingCompleted: false })
    await router.push('/onboarding')
    expect(router.currentRoute.value.name).toBe('onboarding')
  })

  it('usuário já autenticado (não-owner) visitando /login é redirecionado para dashboard', async () => {
    setUser({ id: 'u1', role: 'admin', onboardingCompleted: true })
    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('usuário já autenticado (owner) visitando /login é redirecionado para admin-overview', async () => {
    setUser({ id: 'owner-1', role: 'owner', onboardingCompleted: true })
    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('admin-overview')
  })

  it('navegação legítima (tenant completo, rota permitida) não é redirecionada', async () => {
    setUser({ id: 'u1', role: 'admin', onboardingCompleted: true })
    await router.push('/leads')
    expect(router.currentRoute.value.name).toBe('leads')
  })

  it('rotas públicas continuam acessíveis mesmo autenticado como owner', async () => {
    setUser({ id: 'owner-1', role: 'owner', onboardingCompleted: true })
    await router.push('/apresentacao')
    expect(router.currentRoute.value.name).toBe('trial-landing')
  })
})
