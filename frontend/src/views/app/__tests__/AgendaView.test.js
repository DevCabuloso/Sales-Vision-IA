import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({
  listAppointments: null, syncAppointments: null, cancelAppointment: null,
  listLeads: null, createAppointment: null, rescheduleAppointment: null,
}))

vi.mock('@/services/api', () => ({
  api: {
    listAppointments: (...a) => mockState.listAppointments(...a),
    syncAppointments: (...a) => mockState.syncAppointments(...a),
    cancelAppointment: (...a) => mockState.cancelAppointment(...a),
    listLeads: (...a) => mockState.listLeads(...a),
    createAppointment: (...a) => mockState.createAppointment(...a),
    rescheduleAppointment: (...a) => mockState.rescheduleAppointment(...a),
  },
}))

vi.mock('@/composables/useRealtime', () => ({ useRealtime: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { tenantId: 'tenant-1' } }) }))

const AgendaView = (await import('../AgendaView.vue')).default

describe('AgendaView', () => {
  beforeEach(() => {
    mockState.listAppointments = vi.fn().mockResolvedValue([])
    mockState.syncAppointments = vi.fn().mockResolvedValue({ synced: 0 })
    mockState.cancelAppointment = vi.fn().mockResolvedValue({})
    mockState.listLeads = vi.fn().mockResolvedValue([])
    mockState.createAppointment = vi.fn().mockResolvedValue({ appointment: { id: 'new-1' } })
    mockState.rescheduleAppointment = vi.fn().mockResolvedValue({ appointment: { id: 'a1' } })
  })

  it('sincroniza com o Google e carrega os agendamentos ao montar', async () => {
    const wrapper = mount(AgendaView, pluginOptions())
    await flushPromises()

    expect(mockState.syncAppointments).toHaveBeenCalled()
    expect(mockState.listAppointments).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Agenda')
  })

  it('mostra as reuniões do mês quando existem', async () => {
    const today = new Date().toISOString()
    mockState.listAppointments.mockResolvedValue([
      { id: 'a1', lead_name: 'Ana', title: 'Demo', provider: 'google', start_time: today, end_time: today, status: 'scheduled' },
    ])
    const wrapper = mount(AgendaView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Ana')
  })

  it('mostra um toast de erro quando o cancelamento do agendamento falha', async () => {
    const today = new Date().toISOString()
    mockState.listAppointments.mockResolvedValue([
      { id: 'a1', lead_name: 'Ana', title: 'Demo', provider: 'google', start_time: today, end_time: today, status: 'scheduled' },
    ])
    mockState.cancelAppointment.mockRejectedValue(new Error('Falha ao cancelar no Google Calendar.'))
    const wrapper = mount(AgendaView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('Cancelar'))
    await cancelBtn.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('Falha ao cancelar no Google Calendar.')
    wrapper.unmount()
  })

  it('exibe o aviso retornado pela sincronização', async () => {
    mockState.syncAppointments.mockResolvedValue({ synced: 0, warning: 'Google Calendar não conectado. Reconecte em Integrações.' })
    const wrapper = mount(AgendaView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const syncBtn = wrapper.findAll('button').find((b) => b.text().includes('Sincronizar Google'))
    await syncBtn.trigger('click')
    await flushPromises()

    // o v-snackbar é teleportado para document.body
    expect(document.body.textContent).toContain('Google Calendar não conectado')
    wrapper.unmount()
  })

  it('abre o diálogo de criação ao clicar em "Novo agendamento"', async () => {
    const wrapper = mount(AgendaView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const newBtn = wrapper.findAll('button').find((b) => b.text().includes('Novo agendamento'))
    await newBtn.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('Novo agendamento')
    wrapper.unmount()
  })

  it('abre o diálogo de edição ao clicar num agendamento do mês', async () => {
    const today = new Date().toISOString()
    mockState.listAppointments.mockResolvedValue([
      { id: 'a1', lead_name: 'Ana', title: 'Demo', provider: 'google', start_time: today, end_time: today, status: 'scheduled' },
    ])
    const wrapper = mount(AgendaView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const card = wrapper.findAll('.appt-card').find((c) => c.text().includes('Ana'))
    await card.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('Editar agendamento')
    wrapper.unmount()
  })

  it('troca para a visão Semana e renderiza a grade de horas', async () => {
    const wrapper = mount(AgendaView, pluginOptions())
    await flushPromises()

    const weekBtn = wrapper.findAll('button').find((b) => b.text() === 'Semana')
    await weekBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('.week-grid').exists()).toBe(true)
  })

  it('troca para a visão Agenda e lista os próximos agendamentos agrupados por dia', async () => {
    const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString()
    mockState.listAppointments.mockResolvedValue([
      { id: 'a1', lead_name: 'Beatriz', title: 'Follow-up', provider: 'local', start_time: inTwoDays, end_time: inTwoDays, status: 'scheduled' },
    ])
    const wrapper = mount(AgendaView, pluginOptions())
    await flushPromises()

    const agendaBtn = wrapper.findAll('button').find((b) => b.text() === 'Agenda')
    await agendaBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Beatriz')
  })

  it('mostra mensagem de vazio na visão Agenda quando não há agendamentos futuros', async () => {
    const wrapper = mount(AgendaView, pluginOptions())
    await flushPromises()

    const agendaBtn = wrapper.findAll('button').find((b) => b.text() === 'Agenda')
    await agendaBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Nenhum agendamento futuro')
  })
})
