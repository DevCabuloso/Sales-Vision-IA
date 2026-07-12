import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listCustomApis: null, createCustomApi: null, deleteCustomApi: null }))

vi.mock('@/services/api', () => ({
  api: {
    listCustomApis: (...a) => mockState.listCustomApis(...a),
    createCustomApi: (...a) => mockState.createCustomApi(...a),
    updateCustomApi: vi.fn(),
    deleteCustomApi: (...a) => mockState.deleteCustomApi(...a),
    testCustomApi: vi.fn(),
  },
}))

const CustomApisView = (await import('../CustomApisView.vue')).default

describe('CustomApisView', () => {
  beforeEach(() => {
    mockState.listCustomApis = vi.fn().mockResolvedValue({ apis: [] })
    mockState.createCustomApi = vi.fn()
    mockState.deleteCustomApi = vi.fn().mockResolvedValue({ deleted: true })
  })

  it('carrega e lista as APIs cadastradas ao montar', async () => {
    mockState.listCustomApis.mockResolvedValue({ apis: [{ id: 'api-1', name: 'Minha OpenAI', provider: 'openai', active: true }] })
    const wrapper = mount(CustomApisView, pluginOptions())
    await flushPromises()

    expect(mockState.listCustomApis).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Minha OpenAI')
  })

  it('mostra estado vazio quando não há nenhuma API cadastrada', async () => {
    const wrapper = mount(CustomApisView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhuma API cadastrada')
  })

  it('remove a API da lista ao excluir', async () => {
    mockState.listCustomApis.mockResolvedValue({ apis: [{ id: 'api-1', name: 'Minha OpenAI', provider: 'openai', active: true }] })
    const wrapper = mount(CustomApisView, pluginOptions())
    await flushPromises()

    await wrapper.find('button[title="Testar conexão"]').element.parentElement.querySelectorAll('button')[2].click()
    await flushPromises()
    expect(mockState.deleteCustomApi).toHaveBeenCalledWith('api-1')
  })

  it('rejeita URL base inválida ao criar', async () => {
    const wrapper = mount(CustomApisView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const novaBtn = wrapper.findAll('button').find((b) => b.text().includes('Nova API'))
    await novaBtn.trigger('click')
    await flushPromises()

    const inputs = [...document.body.querySelectorAll('.v-dialog input')]
    inputs[0].value = 'Minha API'; inputs[0].dispatchEvent(new Event('input'))
    const baseUrlInput = inputs.find((i) => i.closest('.v-field')?.querySelector('label')?.textContent.includes('Base URL'))
    baseUrlInput.value = 'nao-e-url'; baseUrlInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const salvarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Salvar')
    salvarBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('URL base inválida.')
    expect(mockState.createCustomApi).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
