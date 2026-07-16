import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {} }))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

const { createAppointmentReminderNotification } = await import('../appointmentNotifications.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }

const appt = {
  tenant_id: 'tenant-1', assignee_id: 'user-1', title: 'Demo com Ana', lead_name: 'Ana',
  start_time: '2026-08-03T13:30:00.000Z', timezone: 'America/Sao_Paulo',
}

describe('services/appointmentNotifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cria a notificação com hora local e nome do lead, retornando true', async () => {
    setSupabase({ notifications: [{ data: [{ id: 'n1' }], error: null }] })

    const created = await createAppointmentReminderNotification(appt)

    expect(created).toBe(true)
    const insert = insertCallsFor('notifications')[0]
    expect(insert.args[0]).toMatchObject({
      tenant_id: 'tenant-1', user_id: 'user-1', type: 'appointment_reminder', title: 'Lembrete de agendamento',
    })
    expect(insert.args[0].message).toContain('Demo com Ana')
    expect(insert.args[0].message).toContain('Ana')
    expect(insert.args[0].message).toMatch(/\d{2}:\d{2}/)
  })

  it('não cria e retorna false quando o agendamento não tem responsável (assignee_id)', async () => {
    setSupabase({})
    const created = await createAppointmentReminderNotification({ ...appt, assignee_id: null })
    expect(created).toBe(false)
    expect(insertCallsFor('notifications')).toHaveLength(0)
  })

  it('omite "com <lead>" quando o agendamento não tem lead vinculado', async () => {
    setSupabase({ notifications: [{ data: [{ id: 'n1' }], error: null }] })
    await createAppointmentReminderNotification({ ...appt, title: 'Reunião interna', lead_name: null })
    const insert = insertCallsFor('notifications')[0]
    expect(insert.args[0].message).not.toContain(' com ')
  })

  it('propaga erros de banco', async () => {
    setSupabase({ notifications: [{ data: null, error: { message: 'timeout' } }] })
    await expect(createAppointmentReminderNotification(appt)).rejects.toThrow('timeout')
  })
})
