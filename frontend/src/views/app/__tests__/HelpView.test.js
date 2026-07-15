import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import HelpView from '../HelpView.vue'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({
  listSupportTickets: null, createSupportTicket: null, getSupportMessages: null, sendSupportMessage: null,
}))

vi.mock('@/services/api', () => ({
  api: {
    listSupportTickets: (...args) => mockState.listSupportTickets(...args),
    createSupportTicket: (...args) => mockState.createSupportTicket(...args),
    getSupportMessages: (...args) => mockState.getSupportMessages(...args),
    sendSupportMessage: (...args) => mockState.sendSupportMessage(...args),
  },
}))

describe('HelpView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.listSupportTickets = vi.fn().mockResolvedValue([])
    mockState.createSupportTicket = vi.fn()
    mockState.getSupportMessages = vi.fn().mockResolvedValue([])
    mockState.sendSupportMessage = vi.fn()
  })

  it('mostra a primeira categoria (Primeiros passos) por padrão', () => {
    const wrapper = mount(HelpView, pluginOptions())
    expect(wrapper.text()).toContain('Primeiros passos')
    expect(wrapper.text()).toContain('O que é a plataforma?')
  })

  it('troca de categoria ao clicar em outro item da barra lateral', async () => {
    const wrapper = mount(HelpView, pluginOptions())
    const canaisBtn = wrapper.findAll('.help-cat-item').find((b) => b.text().includes('Canais & WhatsApp'))
    await canaisBtn.trigger('click')
    expect(wrapper.text()).toContain('Como conecto um número de WhatsApp?')
  })

  it('filtra os artigos de todas as categorias pela busca', async () => {
    const wrapper = mount(HelpView, pluginOptions())
    await wrapper.find('input').setValue('score de qualificação')
    expect(wrapper.text()).toContain('resultado(s) para')
    expect(wrapper.text()).toContain('O que é o "score de qualificação"?')
  })

  it('mostra estado vazio quando a busca não encontra nada', async () => {
    const wrapper = mount(HelpView, pluginOptions())
    await wrapper.find('input').setValue('xyzxyz_termo_inexistente')
    expect(wrapper.text()).toContain('Nenhum artigo encontrado')
  })

  it('expande/recolhe a resposta no lugar ao clicar na pergunta (classe "open", sem v-if)', async () => {
    const wrapper = mount(HelpView, pluginOptions())
    const card = wrapper.findAll('.faq-card')[0]
    expect(card.classes()).not.toContain('open')

    await card.find('.faq-head').trigger('click')
    expect(card.classes()).toContain('open')

    await card.find('.faq-head').trigger('click')
    expect(card.classes()).not.toContain('open')
  })

  it('fecha as perguntas abertas ao trocar de categoria', async () => {
    const wrapper = mount(HelpView, pluginOptions())
    const card = wrapper.findAll('.faq-card')[0]
    await card.find('.faq-head').trigger('click')
    expect(card.classes()).toContain('open')

    const canaisBtn = wrapper.findAll('.help-cat-item').find((b) => b.text().includes('Canais & WhatsApp'))
    await canaisBtn.trigger('click')

    expect(wrapper.findAll('.faq-card.open')).toHaveLength(0)
  })

  describe('Suporte (chamados)', () => {
    it('carrega os chamados do usuário ao montar', async () => {
      mockState.listSupportTickets.mockResolvedValue([{ id: 't1', category: 'tecnico', status: 'open', description: 'Erro ao enviar' }])
      const wrapper = mount(HelpView, pluginOptions())
      await flushPromises()
      expect(mockState.listSupportTickets).toHaveBeenCalled()
      expect(wrapper.text()).toContain('Problema técnico')
      expect(wrapper.text()).toContain('Erro ao enviar')
    })

    it('mostra mensagem de lista vazia quando não há chamados', async () => {
      const wrapper = mount(HelpView, pluginOptions())
      await flushPromises()
      expect(wrapper.text()).toContain('Você ainda não abriu nenhum chamado')
    })

    it('cria um novo chamado (categoria padrão) e abre o chat automaticamente', async () => {
      mockState.createSupportTicket.mockResolvedValue({ id: 't2', category: 'duvida', status: 'open' })
      const wrapper = mount(HelpView, { attachTo: document.body, ...pluginOptions() })
      await flushPromises()

      const pedirAjudaBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes('Pedir ajuda'))
      await pedirAjudaBtn.click()
      await flushPromises()

      const textarea = document.body.querySelector('.v-dialog textarea')
      textarea.value = 'QR code não aparece'
      textarea.dispatchEvent(new Event('input'))
      await flushPromises()

      const abrirBtn = [...document.body.querySelectorAll('.v-dialog button')].find((b) => b.textContent.includes('Abrir chamado'))
      await abrirBtn.click()
      await flushPromises()

      expect(mockState.createSupportTicket).toHaveBeenCalledWith({ category: 'duvida', description: 'QR code não aparece' })
      expect(mockState.getSupportMessages).toHaveBeenCalledWith('t2')
      wrapper.unmount()
    })

    it('abre o chat de um chamado existente, mostra o histórico e envia uma nova mensagem', async () => {
      mockState.listSupportTickets.mockResolvedValue([{ id: 't1', category: 'duvida', status: 'open', description: 'Como faço X?' }])
      mockState.getSupportMessages.mockResolvedValue([{ id: 'm1', sender_type: 'owner', text: 'Como posso ajudar?' }])
      mockState.sendSupportMessage.mockResolvedValue({ id: 'm2', sender_type: 'user', text: 'Preciso de ajuda com X' })
      const wrapper = mount(HelpView, { attachTo: document.body, ...pluginOptions() })
      await flushPromises()

      const ticketBtn = document.body.querySelector('.support-ticket-item')
      await ticketBtn.click()
      await flushPromises()

      expect(document.body.textContent).toContain('Como posso ajudar?')

      const msgInput = document.body.querySelector('.support-chat-messages').closest('.v-card').querySelector('input')
      msgInput.value = 'Preciso de ajuda com X'
      msgInput.dispatchEvent(new Event('input'))
      await flushPromises()

      const sendBtn = [...document.body.querySelectorAll('.v-card-actions button')].find((b) => b.querySelector('.mdi-send'))
      await sendBtn.click()
      await flushPromises()

      expect(mockState.sendSupportMessage).toHaveBeenCalledWith('t1', 'Preciso de ajuda com X')
      expect(document.body.textContent).toContain('Preciso de ajuda com X')
      wrapper.unmount()
    })
  })
})
