import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {} }))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
}))

const { logUsage, logAudit } = await import('../usage.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

describe('services/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('grava o evento de uso com tenant_id, user_id, event_type e meta', async () => {
    setSupabase({ usage_events: [{ data: [{ id: 'ue-1' }], error: null }] })

    await logUsage('tenant-1', 'user-1', 'message_sent', { provider: 'evolution' })

    const insert = supabaseMock.calls.find((c) => c.table === 'usage_events' && c.method === 'insert')
    expect(insert.args[0]).toEqual({
      tenant_id: 'tenant-1', user_id: 'user-1', event_type: 'message_sent', meta: { provider: 'evolution' },
    })
  })

  it('usa {} como meta padrão quando não informado', async () => {
    setSupabase({ usage_events: [{ data: [], error: null }] })

    await logUsage('tenant-1', null, 'message_received')

    const insert = supabaseMock.calls.find((c) => c.table === 'usage_events' && c.method === 'insert')
    expect(insert.args[0]).toMatchObject({ tenant_id: 'tenant-1', user_id: null, event_type: 'message_received', meta: {} })
  })

  it('nunca lança erro — falha/rejeição do Supabase é engolida e apenas logada', async () => {
    mockState.box.supabase = {
      from: () => ({ insert: () => Promise.reject(new Error('conexão perdida')) }),
    }

    await expect(logUsage('tenant-1', 'user-1', 'appointment_created')).resolves.toBeUndefined()
  })

  describe('logAudit', () => {
    it('grava com event_type no formato audit.<entity>.<action> e meta { entityId, changes }', async () => {
      setSupabase({ usage_events: [{ data: [{ id: 'ue-1' }], error: null }] })

      await logAudit('tenant-1', 'user-1', 'lead', 'update', 'l1', { stage: 'Qualificado' })

      const insert = supabaseMock.calls.find((c) => c.table === 'usage_events' && c.method === 'insert')
      expect(insert.args[0]).toEqual({
        tenant_id: 'tenant-1', user_id: 'user-1', event_type: 'audit.lead.update',
        meta: { entityId: 'l1', changes: { stage: 'Qualificado' } },
      })
    })

    it('usa {} como changes padrão quando não informado', async () => {
      setSupabase({ usage_events: [{ data: [], error: null }] })

      await logAudit('tenant-1', 'user-1', 'operator', 'delete', 'u1')

      const insert = supabaseMock.calls.find((c) => c.table === 'usage_events' && c.method === 'insert')
      expect(insert.args[0].meta).toEqual({ entityId: 'u1', changes: {} })
    })
  })
})
