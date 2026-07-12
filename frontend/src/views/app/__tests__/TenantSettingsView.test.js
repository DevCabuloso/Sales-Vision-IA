import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ post: null }))

vi.mock('@/services/api', () => ({
  http: { post: (...a) => mockState.post(...a) },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { tenantName: 'Empresa Ana', tenantSlug: 'empresa-ana', email: 'ana@ex.com', role: 'admin' } }),
}))

vi.mock('@/stores/locale.js', () => ({
  useLocaleStore: () => ({
    locale: 'pt-BR', setLocale: vi.fn(),
    t: (k) => ({ 'settings.changeBtn': 'Alterar Senha' }[k] || k),
  }),
}))

const TenantSettingsView = (await import('../TenantSettingsView.vue')).default

describe('TenantSettingsView', () => {
  beforeEach(() => {
    mockState.post = vi.fn().mockResolvedValue({ data: { changed: true } })
    localStorage.clear()
  })

  it('mostra os dados da empresa vindos do usuário logado', () => {
    const wrapper = mount(TenantSettingsView, pluginOptions())
    expect(wrapper.text()).toContain('Empresa Ana')
    expect(wrapper.text()).toContain('empresa-ana')
  })

  it('altera a senha com sucesso', async () => {
    const wrapper = mount(TenantSettingsView, pluginOptions())
    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0].setValue('senhaatual')
    await inputs[1].setValue('novasenha123')
    await inputs[2].setValue('novasenha123')

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Alterar Senha'))
    await btn.trigger('click')
    await flushPromises()

    expect(mockState.post).toHaveBeenCalledWith('/auth/change-password', { currentPassword: 'senhaatual', newPassword: 'novasenha123' })
  })

  it('rejeita quando a confirmação de senha não confere', async () => {
    const wrapper = mount(TenantSettingsView, pluginOptions())
    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0].setValue('senhaatual')
    await inputs[1].setValue('novasenha123')
    await inputs[2].setValue('diferente')

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Alterar Senha'))
    await btn.trigger('click')

    expect(wrapper.text()).toContain('não confere')
  })
})
