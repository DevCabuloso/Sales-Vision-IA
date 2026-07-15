import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({
  adminListSupportTickets: null, adminStartSupportTicket: null, adminGetSupportMessages: null,
  adminSendSupportMessage: null, adminCloseSupportTicket: null,
}))

vi.mock('@/services/api', () => ({
  api: {
    adminListSupportTickets: (...a) => mockState.adminListSupportTickets(...a),
    adminStartSupportTicket: (...a) => mockState.adminStartSupportTicket(...a),
    adminGetSupportMessages: (...a) => mockState.adminGetSupportMessages(...a),
    adminSendSupportMessage: (...a) => mockState.adminSendSupportMessage(...a),
    adminCloseSupportTicket: (...a) => mockState.adminCloseSupportTicket(...a),
  },
}))

const SupportView = (await import('../SupportView.vue')).default

const TICKET_OPEN = { id: 't1', tenant_id: 'tenant-1', tenant_name: 'Empresa X', user_id: 'user-1', user_name: 'Ana', user_email: 'ana@ex.com', category: 'tecnico', description: 'Erro ao enviar mensagem', status: 'open' }

describe('SupportView (admin)', () => {
  beforeEach(() => {
    mockState.adminListSupportTickets = vi.fn().mockResolvedValue([])
    mockState.adminStartSupportTicket = vi.fn()
    mockState.adminGetSupportMessages = vi.fn().mockResolvedValue([])
    mockState.adminSendSupportMessage = vi.fn()
    mockState.adminCloseSupportTicket = vi.fn()
  })

  it('carrega e agrupa os chamados por empresa', async () => {
    mockState.adminListSupportTickets.mockResolvedValue([TICKET_OPEN])
    const wrapper = mount(SupportView, pluginOptions())
    await flushPromises()
    expect(mockState.adminListSupportTickets).toHaveBeenCalledWith('open')
    expect(wrapper.text()).toContain('Empresa X')
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Problema técnico')
  })

  it('mostra estado vazio quando não há chamados', async () => {
    const wrapper = mount(SupportView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhum chamado por aqui')
  })

  it('troca o filtro de status ao clicar num botão do toggle', async () => {
    const wrapper = mount(SupportView, pluginOptions())
    await flushPromises()
    mockState.adminListSupportTickets.mockClear()

    const todosBtn = wrapper.findAll('button').find((b) => b.text() === 'Todos')
    await todosBtn.trigger('click')
    await flushPromises()

    expect(mockState.adminListSupportTickets).toHaveBeenCalledWith(undefined)
  })

  it('abre o chat de um chamado e mostra o histórico de mensagens', async () => {
    mockState.adminListSupportTickets.mockResolvedValue([TICKET_OPEN])
    mockState.adminGetSupportMessages.mockResolvedValue([{ id: 'm1', sender_type: 'user', text: 'Não consigo enviar' }])
    const wrapper = mount(SupportView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const ticketBtn = document.body.querySelector('.support-ticket-item')
    await ticketBtn.click()
    await flushPromises()

    expect(mockState.adminGetSupportMessages).toHaveBeenCalledWith('t1')
    expect(document.body.textContent).toContain('Não consigo enviar')
    wrapper.unmount()
  })

  it('"Iniciar suporte" assume o chamado e libera a caixa de resposta', async () => {
    mockState.adminListSupportTickets.mockResolvedValue([TICKET_OPEN])
    mockState.adminStartSupportTicket.mockResolvedValue({ ...TICKET_OPEN, status: 'in_progress', started_by: 'owner-1' })
    const wrapper = mount(SupportView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    await document.body.querySelector('.support-ticket-item').click()
    await flushPromises()

    const startBtn = [...document.body.querySelectorAll('.v-card-actions button')].find((b) => b.textContent.includes('Iniciar suporte'))
    await startBtn.click()
    await flushPromises()

    expect(mockState.adminStartSupportTicket).toHaveBeenCalledWith('t1')
    expect(document.body.querySelector('.v-card-actions input')).toBeTruthy()
    wrapper.unmount()
  })

  it('envia uma resposta quando o chamado está em atendimento', async () => {
    mockState.adminListSupportTickets.mockResolvedValue([{ ...TICKET_OPEN, status: 'in_progress' }])
    mockState.adminSendSupportMessage.mockResolvedValue({ id: 'm2', sender_type: 'owner', text: 'Já estou vendo!' })
    const wrapper = mount(SupportView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    await document.body.querySelector('.support-ticket-item').click()
    await flushPromises()

    const input = document.body.querySelector('.v-card-actions input')
    input.value = 'Já estou vendo!'
    input.dispatchEvent(new Event('input'))
    await flushPromises()

    const sendBtn = [...document.body.querySelectorAll('.v-card-actions button')].find((b) => b.querySelector('.mdi-send'))
    await sendBtn.click()
    await flushPromises()

    expect(mockState.adminSendSupportMessage).toHaveBeenCalledWith('t1', 'Já estou vendo!')
    expect(document.body.textContent).toContain('Já estou vendo!')
    wrapper.unmount()
  })

  it('encerra o chamado', async () => {
    mockState.adminListSupportTickets.mockResolvedValue([{ ...TICKET_OPEN, status: 'in_progress' }])
    mockState.adminCloseSupportTicket.mockResolvedValue({ ...TICKET_OPEN, status: 'closed' })
    const wrapper = mount(SupportView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    await document.body.querySelector('.support-ticket-item').click()
    await flushPromises()

    const closeBtn = [...document.body.querySelectorAll('.v-card-actions button')].find((b) => b.textContent.includes('Encerrar'))
    await closeBtn.click()
    await flushPromises()

    expect(mockState.adminCloseSupportTicket).toHaveBeenCalledWith('t1')
    expect(document.body.textContent).toContain('Este chamado foi encerrado')
    wrapper.unmount()
  })
})
