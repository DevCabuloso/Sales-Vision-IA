import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ trialSignup: null }))

vi.mock('@/services/api', () => ({
  api: { trialSignup: (...a) => mockState.trialSignup(...a) },
}))

const TrialLandingView = (await import('../TrialLandingView.vue')).default

function fillField(label, value) {
  const field = [...document.body.querySelectorAll('.tl-field')].find((f) => f.querySelector('.tl-field-label').textContent === label)
  const input = field.querySelector('input')
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('TrialLandingView', () => {
  beforeEach(() => {
    mockState.trialSignup = vi.fn()
  })

  it('abre o formulário de cadastro ao clicar no CTA', async () => {
    const wrapper = mount(TrialLandingView, { attachTo: document.body, ...pluginOptions() })
    await wrapper.find('.tl-cta').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Vamos começar')
    wrapper.unmount()
  })

  it('exige nome, empresa, e-mail e senha', async () => {
    const wrapper = mount(TrialLandingView, { attachTo: document.body, ...pluginOptions() })
    await wrapper.find('.tl-cta').trigger('click')
    await flushPromises()

    document.body.querySelector('.tl-submit-btn').click()
    await flushPromises()

    expect(document.body.textContent).toContain('Preencha nome, empresa, e-mail e senha.')
    expect(mockState.trialSignup).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('exige senha com pelo menos 8 caracteres', async () => {
    const wrapper = mount(TrialLandingView, { attachTo: document.body, ...pluginOptions() })
    await wrapper.find('.tl-cta').trigger('click')
    await flushPromises()

    fillField('Seu nome', 'Ana')
    fillField('Empresa', 'Empresa Ana')
    fillField('E-mail', 'ana@ex.com')
    fillField('Crie uma senha', '123')
    await flushPromises()

    document.body.querySelector('.tl-submit-btn').click()
    await flushPromises()

    expect(document.body.textContent).toContain('pelo menos 8 caracteres')
    wrapper.unmount()
  })

  it('envia o cadastro com os dados preenchidos', async () => {
    mockState.trialSignup.mockResolvedValue({ checkoutUrl: 'https://checkout.infinitepay.io/x' })
    const wrapper = mount(TrialLandingView, { attachTo: document.body, ...pluginOptions() })
    await wrapper.find('.tl-cta').trigger('click')
    await flushPromises()

    fillField('Seu nome', 'Ana')
    fillField('Empresa', 'Empresa Ana')
    fillField('E-mail', 'ana@ex.com')
    fillField('Crie uma senha', 'senha1234')
    await flushPromises()

    document.body.querySelector('.tl-submit-btn').click()
    await flushPromises()

    expect(mockState.trialSignup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana', companyName: 'Empresa Ana', email: 'ana@ex.com', password: 'senha1234' }))
    wrapper.unmount()
  })

  it('mostra o tour de produto começando pela aba Atendimento', () => {
    const wrapper = mount(TrialLandingView, { attachTo: document.body, ...pluginOptions() })
    expect(wrapper.find('.tour-tab.active').text()).toContain('Atendimento')
    expect(wrapper.find('.tour-chat').exists()).toBe(true)
    wrapper.unmount()
  })

  it('troca para a aba Kanban ao clicar', async () => {
    const wrapper = mount(TrialLandingView, { attachTo: document.body, ...pluginOptions() })
    const tabs = wrapper.findAll('.tour-tab')
    await tabs.find((t) => t.text().includes('Kanban')).trigger('click')
    expect(wrapper.find('.tour-kanban').exists()).toBe(true)
    expect(wrapper.find('.tour-chat').exists()).toBe(false)
    wrapper.unmount()
  })

  it('troca para a aba Leads ao clicar', async () => {
    const wrapper = mount(TrialLandingView, { attachTo: document.body, ...pluginOptions() })
    const tabs = wrapper.findAll('.tour-tab')
    await tabs.find((t) => t.text().includes('Leads')).trigger('click')
    expect(wrapper.find('.tour-table').exists()).toBe(true)
    wrapper.unmount()
  })

  it('mostra as 4 etapas do processo e o checklist da oferta', () => {
    const wrapper = mount(TrialLandingView, { attachTo: document.body, ...pluginOptions() })
    expect(wrapper.findAll('.tl-process-card')).toHaveLength(4)
    expect(wrapper.text()).toContain('Captação')
    expect(wrapper.text()).toContain('Acompanhamento')
    expect(wrapper.findAll('.tl-offer-check-item').length).toBeGreaterThan(0)
    wrapper.unmount()
  })
})
