import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, safeFetch: null }))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../../utils/ssrfGuard.js', () => ({
  safeFetch: (...args) => mockState.safeFetch(...args),
}))

const { enqueueWebhookEvent, deliverPendingWebhooks } = await import('../webhookDelivery.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }
function updateCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update') }

describe('services/webhookDelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.safeFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  })

  describe('enqueueWebhookEvent', () => {
    it('não insere nada quando o tenant não tem endpoint ativo inscrito no evento', async () => {
      setSupabase({ webhook_endpoints: [{ data: [{ id: 'e1', events: ['appointment.created'] }], error: null }] })
      await enqueueWebhookEvent('tenant-1', 'lead.created', { leadId: 'l1' })
      expect(insertCallsFor('webhook_deliveries')).toHaveLength(0)
    })

    it('insere uma entrega por endpoint ativo inscrito no evento', async () => {
      setSupabase({
        webhook_endpoints: [{ data: [
          { id: 'e1', events: ['lead.created'] },
          { id: 'e2', events: ['appointment.created'] },
        ], error: null }],
      })
      await enqueueWebhookEvent('tenant-1', 'lead.created', { leadId: 'l1' })
      const inserts = insertCallsFor('webhook_deliveries')
      expect(inserts).toHaveLength(1)
      expect(inserts[0].args[0]).toEqual([{ tenant_id: 'tenant-1', endpoint_id: 'e1', event_type: 'lead.created', payload: { leadId: 'l1' } }])
    })

    it('nunca lança erro — falha do Supabase é engolida e apenas logada', async () => {
      mockState.box.supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => Promise.reject(new Error('conexão perdida')) }) }) }) }
      await expect(enqueueWebhookEvent('tenant-1', 'lead.created', {})).resolves.toBeUndefined()
    })
  })

  describe('deliverPendingWebhooks', () => {
    it('não faz nada quando não há entregas devidas', async () => {
      setSupabase({ webhook_deliveries: [{ data: [], error: null }] })
      await deliverPendingWebhooks()
      expect(mockState.safeFetch).not.toHaveBeenCalled()
    })

    it('entrega com sucesso: assina o corpo, envia e marca status=success', async () => {
      setSupabase({
        webhook_deliveries: [
          { data: [{ id: 'd1', tenant_id: 'tenant-1', endpoint_id: 'e1', event_type: 'lead.created', payload: { leadId: 'l1' }, attempts: 0 }], error: null },
        ],
        webhook_endpoints: [{ data: [{ url: 'https://ex.com/hook', secret: 'segredo', active: true }], error: null }],
      })
      await deliverPendingWebhooks()

      expect(mockState.safeFetch).toHaveBeenCalledWith('https://ex.com/hook', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Webhook-Event': 'lead.created', 'X-Webhook-Signature': expect.any(String) }),
      }))
      const successUpdate = updateCallsFor('webhook_deliveries').find((c) => c.args[0].status === 'success')
      expect(successUpdate).toBeTruthy()
    })

    it('cancela a entrega quando o endpoint foi desativado/excluído', async () => {
      setSupabase({
        webhook_deliveries: [
          { data: [{ id: 'd1', tenant_id: 'tenant-1', endpoint_id: 'e1', event_type: 'lead.created', payload: {}, attempts: 0 }], error: null },
        ],
        webhook_endpoints: [{ data: [{ url: 'https://ex.com/hook', secret: 'x', active: false }], error: null }],
      })
      await deliverPendingWebhooks()
      expect(mockState.safeFetch).not.toHaveBeenCalled()
      const cancelled = updateCallsFor('webhook_deliveries').find((c) => c.args[0].status === 'cancelled')
      expect(cancelled).toBeTruthy()
    })

    it('em falha (HTTP não-ok), incrementa attempts e agenda retry com backoff', async () => {
      mockState.safeFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
      setSupabase({
        webhook_deliveries: [
          { data: [{ id: 'd1', tenant_id: 'tenant-1', endpoint_id: 'e1', event_type: 'lead.created', payload: {}, attempts: 1 }], error: null },
        ],
        webhook_endpoints: [{ data: [{ url: 'https://ex.com/hook', secret: 'x', active: true }], error: null }],
      })
      await deliverPendingWebhooks()
      const failUpdate = updateCallsFor('webhook_deliveries').find((c) => c.args[0].status === 'failed')
      expect(failUpdate.args[0]).toMatchObject({ attempts: 2, last_error: 'HTTP 500' })
      expect(failUpdate.args[0].next_attempt_at).toEqual(expect.any(String))
    })

    it('marca como failed_permanent após atingir o teto de tentativas', async () => {
      mockState.safeFetch = vi.fn().mockRejectedValue(new Error('timeout'))
      setSupabase({
        webhook_deliveries: [
          { data: [{ id: 'd1', tenant_id: 'tenant-1', endpoint_id: 'e1', event_type: 'lead.created', payload: {}, attempts: 4 }], error: null },
        ],
        webhook_endpoints: [{ data: [{ url: 'https://ex.com/hook', secret: 'x', active: true }], error: null }],
      })
      await deliverPendingWebhooks()
      const failUpdate = updateCallsFor('webhook_deliveries').find((c) => c.args[0].status === 'failed_permanent')
      expect(failUpdate.args[0]).toMatchObject({ attempts: 5, last_error: 'timeout', next_attempt_at: null })
    })
  })
})
