import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ get: null, patch: null }))

vi.mock('@/services/api', () => ({
  http: { get: (...a) => mockState.get(...a), patch: (...a) => mockState.patch(...a) },
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRoute: () => ({ params: { id: 'flow-1' } }) }
})

const FlowEditorView = (await import('../FlowEditorView.vue')).default

describe('FlowEditorView', () => {
  beforeEach(() => {
    mockState.get = vi.fn().mockImplementation((url) => {
      if (url === '/queues') return Promise.resolve({ data: { queues: [] } })
      return Promise.resolve({ data: { flow: { id: 'flow-1', name: 'Boas-vindas', status: 'active', nodes: [], edges: [], trigger_keywords: [], timeout_minutes: 30, fallback_text: '' } } })
    })
    mockState.patch = vi.fn().mockResolvedValue({ data: {} })
  })

  it('carrega o fluxo e mostra o nome no cabeçalho', async () => {
    const wrapper = mount(FlowEditorView, {
      ...pluginOptions({ stubs: { VueFlow: true, Handle: true } }),
    })
    await flushPromises()

    expect(mockState.get).toHaveBeenCalledWith('/flows/flow-1')
    expect(wrapper.text()).toContain('Boas-vindas')
  })

  it('salva o fluxo ao clicar em Salvar', async () => {
    const wrapper = mount(FlowEditorView, {
      ...pluginOptions({ stubs: { VueFlow: true, Handle: true } }),
    })
    await flushPromises()

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Salvar'))
    await saveBtn.trigger('click')
    await flushPromises()

    expect(mockState.patch).toHaveBeenCalledWith('/flows/flow-1', expect.objectContaining({ name: 'Boas-vindas' }))
  })
})
