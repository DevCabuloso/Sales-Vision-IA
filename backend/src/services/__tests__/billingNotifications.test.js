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

const { createBillingReminderNotification } = await import('../billingNotifications.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }

const tenant = { id: 'tenant-1', name: 'Empresa', billing_notify_user_id: 'user-1' }

describe('services/billingNotifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cria a notificação e retorna true quando não há nenhuma criada hoje', async () => {
    setSupabase({
      notifications: [{ data: [], error: null }],
    })

    const created = await createBillingReminderNotification(tenant, 'Vence em 3 dias.')

    expect(created).toBe(true)
    const insert = insertCallsFor('notifications')[0]
    expect(insert.args[0]).toMatchObject({
      tenant_id: 'tenant-1', user_id: 'user-1', type: 'billing_reminder',
      title: 'Mensalidade próxima do vencimento', message: 'Vence em 3 dias.',
    })
  })

  it('não cria e retorna false quando já existe um aviso não resolvido criado hoje (fast-path via SELECT)', async () => {
    setSupabase({
      notifications: [{ data: [{ id: 'notif-existente' }], error: null }],
    })

    const created = await createBillingReminderNotification(tenant, 'Vence em 3 dias.')

    expect(created).toBe(false)
    expect(insertCallsFor('notifications')).toHaveLength(0)
  })

  it('trata erro de unique_violation (23505) do índice único como "já existe" em vez de propagar (fecha a corrida SELECT-then-INSERT)', async () => {
    setSupabase({
      notifications: [
        { data: [], error: null }, // SELECT: nada encontrado ainda
        { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }, // INSERT: perdeu a corrida
      ],
    })

    const created = await createBillingReminderNotification(tenant, 'Vence em 3 dias.')

    expect(created).toBe(false)
  })

  it('propaga outros erros de banco (não relacionados a duplicata)', async () => {
    setSupabase({
      notifications: [
        { data: [], error: null },
        { data: null, error: { code: '500', message: 'timeout' } },
      ],
    })

    await expect(createBillingReminderNotification(tenant, 'x')).rejects.toThrow('timeout')
  })
})
