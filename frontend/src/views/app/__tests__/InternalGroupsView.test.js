import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listInternalGroups: null, createInternalGroup: null }))

vi.mock('@/services/api', () => ({
  api: {
    listInternalGroups: (...a) => mockState.listInternalGroups(...a),
    createInternalGroup: (...a) => mockState.createInternalGroup(...a),
    updateInternalGroup: vi.fn(),
    deleteInternalGroup: vi.fn(),
    listInternalMessages: vi.fn().mockResolvedValue({ messages: [] }),
    sendInternalMessage: vi.fn(),
    editInternalMessage: vi.fn(),
    deleteInternalMessage: vi.fn(),
    forwardInternalMessage: vi.fn(),
    sendInternalLocation: vi.fn(),
    listOperators: vi.fn().mockResolvedValue({ operators: [] }),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'user-1', role: 'admin' } }),
}))

const InternalGroupsView = (await import('../InternalGroupsView.vue')).default

describe('InternalGroupsView', () => {
  beforeEach(() => {
    mockState.listInternalGroups = vi.fn().mockResolvedValue({ groups: [] })
    mockState.createInternalGroup = vi.fn()
  })

  it('carrega e lista os grupos internos', async () => {
    mockState.listInternalGroups.mockResolvedValue({ groups: [{ id: 'g1', name: 'Financeiro', members: [] }] })
    const wrapper = mount(InternalGroupsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Financeiro')
  })

  it('não quebra quando não há nenhum grupo', async () => {
    const wrapper = mount(InternalGroupsView, pluginOptions())
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
  })
})
