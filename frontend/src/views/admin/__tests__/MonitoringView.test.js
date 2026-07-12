import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ adminMonitoring: null }))

vi.mock('@/services/api', () => ({
  api: { adminMonitoring: (...a) => mockState.adminMonitoring(...a) },
}))

const MonitoringView = (await import('../MonitoringView.vue')).default

describe('MonitoringView', () => {
  beforeEach(() => {
    mockState.adminMonitoring = vi.fn().mockResolvedValue({ leads: [], messages: [], appointments: [], tenants: [] })
  })

  it('carrega e mostra os contadores de leads/mensagens/reuniões/clientes', async () => {
    mockState.adminMonitoring.mockResolvedValue({
      leads: [{ id: 'l1', name: 'Ana', phone: 'x', tenant: { name: 'Empresa' } }],
      messages: [{ id: 'm1' }],
      appointments: [],
      tenants: [{ id: 't1', name: 'Empresa' }],
    })
    const wrapper = mount(MonitoringView, pluginOptions())
    await flushPromises()

    expect(mockState.adminMonitoring).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Ana')
  })

  it('aplica os filtros de cliente/data ao clicar em Filtrar', async () => {
    const wrapper = mount(MonitoringView, pluginOptions())
    await flushPromises()
    mockState.adminMonitoring.mockClear()

    await wrapper.find('input[type="date"]').setValue('2026-01-01')
    const filtrarBtn = wrapper.findAll('button').find((b) => b.text() === 'Filtrar')
    await filtrarBtn.trigger('click')
    await flushPromises()

    expect(mockState.adminMonitoring).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-01-01' }))
  })

  it('não quebra quando a API de monitoramento falha', async () => {
    mockState.adminMonitoring.mockRejectedValue(new Error('erro de rede'))
    const wrapper = mount(MonitoringView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Monitoramento')
  })
})
