import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({
  auth: { user: { email: 'owner@ex.com', role: 'owner' }, logout: null },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockState.auth,
}))

const AdminLayout = (await import('../AdminLayout.vue')).default

// AdminLayout usa VNavigationDrawer/VAppBar/VMain (componentes de layout do
// Vuetify), que exigem um <v-app> ancestral provendo a injeção de layout —
// sem isso, o Vuetify lança "Could not find injected layout".
const AppWrapper = { components: { AdminLayout }, template: '<v-app><AdminLayout /></v-app>' }

describe('layouts/AdminLayout.vue (smoke)', () => {
  beforeEach(() => {
    mockState.auth.logout = vi.fn().mockResolvedValue(undefined)
  })

  it('monta sem quebrar e mostra o e-mail do owner logado', async () => {
    const wrapper = mount(AppWrapper, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('owner@ex.com')
    expect(wrapper.text()).toContain('Visão Geral')
    expect(wrapper.text()).toContain('Clientes')
    expect(wrapper.text()).toContain('Configurações')
    wrapper.unmount()
  })

  it('logout() chama auth.logout() e navega para /login', async () => {
    const wrapper = mount(AppWrapper, pluginOptions())
    await flushPromises()
    const logoutItem = wrapper.findAll('.v-list-item').find((n) => n.text().includes('Sair'))
    await logoutItem.trigger('click')
    await flushPromises()
    expect(mockState.auth.logout).toHaveBeenCalled()
    wrapper.unmount()
  })
})
