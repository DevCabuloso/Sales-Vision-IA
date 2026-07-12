import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'
import { useToast } from '@/composables/useToast'

const mockState = vi.hoisted(() => ({ get: null, post: null, patch: null, delete: null, push: null }))

vi.mock('@/services/api', () => ({
  http: {
    get: (...a) => mockState.get(...a),
    post: (...a) => mockState.post(...a),
    patch: (...a) => mockState.patch(...a),
    delete: (...a) => mockState.delete(...a),
  },
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => ({ push: (...a) => mockState.push(...a) }) }
})

const FlowsView = (await import('../FlowsView.vue')).default

describe('FlowsView', () => {
  beforeEach(() => {
    mockState.get = vi.fn().mockImplementation((url) => {
      if (url === '/flows') return Promise.resolve({ data: { flows: [] } })
      if (url === '/channels') return Promise.resolve({ data: { channels: [] } })
      return Promise.resolve({ data: {} })
    })
    mockState.post = vi.fn()
    mockState.patch = vi.fn().mockResolvedValue({})
    mockState.delete = vi.fn().mockResolvedValue({})
    mockState.push = vi.fn()
  })

  it('mostra o estado vazio quando não há fluxos', async () => {
    const wrapper = mount(FlowsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhum fluxo criado ainda.')
  })

  it('lista os fluxos existentes', async () => {
    mockState.get = vi.fn().mockImplementation((url) => {
      if (url === '/flows') return Promise.resolve({ data: { flows: [{ id: 'f1', name: 'Boas-vindas', status: 'active', nodes: [1, 2], updated_at: new Date().toISOString() }] } })
      return Promise.resolve({ data: { channels: [] } })
    })
    const wrapper = mount(FlowsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Boas-vindas')
    expect(wrapper.text()).toContain('Ativo')
  })

  it('cria um novo fluxo e navega para o editor', async () => {
    mockState.post.mockResolvedValue({ data: { flow: { id: 'novo-flow' } } })
    const wrapper = mount(FlowsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    await wrapper.find('button').trigger('click') // "Novo Fluxo"
    await flushPromises()

    const nameInput = document.body.querySelector('.v-dialog input')
    nameInput.value = 'Fluxo de teste'
    nameInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes('Criar e Editar'))
    criarBtn.click()
    await flushPromises()

    expect(mockState.post).toHaveBeenCalledWith('/flows', expect.objectContaining({ name: 'Fluxo de teste' }))
    expect(mockState.push).toHaveBeenCalledWith('/flows/novo-flow')
    wrapper.unmount()
  })

  it('mostra um toast de erro quando o nome do fluxo é inválido, sem chamar a API', async () => {
    const wrapper = mount(FlowsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    await wrapper.find('button').trigger('click') // "Novo Fluxo"
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes('Criar e Editar'))
    criarBtn.click()
    await flushPromises()

    expect(mockState.post).not.toHaveBeenCalled()
    const { state } = useToast()
    expect(state.show).toBe(true)
    expect(state.color).toBe('error')
    wrapper.unmount()
  })

  it('mostra um toast de erro quando a criação do fluxo falha na API', async () => {
    mockState.post.mockRejectedValue(new Error('Falha ao criar fluxo'))
    const wrapper = mount(FlowsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    await wrapper.find('button').trigger('click') // "Novo Fluxo"
    await flushPromises()

    const nameInput = document.body.querySelector('.v-dialog input')
    nameInput.value = 'Fluxo de teste'
    nameInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes('Criar e Editar'))
    criarBtn.click()
    await flushPromises()

    const { state } = useToast()
    expect(state.text).toBe('Falha ao criar fluxo')
    expect(state.color).toBe('error')
    expect(mockState.push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('alterna o status do fluxo entre ativo/pausado', async () => {
    mockState.get = vi.fn().mockImplementation((url) => {
      if (url === '/flows') return Promise.resolve({ data: { flows: [{ id: 'f1', name: 'Boas-vindas', status: 'active', nodes: [], updated_at: new Date().toISOString() }] } })
      return Promise.resolve({ data: { channels: [] } })
    })
    const wrapper = mount(FlowsView, pluginOptions())
    await flushPromises()

    const pauseBtn = wrapper.findAll('button').find((b) => b.text().includes('Pausar'))
    await pauseBtn.trigger('click')
    await flushPromises()

    expect(mockState.patch).toHaveBeenCalledWith('/flows/f1', { status: 'inactive' })
  })
})
