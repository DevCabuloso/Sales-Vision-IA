import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ adminSettings: null }))

vi.mock('@/services/api', () => ({
  api: { adminSettings: (...a) => mockState.adminSettings(...a) },
}))

const SettingsView = (await import('../SettingsView.vue')).default

describe('SettingsView', () => {
  beforeEach(() => {
    mockState.adminSettings = vi.fn().mockResolvedValue({
      env: 'production',
      openai: { model: 'gpt-4o-mini', configured: true },
      google: { configured: false, redirectUri: 'https://api.exemplo.com/cb' },
      meta: { graphVersion: 'v21.0', verifyTokenConfigured: true },
      jwt: { expiresIn: '7d' },
      supabase: { configured: true },
    })
  })

  it('carrega e mostra o status de cada integração', async () => {
    const wrapper = mount(SettingsView, pluginOptions())
    await flushPromises()

    expect(mockState.adminSettings).toHaveBeenCalled()
    expect(wrapper.text()).toContain('gpt-4o-mini')
    expect(wrapper.text()).toContain('Configurado')
    expect(wrapper.text()).toContain('Não configurado')
  })

  it('não quebra quando a API de configurações falha', async () => {
    mockState.adminSettings.mockRejectedValue(new Error('erro de rede'))
    const wrapper = mount(SettingsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Configurações da Plataforma')
  })
})
