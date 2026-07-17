import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listLeads: null, createLead: null, deleteLead: null, analyzeLead: null, eraseLeadData: null, httpGet: null }), )

vi.mock('@/services/api', () => ({
  api: {
    listLeads: (...a) => mockState.listLeads(...a),
    createLead: (...a) => mockState.createLead(...a),
    deleteLead: (...a) => mockState.deleteLead(...a),
    analyzeLead: (...a) => mockState.analyzeLead(...a),
    eraseLeadData: (...a) => mockState.eraseLeadData(...a),
  },
  http: {
    get: (...a) => mockState.httpGet(...a),
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
    mockState.eraseLeadData = vi.fn().mockResolvedValue({ erased: true, erasedAt: '2026-07-17T10:00:00Z' })
    mockState.httpGet = vi.fn().mockResolvedValue({ data: new Blob(['{}']) })
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

  it('exporta os dados pessoais de um lead via /privacy/export/:id (LGPD)', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    mockState.listLeads.mockResolvedValue([{ id: 'l1', name: 'Ana', phone: '11988887777', stage: 'Novo Lead', score: 80 }])
    const wrapper = mount(LeadsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    document.body.querySelector('.mdi-dots-vertical').closest('button').click()
    await flushPromises()
    const exportItem = [...document.body.querySelectorAll('.v-list-item')].find((i) => /Exportar dados/.test(i.textContent))
    exportItem.click()
    await flushPromises()

    expect(mockState.httpGet).toHaveBeenCalledWith('/privacy/export/l1', { responseType: 'blob' })
    wrapper.unmount()
  })

  it('exclui os dados pessoais de um lead (LGPD) ao confirmar', async () => {
    mockState.listLeads.mockResolvedValue([{ id: 'l1', name: 'Ana', phone: '11988887777', stage: 'Novo Lead', score: 80 }])
    const wrapper = mount(LeadsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    document.body.querySelector('.mdi-dots-vertical').closest('button').click()
    await flushPromises()
    const eraseItem = [...document.body.querySelectorAll('.v-list-item')].find((i) => /Excluir dados/.test(i.textContent))
    eraseItem.click()
    await flushPromises()

    const confirmBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Excluir dados')
    confirmBtn.click()
    await flushPromises()

    expect(mockState.eraseLeadData).toHaveBeenCalledWith('l1')
    wrapper.unmount()
  })
})
