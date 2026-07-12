import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ get: null, post: null, patch: null, delete: null, put: null }))

vi.mock('@/services/api', () => ({
  http: {
    get: (...a) => mockState.get(...a),
    post: (...a) => mockState.post(...a),
    patch: (...a) => mockState.patch(...a),
    delete: (...a) => mockState.delete(...a),
    put: (...a) => mockState.put(...a),
  },
}))

const AttendanceConfigView = (await import('../AttendanceConfigView.vue')).default

function routeFor(url) {
  if (url === '/labels') return Promise.resolve({ data: { labels: [{ id: 'l1', name: 'VIP', color: '#6366F1' }] } })
  if (url === '/operators') return Promise.resolve({ data: { operators: [] } })
  if (url === '/queues') return Promise.resolve({ data: { queues: [] } })
  if (url === '/business-hours') return Promise.resolve({ data: { config: null } })
  return Promise.resolve({ data: {} })
}

describe('AttendanceConfigView', () => {
  beforeEach(() => {
    mockState.get = vi.fn().mockImplementation(routeFor)
    mockState.post = vi.fn().mockResolvedValue({ data: { label: { id: 'l2', name: 'Novo', color: '#6366F1' } } })
    mockState.patch = vi.fn().mockResolvedValue({ data: {} })
    mockState.delete = vi.fn().mockResolvedValue({ data: {} })
    mockState.put = vi.fn().mockResolvedValue({ data: {} })
  })

  it('carrega as etiquetas na aba padrão ao montar', async () => {
    const wrapper = mount(AttendanceConfigView, pluginOptions())
    await flushPromises()
    expect(mockState.get).toHaveBeenCalledWith('/labels')
    expect(wrapper.text()).toContain('VIP')
  })

  it('carrega filas e operadores ao trocar para a aba de filas', async () => {
    const wrapper = mount(AttendanceConfigView, pluginOptions())
    await flushPromises()

    const tab = wrapper.findAll('.v-tab').find((t) => t.text().includes('Filas'))
    await tab.trigger('click')
    await flushPromises()

    expect(mockState.get).toHaveBeenCalledWith('/queues')
  })

  it('carrega o horário de atendimento ao trocar para a aba de horário', async () => {
    const wrapper = mount(AttendanceConfigView, pluginOptions())
    await flushPromises()

    const tab = wrapper.findAll('.v-tab').find((t) => t.text().includes('Horário'))
    await tab.trigger('click')
    await flushPromises()

    expect(mockState.get).toHaveBeenCalledWith('/business-hours')
  })
})
