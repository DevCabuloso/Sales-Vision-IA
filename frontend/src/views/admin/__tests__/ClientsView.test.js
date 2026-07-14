import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ adminClients: null, adminCreateClient: null, adminUpdateStatus: null, adminRenewClient: null, adminSendBillingAlert: null }))

vi.mock('@/services/api', () => ({
  api: {
    adminClients: (...a) => mockState.adminClients(...a),
    adminCreateClient: (...a) => mockState.adminCreateClient(...a),
    adminUpdateStatus: (...a) => mockState.adminUpdateStatus(...a),
    adminRenewClient: (...a) => mockState.adminRenewClient(...a),
    adminSendBillingAlert: (...a) => mockState.adminSendBillingAlert(...a),
    adminDeleteClient: vi.fn(),
  },
}))

const ClientsView = (await import('../ClientsView.vue')).default

describe('ClientsView', () => {
  beforeEach(() => {
    mockState.adminClients = vi.fn().mockResolvedValue([])
    mockState.adminCreateClient = vi.fn()
    mockState.adminUpdateStatus = vi.fn().mockResolvedValue({})
    mockState.adminRenewClient = vi.fn().mockResolvedValue({})
    mockState.adminSendBillingAlert = vi.fn().mockResolvedValue({ notified: 0, total: 0, withoutRecipient: [] })
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

  it('mostra o lembrete de vencimento por cliente', async () => {
    mockState.adminClients.mockResolvedValue([
      { id: 't1', name: 'Vencido', slug: 'vencido', status: 'active', plan: 'pro', next_billing_at: new Date(Date.now() - 5 * 86400000).toISOString() },
      { id: 't2', name: 'Sem Data', slug: 'sem-data', status: 'active', plan: 'pro', next_billing_at: null },
    ])
    const wrapper = mount(ClientsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Vencido há 5d')
    expect(wrapper.text()).toContain('Sem vencimento definido')
  })

  it('renova o vencimento em +30 dias pelo menu de ações', async () => {
    mockState.adminClients.mockResolvedValue([{ id: 't1', name: 'Empresa Ana', slug: 'empresa-ana', status: 'active', plan: 'pro', next_billing_at: null }])
    const wrapper = mount(ClientsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const menuBtn = [...document.body.querySelectorAll('button')].find((b) => b.querySelector('.mdi-dots-vertical'))
    menuBtn.click()
    await flushPromises()

    const renewItem = [...document.body.querySelectorAll('.v-list-item')].find((i) => i.textContent.includes('Renovar +30 dias'))
    renewItem.click()
    await flushPromises()

    expect(mockState.adminRenewClient).toHaveBeenCalledWith('t1', { days: 30 })
    wrapper.unmount()
  })

  it('emite alerta de vencimento e mostra quantos clientes foram notificados', async () => {
    mockState.adminSendBillingAlert.mockResolvedValue({ notified: 2, total: 2, withoutRecipient: [] })
    const wrapper = mount(ClientsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const alertBtn = wrapper.findAll('button').find((b) => b.text().includes('Emitir Alerta'))
    await alertBtn.trigger('click')
    await flushPromises()

    expect(mockState.adminSendBillingAlert).toHaveBeenCalled()
    // o v-snackbar é teleportado para document.body
    expect(document.body.textContent).toContain('Alerta enviado para 2 clientes.')
    wrapper.unmount()
  })

  it('avisa quando nenhum cliente está próximo do vencimento', async () => {
    mockState.adminSendBillingAlert.mockResolvedValue({ notified: 0, total: 0, withoutRecipient: [] })
    const wrapper = mount(ClientsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const alertBtn = wrapper.findAll('button').find((b) => b.text().includes('Emitir Alerta'))
    await alertBtn.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('Nenhum cliente com mensalidade próxima do vencimento no momento.')
    wrapper.unmount()
  })

  it('avisa quando há cliente vencendo mas sem destinatário configurado', async () => {
    mockState.adminSendBillingAlert.mockResolvedValue({ notified: 0, total: 1, withoutRecipient: ['Interprise'] })
    const wrapper = mount(ClientsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const alertBtn = wrapper.findAll('button').find((b) => b.text().includes('Emitir Alerta'))
    await alertBtn.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('1 cliente vencendo sem destinatário configurado: Interprise.')
    wrapper.unmount()
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
