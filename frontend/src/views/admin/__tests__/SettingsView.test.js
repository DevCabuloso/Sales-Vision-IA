import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ adminSettings: null, adminUpdateSettings: null }))

vi.mock('@/services/api', () => ({
  api: {
    adminSettings: (...a) => mockState.adminSettings(...a),
    adminUpdateSettings: (...a) => mockState.adminUpdateSettings(...a),
  },
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
      billing: { billing_reminder_days_before: 3, billing_reminder_time: '09:00' },
    })
    mockState.adminUpdateSettings = vi.fn().mockResolvedValue({ billing: { billing_reminder_days_before: 5, billing_reminder_time: '08:00' } })
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

  it('carrega e preenche o formulário com a config atual do aviso de vencimento', async () => {
    const wrapper = mount(SettingsView, pluginOptions())
    await flushPromises()
    const timeInput = wrapper.find('input[type="time"]')
    expect(timeInput.element.value).toBe('09:00')
  })

  it('rejeita horário vazio e não chama a API', async () => {
    const wrapper = mount(SettingsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const timeInput = document.body.querySelector('input[type="time"]')
    timeInput.value = ''
    timeInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const salvarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Salvar')
    salvarBtn.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Informe um horário.')
    expect(mockState.adminUpdateSettings).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('salva a nova config do aviso de vencimento', async () => {
    const wrapper = mount(SettingsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const numberInput = document.body.querySelector('input[type="number"]')
    numberInput.value = '5'
    numberInput.dispatchEvent(new Event('input'))
    const timeInput = document.body.querySelector('input[type="time"]')
    timeInput.value = '08:00'
    timeInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const salvarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Salvar')
    salvarBtn.click()
    await flushPromises()

    expect(mockState.adminUpdateSettings).toHaveBeenCalledWith({ billing_reminder_days_before: 5, billing_reminder_time: '08:00' })
    wrapper.unmount()
  })
})
