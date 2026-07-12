import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ getAIConfig: null, saveAIConfig: null }))

vi.mock('@/services/api', () => ({
  api: {
    getAIConfig: (...a) => mockState.getAIConfig(...a),
    saveAIConfig: (...a) => mockState.saveAIConfig(...a),
    testAIConfig: vi.fn(),
    uploadKnowledgeBase: vi.fn(),
    removeKnowledgeBase: vi.fn(),
  },
}))

const AIConfigView = (await import('../AIConfigView.vue')).default

describe('AIConfigView', () => {
  beforeEach(() => {
    mockState.getAIConfig = vi.fn().mockResolvedValue({ config: null })
    mockState.saveAIConfig = vi.fn().mockResolvedValue({ config: {} })
  })

  it('carrega a configuração existente e preenche o formulário', async () => {
    mockState.getAIConfig.mockResolvedValue({ config: { name: 'Lara', model: 'gpt-4o-mini', temperature: 0.9, knowledge_base_filename: 'catalogo.pdf' } })
    const wrapper = mount(AIConfigView, pluginOptions())
    await flushPromises()

    expect(wrapper.find('input[type="text"], input').exists()).toBe(true)
    expect(wrapper.text()).toContain('catalogo.pdf')
  })

  it('salva a configuração ao clicar em Salvar', async () => {
    const wrapper = mount(AIConfigView, pluginOptions())
    await flushPromises()

    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Salvar')
    await saveBtn.trigger('click')
    await flushPromises()

    expect(mockState.saveAIConfig).toHaveBeenCalled()
  })

  it('não quebra quando o carregamento da configuração falha', async () => {
    mockState.getAIConfig.mockRejectedValue(new Error('erro de rede'))
    const wrapper = mount(AIConfigView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Configuração da IA')
  })
})
