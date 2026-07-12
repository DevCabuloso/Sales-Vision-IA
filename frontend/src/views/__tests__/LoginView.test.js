import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ login: null, register: null, push: null }))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ login: (...a) => mockState.login(...a), register: (...a) => mockState.register(...a) }),
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => ({ push: (...a) => mockState.push(...a) }) }
})

const LoginView = (await import('../LoginView.vue')).default

describe('LoginView', () => {
  beforeEach(() => {
    mockState.login = vi.fn()
    mockState.register = vi.fn()
    mockState.push = vi.fn()
  })

  it('exige e-mail e senha preenchidos', async () => {
    const wrapper = mount(LoginView, pluginOptions())
    await wrapper.find('.submit-btn').trigger('click')
    expect(wrapper.text()).toContain('Preencha e-mail e senha.')
    expect(mockState.login).not.toHaveBeenCalled()
  })

  it('loga com sucesso e redireciona para /dashboard (usuário comum)', async () => {
    mockState.login.mockResolvedValue({ role: 'admin' })
    const wrapper = mount(LoginView, pluginOptions())
    await wrapper.find('input[type="email"]').setValue('ana@ex.com')
    await wrapper.find('input[type="password"]').setValue('senha123')
    await wrapper.find('.submit-btn').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(mockState.login).toHaveBeenCalledWith('ana@ex.com', 'senha123')
    expect(mockState.push).toHaveBeenCalledWith('/dashboard')
  })

  it('redireciona para /admin/overview quando o usuário é owner', async () => {
    mockState.login.mockResolvedValue({ role: 'owner' })
    const wrapper = mount(LoginView, pluginOptions())
    await wrapper.find('input[type="email"]').setValue('dono@ex.com')
    await wrapper.find('input[type="password"]').setValue('senha123')
    await wrapper.find('.submit-btn').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(mockState.push).toHaveBeenCalledWith('/admin/overview')
  })

  it('mostra o aviso de conta suspensa quando o erro menciona suspensão', async () => {
    mockState.login.mockRejectedValue(new Error('Conta suspensa. Contate o suporte.'))
    const wrapper = mount(LoginView, pluginOptions())
    await wrapper.find('input[type="email"]').setValue('ana@ex.com')
    await wrapper.find('input[type="password"]').setValue('senha123')
    await wrapper.find('.submit-btn').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.text()).toContain('Conta suspensa')
  })

  it('alterna para a aba de registro e exige nome, empresa, e-mail e senha', async () => {
    const wrapper = mount(LoginView, pluginOptions())
    await wrapper.find('.toggle-btn:nth-child(2)').trigger('click') // "Registrar"
    await wrapper.find('.submit-btn').trigger('click')
    expect(wrapper.text()).toContain('Preencha nome, empresa, e-mail e senha.')
    expect(mockState.register).not.toHaveBeenCalled()
  })

  it('registra com sucesso passando os 4 campos posicionais para a store e redireciona', async () => {
    mockState.register.mockResolvedValue({ role: 'admin' })
    const wrapper = mount(LoginView, pluginOptions())
    await wrapper.find('.toggle-btn:nth-child(2)').trigger('click') // "Registrar"
    const inputs = wrapper.findAll('.field-input')
    await inputs[0].setValue('Ana Silva')
    await inputs[1].setValue('ana@ex.com')
    await inputs[2].setValue('senha1234')
    await inputs[3].setValue('Empresa da Ana')
    await wrapper.find('.submit-btn').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(mockState.register).toHaveBeenCalledWith('Ana Silva', 'Empresa da Ana', 'ana@ex.com', 'senha1234')
    expect(mockState.push).toHaveBeenCalledWith('/dashboard')
  })
})
