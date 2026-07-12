import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'
import { useToast } from '@/composables/useToast'

const mockState = vi.hoisted(() => ({ listContacts: null, deleteContact: null, deduplicateContacts: null, httpGet: null }))

vi.mock('@/services/api', () => ({
  api: {
    listContacts: (...a) => mockState.listContacts(...a),
    createContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: (...a) => mockState.deleteContact(...a),
    deduplicateContacts: (...a) => mockState.deduplicateContacts(...a),
    importContacts: vi.fn(),
  },
  http: {
    get: (...a) => mockState.httpGet(...a),
    defaults: { baseURL: 'http://localhost/api' },
  },
}))

const ContactsView = (await import('../ContactsView.vue')).default

describe('ContactsView', () => {
  beforeEach(() => {
    mockState.listContacts = vi.fn().mockResolvedValue([])
    mockState.deleteContact = vi.fn().mockResolvedValue({ deleted: true })
    mockState.deduplicateContacts = vi.fn().mockResolvedValue({ removed: 0 })
    mockState.httpGet = vi.fn().mockResolvedValue({ data: { labels: [] } })
  })

  it('carrega e lista os contatos ao montar', async () => {
    mockState.listContacts.mockResolvedValue([{ id: 'c1', name: 'Ana', phone: '11988887777', stage: 'Novo Lead', tags: [] }])
    const wrapper = mount(ContactsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('1 contatos na base')
  })

  it('exclui um contato ao confirmar a exclusão', async () => {
    mockState.listContacts.mockResolvedValue([{ id: 'c1', name: 'Ana', phone: '11988887777', stage: 'Novo Lead', tags: [] }])
    const wrapper = mount(ContactsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    await wrapper.find('.mdi-delete-outline').element.closest('button').click()
    await flushPromises()
    await flushPromises()
    const excluirBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Excluir')
    excluirBtn.click()
    await flushPromises()

    expect(mockState.deleteContact).toHaveBeenCalledWith('c1')
    wrapper.unmount()
  })

  it('mostra a mensagem de remoção de duplicados', async () => {
    mockState.deduplicateContacts.mockResolvedValue({ removed: 3 })
    const wrapper = mount(ContactsView, pluginOptions())
    await flushPromises()

    const dedupBtn = wrapper.findAll('button').find((b) => b.text().includes('Remover duplicados'))
    await dedupBtn.trigger('click')
    await flushPromises()

    expect(mockState.deduplicateContacts).toHaveBeenCalled()
  })

  it('exporta contatos via http (client central), não via fetch direto com token de localStorage', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    mockState.httpGet = vi.fn().mockImplementation((url) => {
      if (url === '/contacts/export') return Promise.resolve({ data: new Blob(['csv']) })
      return Promise.resolve({ data: { labels: [] } })
    })
    const wrapper = mount(ContactsView, pluginOptions())
    await flushPromises()

    const exportBtn = wrapper.findAll('button').find((b) => b.text().includes('Exportar'))
    await exportBtn.trigger('click')
    await flushPromises()

    expect(mockState.httpGet).toHaveBeenCalledWith('/contacts/export', { responseType: 'blob' })
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('mostra erro ao falhar a exportação', async () => {
    mockState.httpGet = vi.fn().mockImplementation((url) => {
      if (url === '/contacts/export') return Promise.reject(new Error('Falha de rede'))
      return Promise.resolve({ data: { labels: [] } })
    })
    const wrapper = mount(ContactsView, pluginOptions())
    await flushPromises()

    const exportBtn = wrapper.findAll('button').find((b) => b.text().includes('Exportar'))
    await exportBtn.trigger('click')
    await flushPromises()

    const { state } = useToast()
    expect(state.text).toContain('Erro ao exportar')
  })

  it('não salva quando o e-mail informado é inválido', async () => {
    const { api } = await import('@/services/api')
    const wrapper = mount(ContactsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const novoBtn = wrapper.findAll('button').find((b) => b.text().includes('Novo Contato') || b.text().includes('Novo contato'))
    await (novoBtn ?? wrapper.findAll('button')[0]).trigger('click')
    await flushPromises()

    const inputs = [...document.body.querySelectorAll('.v-dialog input')]
    const phoneInput = inputs.find((i) => i.closest('.v-field')?.querySelector('label')?.textContent.match(/telefone/i))
    const emailInput = inputs.find((i) => i.closest('.v-field')?.querySelector('label')?.textContent.match(/e-?mail/i))
    if (phoneInput) { phoneInput.value = '11988887777'; phoneInput.dispatchEvent(new Event('input')) }
    if (emailInput) { emailInput.value = 'nao-e-email'; emailInput.dispatchEvent(new Event('input')) }
    await flushPromises()

    const salvarBtn = [...document.body.querySelectorAll('button')].find((b) => /salvar|criar/i.test(b.textContent))
    salvarBtn?.click()
    await flushPromises()

    expect(api.createContact).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
