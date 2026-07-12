import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

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
