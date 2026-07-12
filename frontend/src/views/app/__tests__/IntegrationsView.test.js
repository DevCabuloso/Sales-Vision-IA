import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ googleStatus: null, googleSetupStatus: null, httpGet: null, googleConnect: null }))

vi.mock('@/services/api', () => ({
  api: {
    googleStatus: (...a) => mockState.googleStatus(...a),
    googleSetupStatus: (...a) => mockState.googleSetupStatus(...a),
    googleSaveSetup: vi.fn(),
    googleConnect: (...a) => mockState.googleConnect(...a),
    testMetaConnection: vi.fn(),
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
})
