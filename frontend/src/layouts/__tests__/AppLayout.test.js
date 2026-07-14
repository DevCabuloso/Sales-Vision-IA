import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({
  auth: { user: { name: 'Ana', email: 'ana@ex.com', role: 'admin', tenantId: 't1', tenantName: 'ACME', features: null }, isOwner: false, logout: null },
  getAIStatus: null,
  toggleAI: null,
  startPolling: null,
  stopPolling: null,
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockState.auth,
}))

vi.mock('@/stores/locale.js', () => ({
  useLocaleStore: () => ({ t: (k) => k.split('.').pop() }),
}))

vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => ({
    startPolling: (...a) => mockState.startPolling(...a),
    stopPolling: (...a) => mockState.stopPolling(...a),
  }),
}))

vi.mock('@/services/api', () => ({
  api: {
    getAIStatus: (...a) => mockState.getAIStatus(...a),
    toggleAI: (...a) => mockState.toggleAI(...a),
  },
}))

vi.mock('@/services/supabase', () => ({ supabase: null }))

const AppLayout = (await import('../AppLayout.vue')).default

function mountLayout(overrides = {}) {
  return mount(AppLayout, pluginOptions({
    stubs: { ThemeSwitcher: true, NotificationBell: true },
    ...overrides,
  }))
}

describe('layouts/AppLayout.vue (smoke)', () => {
  beforeEach(() => {
    mockState.auth.user = { name: 'Ana', email: 'ana@ex.com', role: 'admin', tenantId: 't1', tenantName: 'ACME', features: null }
    mockState.auth.isOwner = false
    mockState.auth.logout = vi.fn().mockResolvedValue(undefined)
    mockState.getAIStatus = vi.fn().mockResolvedValue({ ai_enabled: true })
    mockState.toggleAI = vi.fn().mockResolvedValue({ ai_enabled: false })
    mockState.startPolling = vi.fn()
    mockState.stopPolling = vi.fn()
  })

  it('monta sem quebrar e carrega o status da IA', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    expect(mockState.getAIStatus).toHaveBeenCalled()
    expect(mockState.startPolling).toHaveBeenCalled()
    expect(wrapper.text()).toContain('ACME')
    wrapper.unmount()
  })

  it('renderiza os itens de navegação principal e some com os que a feature desativa', async () => {
    mockState.auth.user.features = { kanban: false, contacts: false, agenda: true }
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.text()).not.toContain('kanban')
    expect(wrapper.text()).toContain('dashboard')
    wrapper.unmount()
  })

  it('esconde itens de navegação sem permissão quando o operador está restrito', async () => {
    mockState.auth.user.role = 'agent'
    mockState.auth.user.is_restricted = true
    mockState.auth.user.permissions = { chat: true, kanban: false, contatos: false, leads: false, agenda: false, templates: false, broadcast: false }
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.text()).toContain('chat')
    expect(wrapper.text()).not.toContain('kanban')
    expect(wrapper.text()).not.toContain('contatos')
    expect(wrapper.text()).not.toContain('leads')
    expect(wrapper.text()).not.toContain('agenda')
    expect(wrapper.text()).not.toContain('templates')
    expect(wrapper.text()).not.toContain('broadcast')
    wrapper.unmount()
  })

  it('não restringe a navegação quando is_restricted é false, mesmo com permissions restritivas', async () => {
    mockState.auth.user.role = 'agent'
    mockState.auth.user.is_restricted = false
    mockState.auth.user.permissions = { chat: false, kanban: false }
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.text()).toContain('kanban')
    wrapper.unmount()
  })

  it('não restringe a navegação de um admin mesmo se is_restricted vier true por engano', async () => {
    mockState.auth.user.role = 'admin'
    mockState.auth.user.is_restricted = true
    mockState.auth.user.permissions = { chat: false, kanban: false }
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.text()).toContain('kanban')
    wrapper.unmount()
  })

  it('mostra a seção SISTEMA (navSystem) para role admin/owner', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.text()).toContain('atendimento')
    wrapper.unmount()
  })

  it('esconde a seção SISTEMA para role que não é admin nem owner', async () => {
    mockState.auth.user.role = 'operator'
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.text()).not.toContain('atendimento')
    wrapper.unmount()
  })

  it('toggleAI() alterna o estado da IA via api.toggleAI', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    await wrapper.find('.ai-toggle').trigger('click')
    await flushPromises()
    expect(mockState.toggleAI).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('logout() chama auth.logout() e navega para /login', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    await wrapper.find('.logout-btn').trigger('click')
    await flushPromises()
    expect(mockState.auth.logout).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('desmontar para de fazer polling de notificações', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    wrapper.unmount()
    expect(mockState.stopPolling).toHaveBeenCalled()
  })
})
