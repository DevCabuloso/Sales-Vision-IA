import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, tokenStore } from '@/services/api'

const USER_KEY = 'sdr_user'

const userStore = {
  get: () => { try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null } },
  set: (u) => u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY),
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(userStore.get())
  const token = ref(tokenStore.get())

  const isAuthenticated = computed(() => !!token.value)
  const isOwner = computed(() => user.value?.role === 'owner')

  async function login(email, password) {
    const { token: t, user: u } = await api.login(email, password)
    token.value = t
    user.value = u
    tokenStore.set(t)
    userStore.set(u)
    return u
  }

  async function loginSuperAdmin(email, password) {
    const u = await login(email, password)
    if (u.role !== 'owner') {
      logout()
      throw new Error('Acesso restrito ao superadmin.')
    }
    return u
  }

  async function register(name, companyName, email, password) {
    const { token: t, user: u } = await api.register(name, companyName, email, password)
    token.value = t
    user.value = u
    tokenStore.set(t)
    userStore.set(u)
    return u
  }

  function logout() {
    token.value = null
    user.value = null
    tokenStore.set(null)
    userStore.set(null)
  }

  function hydrate(u) {
    if (u) { user.value = u; userStore.set(u) }
  }

  function impersonate(t, u) {
    token.value = t
    user.value = u
    tokenStore.set(t)
    userStore.set(u)
  }

  return { user, token, isAuthenticated, isOwner, login, loginSuperAdmin, register, logout, hydrate, impersonate }
})
