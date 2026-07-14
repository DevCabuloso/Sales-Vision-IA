import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({
  adminClient: null, adminUpdateFeatures: null, adminImpersonate: null,
  adminUpdateClient: null, adminCreateUser: null, adminUpdateUser: null, adminResetPassword: null,
  adminRenewClient: null,
}))

vi.mock('@/services/api', () => ({
  api: {
    adminClient: (...a) => mockState.adminClient(...a),
    adminUpdateFeatures: (...a) => mockState.adminUpdateFeatures(...a),
    adminUpdateStatus: vi.fn(),
    adminUpdateClient: (...a) => mockState.adminUpdateClient(...a),
    adminUpdateUser: (...a) => mockState.adminUpdateUser(...a),
    adminCreateUser: (...a) => mockState.adminCreateUser(...a),
    adminResetPassword: (...a) => mockState.adminResetPassword(...a),
    adminRenewClient: (...a) => mockState.adminRenewClient(...a),
    adminDeleteUser: vi.fn(),
    adminImpersonate: (...a) => mockState.adminImpersonate(...a),
    adminImpersonateUser: vi.fn(),
    adminDeleteClient: vi.fn(),
  },
}))

const ClientDetailView = (await import('../ClientDetailView.vue')).default

function findByLabel(label) {
  return [...document.body.querySelectorAll('.v-dialog input')]
    .find((i) => i.closest('.v-field')?.querySelector('label')?.textContent.includes(label))
}

describe('ClientDetailView', () => {
  beforeEach(() => {
    mockState.adminClient = vi.fn().mockResolvedValue({
      client: { id: 'tenant-1', name: 'Empresa Ana', slug: 'empresa-ana', status: 'active', plan: 'pro', feat_broadcast: true },
      users: [{ id: 'u1', name: 'Bia', email: 'bia@ex.com', role: 'agent', active: true }],
      integrations: [],
    })
    mockState.adminUpdateFeatures = vi.fn().mockResolvedValue({})
    mockState.adminImpersonate = vi.fn().mockResolvedValue({ token: 'tok', user: { id: 'admin-1' } })
    mockState.adminUpdateClient = vi.fn().mockResolvedValue({ name: 'Empresa Ana 2' })
    mockState.adminCreateUser = vi.fn().mockResolvedValue({ id: 'u2', name: 'Novo', email: 'novo@ex.com', role: 'agent' })
    mockState.adminUpdateUser = vi.fn().mockResolvedValue({ name: 'Bia Editada' })
    mockState.adminResetPassword = vi.fn().mockResolvedValue({ updated: true })
    mockState.adminRenewClient = vi.fn().mockResolvedValue({ next_billing_at: '2026-09-13T00:00:00.000Z' })
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

  it('renova +30 dias pelo dialog de renovação', async () => {
    const wrapper = mount(ClientDetailView, { attachTo: document.body, props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()

    const renewBtn = wrapper.findAll('button').find((b) => b.text().includes('Renovar'))
    await renewBtn.trigger('click')
    await flushPromises()

    const quickBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === '+30 dias')
    quickBtn.click()
    await flushPromises()

    expect(mockState.adminRenewClient).toHaveBeenCalledWith('tenant-1', { days: 30 })
    wrapper.unmount()
  })

  it('rejeita data vazia ao renovar com data customizada', async () => {
    const wrapper = mount(ClientDetailView, { attachTo: document.body, props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()

    const renewBtn = wrapper.findAll('button').find((b) => b.text().includes('Renovar'))
    await renewBtn.trigger('click')
    await flushPromises()

    const salvarDataBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Salvar data')
    salvarDataBtn.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Informe a data de vencimento.')
    expect(mockState.adminRenewClient).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('rejeita nome vazio ao editar o cliente e não chama a API', async () => {
    const wrapper = mount(ClientDetailView, { attachTo: document.body, props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('Editar'))
    await editBtn.trigger('click')
    await flushPromises()

    findByLabel('Nome da empresa').value = ''
    findByLabel('Nome da empresa').dispatchEvent(new Event('input'))
    await flushPromises()

    const salvarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Salvar')
    salvarBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Nome deve ter pelo menos 2 caracteres.')
    expect(mockState.adminUpdateClient).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('permite designar o destinatário do aviso de vencimento ao editar o cliente', async () => {
    mockState.adminClient.mockResolvedValue({
      client: { id: 'tenant-1', name: 'Empresa Ana', slug: 'empresa-ana', status: 'active', plan: 'pro', feat_broadcast: true, billing_notify_user_id: null },
      users: [{ id: 'u1', name: 'Bia', email: 'bia@ex.com', role: 'agent', active: true }],
      integrations: [],
    })
    const wrapper = mount(ClientDetailView, { attachTo: document.body, props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('Editar'))
    await editBtn.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('Notificar sobre vencimento')

    const salvarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Salvar')
    salvarBtn?.click()
    await flushPromises()

    expect(mockState.adminUpdateClient).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ billing_notify_user_id: null }))
    wrapper.unmount()
  })

  it('salva a edição do cliente com dados válidos', async () => {
    const wrapper = mount(ClientDetailView, { attachTo: document.body, props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('Editar'))
    await editBtn.trigger('click')
    await flushPromises()

    findByLabel('Nome da empresa').value = 'Empresa Ana 2'
    findByLabel('Nome da empresa').dispatchEvent(new Event('input'))
    await flushPromises()

    const salvarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Salvar')
    salvarBtn?.click()
    await flushPromises()

    expect(mockState.adminUpdateClient).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ name: 'Empresa Ana 2' }))
    wrapper.unmount()
  })

  it('rejeita senha curta ao criar um novo usuário e não chama a API', async () => {
    const wrapper = mount(ClientDetailView, { attachTo: document.body, props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()

    const novoBtn = wrapper.findAll('button').find((b) => b.text().includes('Novo usuário'))
    await novoBtn.trigger('click')
    await flushPromises()

    findByLabel('Nome').value = 'Carlos'; findByLabel('Nome').dispatchEvent(new Event('input'))
    findByLabel('E-mail').value = 'carlos@ex.com'; findByLabel('E-mail').dispatchEvent(new Event('input'))
    findByLabel('Senha').value = '1234567'; findByLabel('Senha').dispatchEvent(new Event('input'))
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Criar usuário')
    criarBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Senha deve ter pelo menos 8 caracteres.')
    expect(mockState.adminCreateUser).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cria um novo usuário com dados válidos', async () => {
    const wrapper = mount(ClientDetailView, { attachTo: document.body, props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()

    const novoBtn = wrapper.findAll('button').find((b) => b.text().includes('Novo usuário'))
    await novoBtn.trigger('click')
    await flushPromises()

    findByLabel('Nome').value = 'Carlos'; findByLabel('Nome').dispatchEvent(new Event('input'))
    findByLabel('E-mail').value = 'carlos@ex.com'; findByLabel('E-mail').dispatchEvent(new Event('input'))
    findByLabel('Senha').value = 'senha1234'; findByLabel('Senha').dispatchEvent(new Event('input'))
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Criar usuário')
    criarBtn?.click()
    await flushPromises()

    expect(mockState.adminCreateUser).toHaveBeenCalledWith('tenant-1', expect.objectContaining({
      name: 'Carlos', email: 'carlos@ex.com', password: 'senha1234', role: 'agent',
    }))
    wrapper.unmount()
  })

  it('rejeita senha curta ao redefinir a senha de um usuário', async () => {
    const wrapper = mount(ClientDetailView, { attachTo: document.body, props: { id: 'tenant-1' }, ...pluginOptions() })
    await flushPromises()

    const resetBtn = document.body.querySelector('[aria-label], .mdi-lock-reset')?.closest('button')
      || [...document.body.querySelectorAll('button')].find((b) => b.querySelector('.mdi-lock-reset'))
    await resetBtn.click()
    await flushPromises()

    const pwInput = [...document.body.querySelectorAll('.v-dialog input')].find((i) => i.type === 'password')
    pwInput.value = '1234567'
    pwInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const redefinirBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Redefinir')
    redefinirBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Senha deve ter pelo menos 8 caracteres.')
    expect(mockState.adminResetPassword).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
