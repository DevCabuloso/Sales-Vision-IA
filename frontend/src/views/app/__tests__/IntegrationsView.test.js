import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({
  googleStatus: null, googleSetupStatus: null, httpGet: null, googleConnect: null,
  listWebhookEndpoints: null, createWebhookEndpoint: null, updateWebhookEndpoint: null,
  regenerateWebhookEndpointSecret: null, deleteWebhookEndpoint: null,
}))

vi.mock('@/services/api', () => ({
  api: {
    googleStatus: (...a) => mockState.googleStatus(...a),
    googleSetupStatus: (...a) => mockState.googleSetupStatus(...a),
    googleSaveSetup: vi.fn(),
    googleConnect: (...a) => mockState.googleConnect(...a),
    testMetaConnection: vi.fn(),
    listWebhookEndpoints: (...a) => mockState.listWebhookEndpoints(...a),
    createWebhookEndpoint: (...a) => mockState.createWebhookEndpoint(...a),
    updateWebhookEndpoint: (...a) => mockState.updateWebhookEndpoint(...a),
    regenerateWebhookEndpointSecret: (...a) => mockState.regenerateWebhookEndpointSecret(...a),
    deleteWebhookEndpoint: (...a) => mockState.deleteWebhookEndpoint(...a),
  },
  http: {
    get: (...a) => mockState.httpGet(...a),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { tenantId: 'tenant-1' } }),
}))

const IntegrationsView = (await import('../IntegrationsView.vue')).default

describe('IntegrationsView', () => {
  beforeEach(() => {
    mockState.googleStatus = vi.fn().mockResolvedValue({ connected: false })
    mockState.googleSetupStatus = vi.fn().mockResolvedValue({ configured: false })
    mockState.httpGet = vi.fn().mockResolvedValue({ data: { integrations: [] } })
    mockState.googleConnect = vi.fn()
    mockState.listWebhookEndpoints = vi.fn().mockResolvedValue([])
    mockState.createWebhookEndpoint = vi.fn()
    mockState.updateWebhookEndpoint = vi.fn()
    mockState.regenerateWebhookEndpointSecret = vi.fn()
    mockState.deleteWebhookEndpoint = vi.fn()
  })

  it('carrega o status de todas as integrações ao montar', async () => {
    const wrapper = mount(IntegrationsView, pluginOptions())
    await flushPromises()

    expect(mockState.googleStatus).toHaveBeenCalled()
    expect(mockState.googleSetupStatus).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Google Calendar')
  })

  it('mostra o chip "Conectado" quando o Google Calendar já está conectado', async () => {
    mockState.googleStatus.mockResolvedValue({ connected: true, email: 'ana@ex.com' })
    const wrapper = mount(IntegrationsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Conectado')
    expect(wrapper.text()).toContain('ana@ex.com')
  })

  it('mostra o status conectado para Meta/Evolution vindos de /integrations/status', async () => {
    mockState.httpGet.mockResolvedValue({ data: { integrations: [{ provider: 'meta_whatsapp', status: 'connected' }] } })
    const wrapper = mount(IntegrationsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('WhatsApp (Meta API)')
  })

  it('lista os webhooks de saída já cadastrados', async () => {
    mockState.listWebhookEndpoints.mockResolvedValue([{ id: 'e1', url: 'https://ex.com/hook', events: ['lead.created'], active: true }])
    const wrapper = mount(IntegrationsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('https://ex.com/hook')
    expect(wrapper.text()).toContain('lead.created')
  })

  it('cria um novo webhook de saída e mostra o segredo (só uma vez)', async () => {
    mockState.createWebhookEndpoint.mockResolvedValue({ id: 'e1', url: 'https://ex.com/hook', events: ['lead.created'], active: true, secret: 'segredo-123' })
    const wrapper = mount(IntegrationsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const urlInputs = [...document.body.querySelectorAll('input')].filter((i) => i.placeholder === 'https://seusistema.com/webhook')
    urlInputs[0].value = 'https://ex.com/hook'
    urlInputs[0].dispatchEvent(new Event('input'))
    await flushPromises()

    const checkbox = [...document.body.querySelectorAll('.v-checkbox')].find((c) => /lead\.created/.test(c.textContent))
    checkbox.querySelector('input[type="checkbox"]').click()
    await flushPromises()

    const addBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Adicionar endpoint')
    addBtn.click()
    await flushPromises()

    expect(mockState.createWebhookEndpoint).toHaveBeenCalledWith({ url: 'https://ex.com/hook', events: ['lead.created'] })
    expect(document.body.textContent).toContain('segredo-123')
    wrapper.unmount()
  })

  it('exclui um webhook de saída', async () => {
    mockState.listWebhookEndpoints.mockResolvedValue([{ id: 'e1', url: 'https://ex.com/hook', events: ['lead.created'], active: true }])
    mockState.deleteWebhookEndpoint.mockResolvedValue({ deleted: true })
    const wrapper = mount(IntegrationsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    document.body.querySelector('.mdi-delete-outline').closest('button').click()
    await flushPromises()

    expect(mockState.deleteWebhookEndpoint).toHaveBeenCalledWith('e1')
    expect(document.body.textContent).not.toContain('https://ex.com/hook')
    wrapper.unmount()
  })
})
