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

  it('rejeita senha do admin com menos de 8 caracteres', async () => {
    const wrapper = mount(ClientsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const novoBtn = wrapper.findAll('button').find((b) => b.text().includes('Novo Cliente'))
    await novoBtn.trigger('click')
    await flushPromises()

    const inputs = [...document.body.querySelectorAll('.v-dialog input')]
    const byLabel = (label) => inputs.find((i) => i.closest('.v-field')?.querySelector('label')?.textContent.includes(label))
    byLabel('Nome da empresa').value = 'Empresa Ana'; byLabel('Nome da empresa').dispatchEvent(new Event('input'))
    byLabel('Slug').value = 'empresa-ana'; byLabel('Slug').dispatchEvent(new Event('input'))
    byLabel('E-mail do admin').value = 'admin@ex.com'; byLabel('E-mail do admin').dispatchEvent(new Event('input'))
    byLabel('Senha').value = '1234567'; byLabel('Senha').dispatchEvent(new Event('input'))
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Criar Cliente')
    criarBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('A senha do admin deve ter pelo menos 8 caracteres.')
    expect(mockState.adminCreateClient).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('rejeita slug com caracteres inválidos', async () => {
    const wrapper = mount(ClientsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const novoBtn = wrapper.findAll('button').find((b) => b.text().includes('Novo Cliente'))
    await novoBtn.trigger('click')
    await flushPromises()

    const inputs = [...document.body.querySelectorAll('.v-dialog input')]
    const byLabel = (label) => inputs.find((i) => i.closest('.v-field')?.querySelector('label')?.textContent.includes(label))
    byLabel('Nome da empresa').value = 'Empresa Ana'; byLabel('Nome da empresa').dispatchEvent(new Event('input'))
    byLabel('Slug').value = 'Empresa Ana!'; byLabel('Slug').dispatchEvent(new Event('input'))
    byLabel('E-mail do admin').value = 'admin@ex.com'; byLabel('E-mail do admin').dispatchEvent(new Event('input'))
    byLabel('Senha').value = 'senha1234'; byLabel('Senha').dispatchEvent(new Event('input'))
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Criar Cliente')
    criarBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Slug: apenas minúsculas, números e hífen.')
    expect(mockState.adminCreateClient).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
