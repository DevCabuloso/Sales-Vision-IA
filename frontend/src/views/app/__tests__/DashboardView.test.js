import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listLeads: null, listAppointments: null, dailyReport: null }))

vi.mock('@/services/api', () => ({
  api: {
    listLeads: (...a) => mockState.listLeads(...a),
    listAppointments: (...a) => mockState.listAppointments(...a),
    dailyReport: (...a) => mockState.dailyReport(...a),
  },
}))

vi.mock('@/composables/useRealtime', () => ({ useRealtime: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { tenantId: 'tenant-1', name: 'Ana' } }) }))

const DashboardView = (await import('../DashboardView.vue')).default

describe('DashboardView', () => {
  beforeEach(() => {
    mockState.listLeads = vi.fn().mockResolvedValue([])
    mockState.listAppointments = vi.fn().mockResolvedValue([])
    mockState.dailyReport = vi.fn().mockResolvedValue({ date: '2026-07-11', summary: { newLeads: 0, qualifiedNewLeads: 0, conversationsOpened: 0, conversationsResolved: 0, conversationsTransferred: 0, appointmentsScheduled: 0, messages: { total: 0, fromLeads: 0, fromAI: 0, fromAgents: 0 } }, byUser: [], funnel: [] })
  })

  it('carrega leads e agendamentos ao montar', async () => {
    mockState.listLeads.mockResolvedValue([{ id: 'l1', name: 'Ana', stage: 'Novo Lead', score: 80, created_at: new Date().toISOString() }])
    const wrapper = mount(DashboardView, pluginOptions())
    await flushPromises()

    expect(mockState.listLeads).toHaveBeenCalled()
    expect(mockState.listAppointments).toHaveBeenCalled()
    expect(wrapper.text().length).toBeGreaterThan(0)
  })

  it('não quebra quando o carregamento de leads falha', async () => {
    mockState.listLeads.mockRejectedValue(new Error('erro de rede'))
    const wrapper = mount(DashboardView, pluginOptions())
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
  })
})
