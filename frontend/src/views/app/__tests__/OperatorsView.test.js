import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'
import { api } from '@/services/api'

const mockState = vi.hoisted(() => ({ listOperators: null, operatorsDashboard: null, user: null }))

vi.mock('@/services/api', () => ({
  api: {
    listOperators: (...a) => mockState.listOperators(...a),
    operatorsDashboard: (...a) => mockState.operatorsDashboard(...a),
    createOperator: vi.fn(),
    updateOperator: vi.fn(),
    deleteOperator: vi.fn(),
    resetOperatorPassword: vi.fn(),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: mockState.user }),
}))

const OperatorsView = (await import('../OperatorsView.vue')).default

describe('OperatorsView', () => {
  beforeEach(() => {
    mockState.user = { role: 'admin' }
    mockState.listOperators = vi.fn().mockResolvedValue({ operators: [] })
    mockState.operatorsDashboard = vi.fn().mockResolvedValue({ metrics: [] })
  })

  it('carrega e lista os operadores ao montar', async () => {
    mockState.listOperators.mockResolvedValue({ operators: [{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'agent', active: true }] })
    const wrapper = mount(OperatorsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Ana')
  })

  it('esconde as ações de admin para quem não é admin/owner', async () => {
    mockState.user = { role: 'agent' }
    const wrapper = mount(OperatorsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).not.toContain('Novo Usuário')
  })

  it('exige senha ao criar um novo usuário', async () => {
    const wrapper = mount(OperatorsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const novoBtn = wrapper.findAll('button').find((b) => b.text().includes('Novo Usuário'))
    await novoBtn.trigger('click')
    await flushPromises()

    const inputs = [...document.body.querySelectorAll('.v-dialog input')]
    inputs[0].value = 'Novo Operador'; inputs[0].dispatchEvent(new Event('input'))
    inputs[1].value = 'novo@ex.com'; inputs[1].dispatchEvent(new Event('input'))
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Criar Usuário')
    criarBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Senha obrigatória.')
    expect(api.createOperator).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cria um usuário com permissões por ação (view/create/edit/delete) e desliga uma ação específica', async () => {
    const wrapper = mount(OperatorsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const novoBtn = wrapper.findAll('button').find((b) => b.text().includes('Novo Usuário'))
    await novoBtn.trigger('click')
    await flushPromises()

    const inputs = [...document.body.querySelectorAll('.v-dialog input')]
    inputs[0].value = 'Novo Operador'; inputs[0].dispatchEvent(new Event('input'))
    inputs[1].value = 'novo@ex.com'; inputs[1].dispatchEvent(new Event('input'))
    const passInput = document.body.querySelector('.v-dialog input[type="password"]')
    passInput.value = 'senha12345'; passInput.dispatchEvent(new Event('input'))
    await flushPromises()

    // expande o painel "Permissões de Menu"
    const panelTitle = [...document.body.querySelectorAll('.v-expansion-panel-title')].find((t) => /permiss/i.test(t.textContent))
    panelTitle.click()
    await flushPromises()

    // 2ª área (kanban) tem 4 checkboxes (view/create/edit/delete) — desliga a 4ª (delete)
    const permCheckboxes = [...document.body.querySelectorAll('.perm-row input[type="checkbox"]')]
    expect(permCheckboxes.length).toBe(7 * 4)
    permCheckboxes[7].click() // kanban.delete
    await flushPromises()

    const criarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Criar Usuário')
    criarBtn?.click()
    await flushPromises()

    expect(api.createOperator).toHaveBeenCalledWith(expect.objectContaining({
      permissions: expect.objectContaining({
        chat: { view: true, create: true, edit: true, delete: true },
        kanban: { view: true, create: true, edit: true, delete: false },
      }),
    }))
    wrapper.unmount()
  })

  it('normaliza permissões no formato antigo (booleano) ao editar um operador existente', async () => {
    mockState.listOperators = vi.fn().mockResolvedValue({
      operators: [{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'agent', active: true, permissions: { chat: true, kanban: false } }],
    })
    const wrapper = mount(OperatorsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const editBtn = document.body.querySelectorAll('.v-data-table tbody button')[1]
    editBtn.click()
    await flushPromises()

    const panelTitle = [...document.body.querySelectorAll('.v-expansion-panel-title')].find((t) => /permiss/i.test(t.textContent))
    panelTitle.click()
    await flushPromises()

    const permCheckboxes = [...document.body.querySelectorAll('.perm-row input[type="checkbox"]')]
    // chat: legado true -> acesso total (todas marcadas); kanban: legado false -> nenhuma marcada
    expect(permCheckboxes.slice(0, 4).every((c) => c.checked)).toBe(true)
    expect(permCheckboxes.slice(4, 8).every((c) => !c.checked)).toBe(true)
    wrapper.unmount()
  })

  it('carrega as métricas ao abrir a aba de dashboard', async () => {
    mockState.operatorsDashboard.mockResolvedValue({ metrics: [{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'agent', active: true, messages_sent: 10, leads_handled: 2, appointments: 1, takeovers: 0 }] })
    const wrapper = mount(OperatorsView, pluginOptions())
    await flushPromises()

    const dashTab = wrapper.findAll('.v-tab').find((t) => t.text().includes('Dashboard'))
    await dashTab.trigger('click')
    await flushPromises()

    expect(mockState.operatorsDashboard).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Msgs enviadas')
  })
})
