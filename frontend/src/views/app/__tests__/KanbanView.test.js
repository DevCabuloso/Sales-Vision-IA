import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listLeads: null, updateLead: null, leadHistory: null }))

vi.mock('@/services/api', () => ({
  api: {
    listLeads: (...a) => mockState.listLeads(...a),
    updateLead: (...a) => mockState.updateLead(...a),
    leadHistory: (...a) => mockState.leadHistory(...a),
  },
}))

const KanbanView = (await import('../KanbanView.vue')).default

describe('KanbanView', () => {
  beforeEach(() => {
    mockState.listLeads = vi.fn().mockResolvedValue([])
    mockState.updateLead = vi.fn().mockResolvedValue({})
    mockState.leadHistory = vi.fn().mockResolvedValue({ history: [] })
  })

  it('carrega os leads e agrupa cada um na coluna do seu estágio', async () => {
    mockState.listLeads.mockResolvedValue([
      { id: 'l1', name: 'Ana', phone: '11988887777', stage: 'Novo Lead', score: 0, updated_at: new Date().toISOString() },
      { id: 'l2', name: 'Bia', phone: '11977776666', stage: 'Qualificado', score: 80, updated_at: new Date().toISOString() },
    ])
    const wrapper = mount(KanbanView, pluginOptions())
    await flushPromises()

    expect(wrapper.text()).toContain('2 leads')
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Bia')
  })

  it('filtra os cards pelo campo de busca', async () => {
    mockState.listLeads.mockResolvedValue([
      { id: 'l1', name: 'Ana Souza', phone: '11988887777', stage: 'Novo Lead', score: 0, updated_at: new Date().toISOString() },
      { id: 'l2', name: 'Bia Lima', phone: '11977776666', stage: 'Novo Lead', score: 0, updated_at: new Date().toISOString() },
    ])
    const wrapper = mount(KanbanView, pluginOptions())
    await flushPromises()

    await wrapper.find('input').setValue('ana')
    await flushPromises()

    expect(wrapper.text()).toContain('Ana Souza')
    expect(wrapper.text()).not.toContain('Bia Lima')
  })

  it('move o lead de estágio ao clicar na opção do modal de detalhe', async () => {
    mockState.listLeads.mockResolvedValue([
      { id: 'l1', name: 'Ana', phone: '11988887777', stage: 'Novo Lead', score: 0, updated_at: new Date().toISOString() },
    ])
    const wrapper = mount(KanbanView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    await wrapper.find('.kanban-card').trigger('click')
    await flushPromises()

    const moveBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Qualificado')
    moveBtn.click()
    await flushPromises()

    expect(mockState.updateLead).toHaveBeenCalledWith('l1', { stage: 'Qualificado' })
    wrapper.unmount()
  })
})
