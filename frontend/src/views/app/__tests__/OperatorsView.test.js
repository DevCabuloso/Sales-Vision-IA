import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'
import { api } from '@/services/api'

const mockState = vi.hoisted(() => ({ listOperators: null, operatorsDashboard: null, user: null }))

vi.mock('@/services/api', () => ({
  api: {
    listOperators: (...a) => mockState.listOperators(...a),
    operatorsDashboard: (...a) => mockState.operatorsDashboard(...a),
    createOperator: vi.fn(),
    updateOperator: vi.fn(),
    deleteOperator: vi.fn(),
    resetOperatorPassword: vi.fn(),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: mockState.user }),
}))

const OperatorsView = (await import('../OperatorsView.vue')).default

describe('OperatorsView', () => {
  beforeEach(() => {
    mockState.user = { role: 'admin' }
    mockState.listOperators = vi.fn().mockResolvedValue({ operators: [] })
    mockState.operatorsDashboard = vi.fn().mockResolvedValue({ metrics: [] })
  })

  it('carrega e lista os operadores ao montar', async () => {
    mockState.listOperators.mockResolvedValue({ operators: [{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'agent', active: true }] })
    const wrapper = mount(OperatorsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Ana')
  })

  it('esconde as ações de admin para quem não é admin/owner', async () => {
    mockState.user = { role: 'agent' }
    const wrapper = mount(OperatorsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).not.toContain('Novo Usuário')
  })

  it('exige senha ao criar um novo usuário', async () => {
    const wrapper = mount(OperatorsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const novoBtn = wrapper.findAll('button').find((b) => b.text().includes('Novo Usuário'))
    await novoBtn.trigger('click')
    await flushPromises()

    const inputs = [...document.body.querySelectorAll('.v-dialog input')]
    inputs[0].value = 'Novo Operador'; inputs[0].dispatchEvent(new Event('input'))
    inputs[1].value = 'novo@ex.com'; inputs[1].dispatchEvent(new Event('input'))
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Criar Usuário')
    criarBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Senha obrigatória.')
    expect(api.createOperator).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('carrega as métricas ao abrir a aba de dashboard', async () => {
    mockState.operatorsDashboard.mockResolvedValue({ metrics: [{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'agent', active: true, messages_sent: 10, leads_handled: 2, appointments: 1, takeovers: 0 }] })
    const wrapper = mount(OperatorsView, pluginOptions())
    await flushPromises()

    const dashTab = wrapper.findAll('.v-tab').find((t) => t.text().includes('Dashboard'))
    await dashTab.trigger('click')
    await flushPromises()

    expect(mockState.operatorsDashboard).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Msgs enviadas')
  })
})
