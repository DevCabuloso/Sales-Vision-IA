import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listTemplates: null, listTemplateCategories: null, createTemplate: null }))

vi.mock('@/services/api', () => ({
  api: {
    listTemplates: (...a) => mockState.listTemplates(...a),
    listTemplateCategories: (...a) => mockState.listTemplateCategories(...a),
    createTemplateCategory: vi.fn(),
    deleteTemplateCategory: vi.fn(),
    createTemplate: (...a) => mockState.createTemplate(...a),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    duplicateTemplate: vi.fn(),
    testTemplate: vi.fn(),
  },
}))

const TemplatesView = (await import('../TemplatesView.vue')).default

describe('TemplatesView', () => {
  beforeEach(() => {
    mockState.listTemplates = vi.fn().mockResolvedValue({ templates: [] })
    mockState.listTemplateCategories = vi.fn().mockResolvedValue([{ id: 'c1', name: 'Marketing' }, { id: 'c2', name: 'Utilidade' }])
    mockState.createTemplate = vi.fn()
  })

  it('carrega templates e categorias ao montar', async () => {
    mockState.listTemplates.mockResolvedValue({ templates: [{ id: 't1', name: 'Boas-vindas', category: 'Marketing', content: 'Olá!' }] })
    const wrapper = mount(TemplatesView, pluginOptions())
    await flushPromises()

    expect(wrapper.text()).toContain('Boas-vindas')
    expect(wrapper.text()).toContain('Marketing')
  })

  it('filtra os templates pela categoria selecionada', async () => {
    mockState.listTemplates.mockResolvedValue({
      templates: [
        { id: 't1', name: 'Boas-vindas', category: 'Marketing', content: 'x' },
        { id: 't2', name: 'Aviso', category: 'Utilidade', content: 'y' },
      ],
    })
    const wrapper = mount(TemplatesView, pluginOptions())
    await flushPromises()

    const catBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Utilidade')
    await catBtn.trigger('click')

    expect(wrapper.text()).toContain('Aviso')
    expect(wrapper.text()).not.toContain('Boas-vindas')
  })

  it('mostra o estado vazio quando não há templates', async () => {
    const wrapper = mount(TemplatesView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhum template encontrado.')
  })
})
