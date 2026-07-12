import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listAppointments: null, syncAppointments: null, cancelAppointment: null }))

vi.mock('@/services/api', () => ({
  api: {
    listAppointments: (...a) => mockState.listAppointments(...a),
    syncAppointments: (...a) => mockState.syncAppointments(...a),
    cancelAppointment: (...a) => mockState.cancelAppointment(...a),
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
})
