import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listLeads: null, createLead: null, deleteLead: null, analyzeLead: null }), )

vi.mock('@/services/api', () => ({
  api: {
    listLeads: (...a) => mockState.listLeads(...a),
    createLead: (...a) => mockState.createLead(...a),
    deleteLead: (...a) => mockState.deleteLead(...a),
    analyzeLead: (...a) => mockState.analyzeLead(...a),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { tenantId: 'tenant-1' } }),
}))

vi.mock('@/composables/useRealtime', () => ({
  useRealtime: vi.fn(),
}))

const LeadsView = (await import('../LeadsView.vue')).default

describe('LeadsView', () => {
  beforeEach(() => {
    mockState.listLeads = vi.fn().mockResolvedValue([])
    mockState.createLead = vi.fn()
    mockState.deleteLead = vi.fn().mockResolvedValue({ deleted: true })
    mockState.analyzeLead = vi.fn()
  })

  it('carrega e lista os leads ao montar', async () => {
    mockState.listLeads.mockResolvedValue([{ id: 'l1', name: 'Ana', phone: '11988887777', stage: 'Novo Lead', score: 80 }])
    const wrapper = mount(LeadsView, pluginOptions())
    await flushPromises()

    expect(mockState.listLeads).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('1 leads na sua base.')
  })

  it('filtra os leads pelo campo de busca', async () => {
    mockState.listLeads.mockResolvedValue([
      { id: 'l1', name: 'Ana Souza', phone: '11988887777', stage: 'Novo Lead', score: 80 },
      { id: 'l2', name: 'Bia Lima', phone: '11977776666', stage: 'Novo Lead', score: 50 },
    ])
    const wrapper = mount(LeadsView, pluginOptions())
    await flushPromises()

    await wrapper.find('input').setValue('ana')
    await flushPromises()

    expect(wrapper.text()).toContain('Ana Souza')
    expect(wrapper.text()).not.toContain('Bia Lima')
  })

  it('não quebra quando listLeads falha (fallback para lista vazia)', async () => {
    mockState.listLeads.mockRejectedValue(new Error('erro de rede'))
    const wrapper = mount(LeadsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhum lead encontrado.')
  })
})
