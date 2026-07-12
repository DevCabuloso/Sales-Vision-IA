import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

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
})
