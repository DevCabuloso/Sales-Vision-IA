import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateClient = vi.hoisted(() => vi.fn(() => ({ from: vi.fn() })))

vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }))
vi.mock('../../config/index.js', () => ({
  config: { supabase: { url: 'https://x.supabase.co', serviceKey: 'service-key' } },
}))

describe('db/supabase.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cria o client do supabase com a url/serviceKey de config e opções corretas', async () => {
    const { supabase } = await import('../supabase.js')
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://x.supabase.co',
      'service-key',
      expect.objectContaining({
        auth: { persistSession: false, autoRefreshToken: false },
      })
    )
    expect(supabase).toBeDefined()
  })

  describe('unwrap()', () => {
    it('retorna data quando não há erro', async () => {
      const { unwrap } = await import('../supabase.js')
      expect(unwrap({ data: { id: 1 }, error: null })).toEqual({ id: 1 })
    })

    it('lança erro com a mensagem do supabase quando error presente', async () => {
      const { unwrap } = await import('../supabase.js')
      expect(() => unwrap({ data: null, error: { message: 'falhou' } })).toThrow('falhou')
    })
  })
})

describe('db/supabase.js — sem SUPABASE_URL/SERVICE_KEY', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('avisa no console quando config.supabase.url/serviceKey estão ausentes', async () => {
    vi.doMock('../../config/index.js', () => ({
      config: { supabase: { url: '', serviceKey: '' } },
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await import('../supabase.js')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SUPABASE_URL'))
  })
})
