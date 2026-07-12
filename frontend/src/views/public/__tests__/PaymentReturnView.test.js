import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ query: {}, push: null, getOrderStatus: null, hydrate: null }))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRouter: () => ({ push: (...a) => mockState.push(...a) }),
    useRoute: () => ({ query: mockState.query }),
  }
})

vi.mock('@/services/api', () => ({
  api: { getOrderStatus: (...a) => mockState.getOrderStatus(...a) },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ hydrate: (...a) => mockState.hydrate(...a) }),
}))

const PaymentReturnView = (await import('../PaymentReturnView.vue')).default

describe('PaymentReturnView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockState.query = { order_nsu: 'order-1' }
    mockState.push = vi.fn()
    mockState.hydrate = vi.fn()
    mockState.getOrderStatus = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mostra "confirmando" e continua tentando quando o pagamento ainda não foi confirmado', async () => {
    mockState.getOrderStatus.mockResolvedValue({ status: 'pending' })
    const wrapper = mount(PaymentReturnView, pluginOptions())
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.text()).toContain('Confirmando seu pagamento')
  })

  it('vai para timeout sem order_nsu na query', async () => {
    mockState.query = {}
    const wrapper = mount(PaymentReturnView, pluginOptions())
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.text()).toContain('Ainda confirmando')
  })

  it('hidrata o usuário e navega para onboarding quando o pagamento é confirmado', async () => {
    mockState.getOrderStatus.mockResolvedValue({ status: 'paid', user: { id: 'user-1' } })
    mount(PaymentReturnView, pluginOptions())
    await vi.advanceTimersByTimeAsync(0)
    expect(mockState.hydrate).toHaveBeenCalledWith({ id: 'user-1' })
    await vi.advanceTimersByTimeAsync(1200)
    expect(mockState.push).toHaveBeenCalledWith('/onboarding')
  })
})
