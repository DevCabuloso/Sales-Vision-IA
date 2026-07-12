import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ createQueue: null, createOperator: null, updateQueue: null, put: null, completeOnboarding: null, push: null }))

vi.mock('@/services/api', () => ({
  api: {
    createQueue: (...a) => mockState.createQueue(...a),
    createOperator: (...a) => mockState.createOperator(...a),
    updateQueue: (...a) => mockState.updateQueue(...a),
    createChannel: vi.fn(),
    createFlow: vi.fn(),
    updateFlow: vi.fn(),
    toggleAI: vi.fn(),
    saveAIConfig: vi.fn(),
  },
  http: { put: (...a) => mockState.put(...a) },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { tenantName: 'Empresa Ana' }, completeOnboarding: (...a) => mockState.completeOnboarding(...a) }),
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => ({ push: (...a) => mockState.push(...a) }) }
})

const OnboardingView = (await import('../OnboardingView.vue')).default

describe('OnboardingView', () => {
  beforeEach(() => {
    mockState.createQueue = vi.fn().mockResolvedValue({ queue: { id: 'q1', name: 'Vendas' } })
    mockState.createOperator = vi.fn().mockResolvedValue({ operator: { id: 'u1', name: 'Bia', email: 'bia@ex.com' } })
    mockState.updateQueue = vi.fn().mockResolvedValue({})
    mockState.put = vi.fn().mockResolvedValue({ data: {} })
    mockState.completeOnboarding = vi.fn().mockResolvedValue({})
    mockState.push = vi.fn()
  })

  it('mostra o primeiro passo (dados do negócio) pré-preenchido com o nome do tenant', () => {
    const wrapper = mount(OnboardingView, pluginOptions())
    expect(wrapper.text()).toContain('Fale sobre o seu negócio')
    expect(wrapper.find('input').element.value).toBe('Empresa Ana')
  })

  it('avança para o passo de equipe ao clicar em Continuar', async () => {
    const wrapper = mount(OnboardingView, pluginOptions())
    await wrapper.find('.ob-btn-primary').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Monte sua equipe')
  })

  it('cria a fila padrão ao avançar do passo de equipe', async () => {
    const wrapper = mount(OnboardingView, pluginOptions())
    await wrapper.find('.ob-btn-primary').trigger('click') // -> equipe
    await flushPromises()
    await wrapper.find('.ob-btn-primary').trigger('click') // -> atendimento
    await flushPromises()

    expect(mockState.createQueue).toHaveBeenCalledWith({ name: 'Atendimento Geral', color: expect.any(String) })
    expect(wrapper.text()).toContain('Atendimento automático')
  })

  it('permite pular a configuração e ir direto para o dashboard', async () => {
    const wrapper = mount(OnboardingView, pluginOptions())
    const skipBtn = wrapper.findAll('button').find((b) => b.text().includes('Pular configuração'))
    await skipBtn.trigger('click')
    await flushPromises()

    expect(mockState.completeOnboarding).toHaveBeenCalled()
    expect(mockState.push).toHaveBeenCalledWith('/dashboard')
  })
})
