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

const { getOrCreateChannelWebhookSecret, matchTenantWebhookSecret, matchInstanceWebhookSecret } = await import('../channelWebhookSecret.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

describe('utils/channelWebhookSecret', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('getOrCreateChannelWebhookSecret', () => {
    it('retorna o segredo já existente sem gravar nada', async () => {
      setSupabase({ channels: [{ data: [{ webhook_secret: 'ja-existe' }], error: null }] })
      const secret = await getOrCreateChannelWebhookSecret('ch1')
      expect(secret).toBe('ja-existe')
      expect(supabaseMock.calls.filter((c) => c.method === 'update')).toHaveLength(0)
    })

    it('gera e persiste um novo segredo quando o canal ainda não tem um', async () => {
      setSupabase({ channels: [{ data: [{ webhook_secret: null }], error: null }, { data: null, error: null }] })
      const secret = await getOrCreateChannelWebhookSecret('ch1')
      expect(typeof secret).toBe('string')
      expect(secret.length).toBeGreaterThan(10)
      const updateCall = supabaseMock.calls.find((c) => c.method === 'update')
      expect(updateCall.args[0]).toEqual({ webhook_secret: secret })
    })
  })

  describe('matchTenantWebhookSecret', () => {
    it('retorna "none-set" quando nenhum canal do tenant tem segredo próprio', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      expect(await matchTenantWebhookSecret('tenant-1', 'qualquer')).toBe('none-set')
    })

    it('retorna "none-set" quando a query devolve null (tabela sem resposta configurada)', async () => {
      setSupabase({})
      expect(await matchTenantWebhookSecret('tenant-1', 'qualquer')).toBe('none-set')
    })

    it('retorna "match" quando o segredo informado bate com o de algum canal do tenant', async () => {
      setSupabase({ channels: [{ data: [{ webhook_secret: 'segredo-a' }, { webhook_secret: 'segredo-b' }], error: null }] })
      expect(await matchTenantWebhookSecret('tenant-1', 'segredo-b')).toBe('match')
    })

    it('retorna "mismatch" quando o tenant tem segredo(s) próprio(s) mas nenhum bate', async () => {
      setSupabase({ channels: [{ data: [{ webhook_secret: 'segredo-a' }], error: null }] })
      expect(await matchTenantWebhookSecret('tenant-1', 'errado')).toBe('mismatch')
    })
  })

  describe('matchInstanceWebhookSecret', () => {
    it('retorna "none-set" quando a instância não tem segredo próprio', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      expect(await matchInstanceWebhookSecret('inst-1', 'qualquer')).toBe('none-set')
    })

    it('retorna "match" quando o segredo bate', async () => {
      setSupabase({ channels: [{ data: [{ webhook_secret: 'segredo-x' }], error: null }] })
      expect(await matchInstanceWebhookSecret('inst-1', 'segredo-x')).toBe('match')
    })

    it('retorna "mismatch" quando a instância tem segredo próprio mas não bate', async () => {
      setSupabase({ channels: [{ data: [{ webhook_secret: 'segredo-x' }], error: null }] })
      expect(await matchInstanceWebhookSecret('inst-1', 'errado')).toBe('mismatch')
    })
  })
})
