import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, encrypt: null, decryptJSON: null }))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../crypto.js', () => ({
  encrypt: (...args) => mockState.encrypt(...args),
  decryptJSON: (...args) => mockState.decryptJSON(...args),
}))

const { getCredentials, saveCredentials, disconnectProvider } = await import('../integrations.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function updateCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update') }
function upsertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'upsert') }

describe('services/integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.encrypt = vi.fn((v) => `enc(${JSON.stringify(v)})`)
    mockState.decryptJSON = vi.fn((v) => ({ decrypted: v }))
  })

  describe('getCredentials', () => {
    it('retorna null quando não há integração para o provider', async () => {
      setSupabase({ integrations: [{ data: [], error: null }] })
      const result = await getCredentials('tenant-1', 'evolution')
      expect(result).toBeNull()
    })

    it('retorna null quando a integração existe mas não está "connected"', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc-x', meta: {}, status: 'disconnected' }], error: null }] })
      const result = await getCredentials('tenant-1', 'evolution')
      expect(result).toBeNull()
    })

    it('descriptografa as credenciais e retorna meta quando conectado', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc-blob', meta: { instance: 'x' }, status: 'connected' }], error: null }] })
      const result = await getCredentials('tenant-1', 'evolution')
      expect(mockState.decryptJSON).toHaveBeenCalledWith('enc-blob')
      expect(result).toEqual({ credentials: { decrypted: 'enc-blob' }, meta: { instance: 'x' } })
    })

    it('usa objeto vazio como meta quando a integração não tem meta salva', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc-blob', meta: null, status: 'connected' }], error: null }] })
      const result = await getCredentials('tenant-1', 'evolution')
      expect(result.meta).toEqual({})
    })
  })

  describe('saveCredentials', () => {
    it('criptografa as credenciais e faz upsert com status connected', async () => {
      setSupabase({ integrations: [{ data: {}, error: null }] })
      const result = await saveCredentials('tenant-1', 'evolution', { apiKey: 'segredo' }, { instance: 'x' })

      expect(result).toEqual({ connected: true })
      const upsert = upsertCallsFor('integrations')[0]
      expect(upsert.args[0]).toMatchObject({ tenant_id: 'tenant-1', provider: 'evolution', status: 'connected', meta: { instance: 'x' } })
      expect(upsert.args[0].credentials).toBe(mockState.encrypt.mock.results[0].value)
      expect(mockState.encrypt).toHaveBeenCalledWith({ apiKey: 'segredo' })
    })

    it('propaga o erro quando o upsert falha', async () => {
      setSupabase({ integrations: [{ data: null, error: { message: 'violação de unicidade' } }] })
      await expect(saveCredentials('tenant-1', 'evolution', {})).rejects.toThrow('violação de unicidade')
    })
  })

  describe('disconnectProvider', () => {
    it('marca a integração como desconectada e limpa as credenciais', async () => {
      setSupabase({ integrations: [{ data: {}, error: null }] })
      const result = await disconnectProvider('tenant-1', 'evolution')
      expect(result).toEqual({ disconnected: true })
      const update = updateCallsFor('integrations')[0]
      expect(update.args[0]).toMatchObject({ status: 'disconnected', credentials: null })
    })
  })
})
