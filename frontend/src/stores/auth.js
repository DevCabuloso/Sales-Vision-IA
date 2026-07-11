import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, tokenStore } from '@/services/api'

const USER_KEY = 'sdr_user'

const userStore = {
  get: () => {
    try {
      const v = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY)
      return v ? JSON.parse(v) : null
    } catch { return null }
  },
  set: (u) => u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY),
  setSession: (u) => u ? sessionStorage.setItem(USER_KEY, JSON.stringify(u)) : sessionStorage.removeItem(USER_KEY),
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(userStore.get())
  // token só é não-nulo durante sessões de impersonação (sessionStorage)
  const token = ref(tokenStore.get())

  // isAuthenticated baseia-se no user object (persistido em localStorage).
  // A sessão real é validada pelo httpOnly cookie a cada request ao backend.
  const isAuthenticated = computed(() => !!user.value)
  const isOwner = computed(() => user.value?.role === 'owner')
  const onboardingCompleted = computed(() => user.value?.onboardingCompleted ?? true)

  async function login(email, password) {
    const { user: u } = await api.login(email, password)
    user.value = u
    userStore.set(u)
    return u
  }

  async function loginSuperAdmin(email, password) {
    const u = await login(email, password)
    if (u.role !== 'owner') {
      await logout()
      throw new Error('Acesso restrito ao superadmin.')
    }
    return u
  }

  async function register(name, companyName, email, password) {
    const { user: u } = await api.register(name, companyName, email, password)
    user.value = u
    userStore.set(u)
    return u
  }

  function clearSession() {
    token.value = null
    user.value = null
    tokenStore.setSession(null)
    userStore.set(null)
    userStore.setSession(null)
  }

  async function logout() {
    clearSession()
    try { await api.logout() } catch { /* ignora */ }
  }

  function hydrate(u) {
    if (u) { user.value = u; userStore.set(u) }
  }

  async function completeOnboarding() {
    await api.completeOnboarding()
    if (user.value) {
      user.value = { ...user.value, onboardingCompleted: true }
      userStore.set(user.value)
    }
  }

  function impersonate(t, u) {
    token.value = t
    user.value = u
    tokenStore.setSession(t)
    userStore.setSession(u)
  }

  return { user, token, isAuthenticated, isOwner, onboardingCompleted, login, loginSuperAdmin, register, logout, clearSession, hydrate, impersonate, completeOnboarding }
})
