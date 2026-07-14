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

const { notifyOpsFailure } = await import('../opsAlerts.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }

describe('services/opsAlerts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cria uma notificação para cada admin/owner ativo do tenant', async () => {
    setSupabase({
      notifications: [{ data: [], error: null }],
      users: [{ data: [{ id: 'admin-1' }, { id: 'owner-1' }], error: null }],
    })

    await notifyOpsFailure('tenant-1', { type: 'message_send_failed', title: 'Falha', message: 'msg', leadId: 'lead-1' })

    const inserts = insertCallsFor('notifications')
    expect(inserts).toHaveLength(2)
    expect(inserts[0].args[0]).toMatchObject({ tenant_id: 'tenant-1', user_id: 'admin-1', type: 'message_send_failed', lead_id: 'lead-1' })
    expect(inserts[1].args[0]).toMatchObject({ tenant_id: 'tenant-1', user_id: 'owner-1' })
  })

  it('não cria uma nova notificação quando já existe uma não resolvida recente para o mesmo lead+tipo (dedupe)', async () => {
    setSupabase({
      notifications: [{ data: [{ id: 'notif-existente' }], error: null }],
    })

    await notifyOpsFailure('tenant-1', { type: 'ai_reply_failed', title: 'x', message: 'y', leadId: 'lead-1' })

    expect(insertCallsFor('notifications')).toHaveLength(0)
    // não precisa nem consultar quem são os admins, já que vai deduplicar
    expect(supabaseMock.calls.some((c) => c.table === 'users')).toBe(false)
  })

  it('não lança quando a consulta ao banco falha — falha de notificação não pode derrubar o fluxo principal', async () => {
    setSupabase({ notifications: [{ data: null, error: { message: 'timeout' } }] })
    await expect(notifyOpsFailure('tenant-1', { type: 'x', title: 'a', message: 'b' })).resolves.toBeUndefined()
  })

  it('dedupe sem leadId usa notifications.lead_id IS NULL', async () => {
    setSupabase({ notifications: [{ data: [], error: null }], users: [{ data: [], error: null }] })
    await notifyOpsFailure('tenant-1', { type: 'x', title: 'a', message: 'b' })
    const isCall = supabaseMock.calls.find((c) => c.table === 'notifications' && c.method === 'is' && c.args[0] === 'lead_id')
    expect(isCall).toBeTruthy()
  })
})
