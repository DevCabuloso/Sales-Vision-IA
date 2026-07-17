import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ post: null, getReportSchedule: null, updateReportSchedule: null, user: null }))

vi.mock('@/services/api', () => ({
  http: { post: (...a) => mockState.post(...a) },
  api: {
    getReportSchedule: (...a) => mockState.getReportSchedule(...a),
    updateReportSchedule: (...a) => mockState.updateReportSchedule(...a),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: mockState.user }),
}))

vi.mock('@/stores/locale.js', () => ({
  useLocaleStore: () => ({
    locale: 'pt-BR', setLocale: vi.fn(),
    t: (k) => ({ 'settings.changeBtn': 'Alterar Senha' }[k] || k),
  }),
}))

const TenantSettingsView = (await import('../TenantSettingsView.vue')).default

describe('TenantSettingsView', () => {
  beforeEach(() => {
    mockState.post = vi.fn().mockResolvedValue({ data: { changed: true } })
    mockState.user = { tenantName: 'Empresa Ana', tenantSlug: 'empresa-ana', email: 'ana@ex.com', role: 'admin' }
    mockState.getReportSchedule = vi.fn().mockResolvedValue({ active: false, recipients: [], day_of_week: 1, hour: 8, minute: 0 })
    mockState.updateReportSchedule = vi.fn()
    localStorage.clear()
  })

  it('mostra os dados da empresa vindos do usuário logado', () => {
    const wrapper = mount(TenantSettingsView, pluginOptions())
    expect(wrapper.text()).toContain('Empresa Ana')
    expect(wrapper.text()).toContain('empresa-ana')
  })

  it('altera a senha com sucesso', async () => {
    const wrapper = mount(TenantSettingsView, pluginOptions())
    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0].setValue('senhaatual')
    await inputs[1].setValue('novasenha123')
    await inputs[2].setValue('novasenha123')

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Alterar Senha'))
    await btn.trigger('click')
    await flushPromises()

    expect(mockState.post).toHaveBeenCalledWith('/auth/change-password', { currentPassword: 'senhaatual', newPassword: 'novasenha123' })
  })

  it('não mostra mais "Notificações por E-mail" (removido por ser decorativo, sem backend de e-mail)', () => {
    const wrapper = mount(TenantSettingsView, pluginOptions())
    expect(wrapper.text()).not.toContain('Notificações por E-mail')
    expect(wrapper.text()).not.toContain('Novo lead recebido')
    expect(wrapper.text()).not.toContain('Resumo diário')
  })

  it('salva o timeout de "mensagem sem resposta" (usado pelo sino de alertas) no localStorage', async () => {
    const wrapper = mount(TenantSettingsView, pluginOptions())
    const timeoutInput = wrapper.findAll('input[type="number"]').find((i) => i.element.closest('.notif-row--unanswered'))
    expect(timeoutInput).toBeTruthy()
    await timeoutInput.setValue(45)

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Salvar Notificações'))
    await btn.trigger('click')
    await flushPromises()

    expect(localStorage.getItem('sdr_unanswered_timeout')).toBe('45')
  })

  it('rejeita quando a confirmação de senha não confere', async () => {
    const wrapper = mount(TenantSettingsView, pluginOptions())
    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0].setValue('senhaatual')
    await inputs[1].setValue('novasenha123')
    await inputs[2].setValue('diferente')

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Alterar Senha'))
    await btn.trigger('click')

    expect(wrapper.text()).toContain('não confere')
  })

  it('mostra o painel de relatório semanal por e-mail pra admin/owner e carrega a configuração salva', async () => {
    mockState.getReportSchedule.mockResolvedValue({ active: true, recipients: ['dono@ex.com'], day_of_week: 5, hour: 9, minute: 30 })
    const wrapper = mount(TenantSettingsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Relatório Semanal por E-mail')
    expect(wrapper.text()).toContain('dono@ex.com')
  })

  it('não mostra o painel de relatório semanal pra um agente comum', async () => {
    mockState.user = { tenantName: 'Empresa Ana', tenantSlug: 'empresa-ana', email: 'ana@ex.com', role: 'agent' }
    const wrapper = mount(TenantSettingsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).not.toContain('Relatório Semanal por E-mail')
    expect(mockState.getReportSchedule).not.toHaveBeenCalled()
  })

  it('salva a configuração do relatório semanal', async () => {
    mockState.updateReportSchedule.mockResolvedValue({ active: true, recipients: ['dono@ex.com'], day_of_week: 1, hour: 8, minute: 0 })
    const wrapper = mount(TenantSettingsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const switchInput = [...document.body.querySelectorAll('.v-switch input[type="checkbox"]')].find((i) => i.closest('.v-card')?.textContent.includes('Relatório Semanal'))
    switchInput.click()
    await flushPromises()

    const saveBtn = [...document.body.querySelectorAll('button')].find((b) => b.closest('.v-card')?.textContent.includes('Relatório Semanal') && /^Salvar$/.test(b.textContent.trim()))
    saveBtn.click()
    await flushPromises()

    expect(mockState.updateReportSchedule).toHaveBeenCalled()
    expect(document.body.textContent).toContain('Configuração salva!')
    wrapper.unmount()
  })
})
