import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listCampaigns: null, createCampaign: null, sendCampaign: null }))

vi.mock('@/services/api', () => ({
  api: {
    listCampaigns: (...a) => mockState.listCampaigns(...a),
    createCampaign: (...a) => mockState.createCampaign(...a),
    updateCampaign: vi.fn(),
    deleteCampaign: vi.fn(),
    sendCampaign: (...a) => mockState.sendCampaign(...a),
    cancelCampaign: vi.fn(),
    listBroadcastContacts: vi.fn().mockResolvedValue({ contacts: [] }),
    importCampaignContacts: vi.fn(),
    importLeadsToCampaign: vi.fn(),
    removeBroadcastContact: vi.fn(),
    clearBroadcastContacts: vi.fn(),
    listTemplates: vi.fn().mockResolvedValue({ templates: [] }),
    listQueues: vi.fn().mockResolvedValue({ queues: [] }),
    listContactTags: vi.fn().mockResolvedValue([]),
    listLeads: vi.fn().mockResolvedValue([]),
  },
}))

const BroadcastView = (await import('../BroadcastView.vue')).default

describe('BroadcastView', () => {
  beforeEach(() => {
    mockState.listCampaigns = vi.fn().mockResolvedValue({ campaigns: [] })
    mockState.createCampaign = vi.fn()
    mockState.sendCampaign = vi.fn().mockResolvedValue({})
  })

  it('mostra o estado vazio quando não há campanhas', async () => {
    const wrapper = mount(BroadcastView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhuma campanha. Crie a primeira!')
  })

  it('lista as campanhas existentes com suas métricas', async () => {
    mockState.listCampaigns.mockResolvedValue({ campaigns: [{ id: 'c1', name: 'Promoção', content: 'Oi!', status: 'sending', sent_count: 10, delivered_count: 8, read_count: 5, scheduled_at: null }] })
    const wrapper = mount(BroadcastView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Promoção')
    expect(wrapper.text()).toContain('10 env.')
  })

  it('exige nome e mensagem ao criar uma campanha', async () => {
    const wrapper = mount(BroadcastView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    await wrapper.find('button').trigger('click') // "Nova Campanha"
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Criar')
    criarBtn.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Nome e mensagem são obrigatórios.')
    expect(mockState.createCampaign).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('abre o gerenciador de uma campanha ao clicar em "Gerenciar"', async () => {
    mockState.listCampaigns.mockResolvedValue({ campaigns: [{ id: 'c1', name: 'Promoção', content: 'Oi!', status: 'draft', sent_count: 0, delivered_count: 0, read_count: 0, min_interval_seconds: 2, max_interval_seconds: 5 }] })
    const wrapper = mount(BroadcastView, pluginOptions())
    await flushPromises()

    await wrapper.find('button[title="Gerenciar"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Iniciar Envio')
  })
})
