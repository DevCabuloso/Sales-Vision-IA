import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ adminOverview: null, adminClients: null }))

vi.mock('@/services/api', () => ({
  api: {
    adminOverview: (...a) => mockState.adminOverview(...a),
    adminClients: (...a) => mockState.adminClients(...a),
  },
}))

vi.mock('@/composables/useRealtime', () => ({ useRealtime: vi.fn() }))

const OverviewView = (await import('../OverviewView.vue')).default

describe('OverviewView', () => {
  beforeEach(() => {
    mockState.adminOverview = vi.fn().mockResolvedValue({ total_clients: 0, active_clients: 0 })
    mockState.adminClients = vi.fn().mockResolvedValue([])
  })

  it('carrega e mostra os cartões de estatísticas', async () => {
    mockState.adminOverview.mockResolvedValue({ total_clients: 12, active_clients: 10, suspended_clients: 2, total_users: 34 })
    const wrapper = mount(OverviewView, pluginOptions())
    await flushPromises()

    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('Total Clientes')
  })

  it('lista os clientes recentes', async () => {
    mockState.adminClients.mockResolvedValue([{ id: 't1', name: 'Empresa Ana', slug: 'empresa-ana', status: 'active', plan: 'pro', leads_count: 5 }])
    const wrapper = mount(OverviewView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Empresa Ana')
  })

  it('mostra estado vazio quando não há clientes', async () => {
    const wrapper = mount(OverviewView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhum cliente cadastrado.')
  })
})
