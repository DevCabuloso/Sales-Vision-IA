import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ get: null }))

vi.mock('@/services/api', () => ({
  api: {
    listChatOperators: vi.fn().mockResolvedValue({ operators: [] }),
  },
  http: {
    get: (...a) => mockState.get(...a),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@/composables/useRealtime', () => ({
  useRealtime: vi.fn(),
  useMessageRealtime: () => ({ onMessage: vi.fn() }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'user-1', tenantId: 'tenant-1', role: 'admin', name: 'Ana' } }),
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRoute: () => ({ params: {}, name: 'chat' }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }
})

const ChatView = (await import('../ChatView.vue')).default

describe('ChatView (smoke)', () => {
  beforeEach(() => {
    mockState.get = vi.fn().mockImplementation((url) => {
      if (url === '/chat') return Promise.resolve({ data: { leads: [] } })
      if (url === '/labels') return Promise.resolve({ data: { labels: [] } })
      if (url === '/templates') return Promise.resolve({ data: { templates: [] } })
      return Promise.resolve({ data: {} })
    })
  })

  it('monta sem quebrar e carrega a lista de conversas', async () => {
    const wrapper = mount(ChatView, pluginOptions())
    await flushPromises()

    expect(mockState.get).toHaveBeenCalledWith('/chat')
    expect(wrapper.text()).toContain('Atendimentos')
    wrapper.unmount()
  })

  it('mostra a lista de conversas carregadas', async () => {
    mockState.get.mockImplementation((url) => {
      if (url === '/chat') return Promise.resolve({ data: { leads: [{ id: 'lead-1', name: 'Ana', phone: '5511988887777', conversation_status: 'pending', updated_at: new Date().toISOString() }] } })
      return Promise.resolve({ data: {} })
    })
    const wrapper = mount(ChatView, pluginOptions())
    await flushPromises()

    expect(wrapper.text()).toContain('Ana')
    wrapper.unmount()
  })

  it('painel de contato e barra de busca expandem/recolhem no lugar (classe "open" no wrapper, sem v-if)', async () => {
    mockState.get.mockImplementation((url) => {
      if (url === '/chat') return Promise.resolve({ data: { leads: [{ id: 'lead-1', name: 'Ana', phone: '5511988887777', conversation_status: 'open', updated_at: new Date().toISOString() }] } })
      return Promise.resolve({ data: {} })
    })
    const wrapper = mount(ChatView, pluginOptions())
    await flushPromises()
    await wrapper.find('.conv-item').trigger('click')
    await flushPromises()

    // os wrappers existem sempre no DOM (não são v-if) — a expansão é só via classe/CSS
    expect(wrapper.find('.contact-panel-wrap').exists()).toBe(true)
    expect(wrapper.find('.msg-search-wrap').exists()).toBe(true)
    expect(wrapper.find('.contact-panel-wrap').classes()).not.toContain('open')
    expect(wrapper.find('.msg-search-wrap').classes()).not.toContain('open')

    const buttons = wrapper.findAll('.qa-btn')
    await buttons.find((b) => b.text().includes('Contato')).trigger('click')
    await buttons.find((b) => b.text().includes('Buscar')).trigger('click')
    await flushPromises()

    expect(wrapper.find('.contact-panel-wrap').classes()).toContain('open')
    expect(wrapper.find('.msg-search-wrap').classes()).toContain('open')
    wrapper.unmount()
  })
})
