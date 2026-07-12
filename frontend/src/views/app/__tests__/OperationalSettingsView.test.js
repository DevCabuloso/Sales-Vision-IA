import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ get: null, put: null }))

vi.mock('@/services/api', () => ({
  http: { get: (...a) => mockState.get(...a), put: (...a) => mockState.put(...a) },
}))

const OperationalSettingsView = (await import('../OperationalSettingsView.vue')).default

describe('OperationalSettingsView', () => {
  beforeEach(() => {
    mockState.get = vi.fn().mockResolvedValue({ data: { settings: { auto_close_enabled: true, auto_close_minutes: 45 } } })
    mockState.put = vi.fn().mockResolvedValue({ data: {} })
  })

  it('carrega as configurações salvas do servidor', async () => {
    const wrapper = mount(OperationalSettingsView, pluginOptions())
    await flushPromises()
    expect(mockState.get).toHaveBeenCalledWith('/op-settings')
    expect(wrapper.text()).not.toContain('Não foi possível carregar')
  })

  it('mostra aviso e usa defaults quando o carregamento falha', async () => {
    mockState.get.mockRejectedValue(new Error('erro de rede'))
    const wrapper = mount(OperationalSettingsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Não foi possível carregar as configurações do servidor.')
  })

  it('salva as configurações ao clicar em Salvar Alterações', async () => {
    const wrapper = mount(OperationalSettingsView, pluginOptions())
    await flushPromises()

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Salvar Alterações'))
    await saveBtn.trigger('click')
    await flushPromises()

    expect(mockState.put).toHaveBeenCalledWith('/op-settings', expect.objectContaining({ auto_close_enabled: true }))
  })
})
