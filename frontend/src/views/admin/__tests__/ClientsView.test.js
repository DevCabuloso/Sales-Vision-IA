import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ adminClients: null, adminCreateClient: null, adminUpdateStatus: null }))

vi.mock('@/services/api', () => ({
  api: {
    adminClients: (...a) => mockState.adminClients(...a),
    adminCreateClient: (...a) => mockState.adminCreateClient(...a),
    adminUpdateStatus: (...a) => mockState.adminUpdateStatus(...a),
    adminDeleteClient: vi.fn(),
  },
}))

const ClientsView = (await import('../ClientsView.vue')).default

describe('ClientsView', () => {
  beforeEach(() => {
    mockState.adminClients = vi.fn().mockResolvedValue([])
    mockState.adminCreateClient = vi.fn()
    mockState.adminUpdateStatus = vi.fn().mockResolvedValue({})
  })

  it('carrega e lista os clientes', async () => {
    mockState.adminClients.mockResolvedValue([{ id: 't1', name: 'Empresa Ana', slug: 'empresa-ana', status: 'active', plan: 'pro' }])
    const wrapper = mount(ClientsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Empresa Ana')
  })

  it('filtra clientes pela busca', async () => {
    mockState.adminClients.mockResolvedValue([
      { id: 't1', name: 'Empresa Ana', slug: 'empresa-ana', status: 'active', plan: 'pro' },
      { id: 't2', name: 'Empresa Bia', slug: 'empresa-bia', status: 'active', plan: 'trial' },
    ])
    const wrapper = mount(ClientsView, pluginOptions())
    await flushPromises()

    await wrapper.find('input').setValue('ana')
    expect(wrapper.text()).toContain('Empresa Ana')
    expect(wrapper.text()).not.toContain('Empresa Bia')
  })

  it('exige nome, slug, e-mail e senha do admin ao criar um cliente', async () => {
    const wrapper = mount(ClientsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const novoBtn = wrapper.findAll('button').find((b) => b.text().includes('Novo Cliente'))
    await novoBtn.trigger('click')
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Criar Cliente')
    criarBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Preencha nome, slug, e-mail e senha do admin.')
    expect(mockState.adminCreateClient).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
