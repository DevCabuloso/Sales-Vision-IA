import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ adminClient: null, adminUpdateFeatures: null, adminImpersonate: null }))

vi.mock('@/services/api', () => ({
  api: {
    adminClient: (...a) => mockState.adminClient(...a),
    adminUpdateFeatures: (...a) => mockState.adminUpdateFeatures(...a),
    adminUpdateStatus: vi.fn(),
    adminUpdateClient: vi.fn(),
    adminUpdateUser: vi.fn(),
    adminCreateUser: vi.fn(),
    adminResetPassword: vi.fn(),
    adminDeleteUser: vi.fn(),
    adminImpersonate: (...a) => mockState.adminImpersonate(...a),
    adminImpersonateUser: vi.fn(),
    adminDeleteClient: vi.fn(),
  },
}))

const ClientDetailView = (await import('../ClientDetailView.vue')).default

describe('ClientDetailView', () => {
  beforeEach(() => {
    mockState.adminClient = vi.fn().mockResolvedValue({
      client: { id: 'tenant-1', name: 'Empresa Ana', slug: 'empresa-ana', status: 'active', plan: 'pro', feat_broadcast: true },
      users: [],
      integrations: [],
    })
    mockState.adminUpdateFeatures = vi.fn().mockResolvedValue({})
    mockState.adminImpersonate = vi.fn().mockResolvedValue({ token: 'tok', user: { id: 'admin-1' } })
  })

  it('carrega e mostra os dados do cliente', async () => {
    const wrapper = mount(ClientDetailView, { props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()
    expect(mockState.adminClient).toHaveBeenCalledWith('tenant-1')
    expect(wrapper.text()).toContain('Empresa Ana')
  })

  it('atualiza uma função ao alternar o switch correspondente', async () => {
    const wrapper = mount(ClientDetailView, { props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()

    const firstSwitch = wrapper.findComponent({ name: 'VSwitch' })
    await firstSwitch.vm.$emit('update:modelValue', true)
    await flushPromises()

    expect(mockState.adminUpdateFeatures).toHaveBeenCalled()
  })

  it('aciona a impersonação ao clicar em "Acessar plataforma"', async () => {
    const wrapper = mount(ClientDetailView, { props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Acessar plataforma'))
    await btn.trigger('click')
    await flushPromises()

    expect(mockState.adminImpersonate).toHaveBeenCalledWith('tenant-1')
  })
})
