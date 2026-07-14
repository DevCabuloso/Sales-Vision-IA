import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockState = vi.hoisted(() => ({ dnsLookup: null }))

vi.mock('node:dns/promises', () => ({
  default: { lookup: (...args) => mockState.dnsLookup(...args) },
}))

const { assertPublicUrl, safeFetch } = await import('../ssrfGuard.js')

describe('ssrfGuard', () => {
  beforeEach(() => {
    mockState.dnsLookup = vi.fn().mockResolvedValue({ address: '93.184.216.34' })
    vi.unstubAllGlobals()
  })

  describe('assertPublicUrl', () => {
    it('permite URL pública que resolve para IP público', async () => {
      await expect(assertPublicUrl('https://api.exemplo.com/x')).resolves.toBeUndefined()
    })

    it('bloqueia hostname literal privado sem nem consultar o DNS', async () => {
      await expect(assertPublicUrl('http://127.0.0.1/x')).rejects.toThrow(/não permitido/)
      await expect(assertPublicUrl('http://192.168.0.5/x')).rejects.toThrow(/não permitido/)
      await expect(assertPublicUrl('http://localhost/x')).rejects.toThrow(/não permitido/)
      await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/não permitido/)
      expect(mockState.dnsLookup).not.toHaveBeenCalled()
    })

    it('bloqueia quando o DNS resolve pra um IP privado', async () => {
      mockState.dnsLookup.mockResolvedValue({ address: '10.0.0.5' })
      await expect(assertPublicUrl('https://interno.exemplo.com/x')).rejects.toThrow(/rede privada/)
    })

    it('bloqueia endereços IPv4 mapeados em IPv6 (bypass histórico do guard)', async () => {
      await expect(assertPublicUrl('http://[::ffff:127.0.0.1]/x')).rejects.toThrow(/não permitido/)
      await expect(assertPublicUrl('http://[::ffff:169.254.169.254]/x')).rejects.toThrow(/não permitido/)
      // new URL(...).hostname normaliza a cauda decimal-pontuada pra hex — cobre essa forma também.
      await expect(assertPublicUrl('http://[::ffff:7f00:1]/x')).rejects.toThrow(/não permitido/)
      await expect(assertPublicUrl('http://[0:0:0:0:0:ffff:127.0.0.1]/x')).rejects.toThrow(/não permitido/)
      expect(mockState.dnsLookup).not.toHaveBeenCalled()
    })

    it('bloqueia quando o DNS resolve pra um IPv4 mapeado em IPv6 privado', async () => {
      mockState.dnsLookup.mockResolvedValue({ address: '::ffff:10.0.0.5' })
      await expect(assertPublicUrl('https://interno.exemplo.com/x')).rejects.toThrow(/rede privada/)
    })

    it('continua permitindo IPv6 público legítimo', async () => {
      mockState.dnsLookup.mockResolvedValue({ address: '2001:4860:4860::8888' })
      await expect(assertPublicUrl('https://publico-v6.exemplo.com/x')).resolves.toBeUndefined()
    })

    it('rejeita protocolos que não sejam http/https', async () => {
      await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(/http\/https/)
    })

    it('não quebra quando o DNS falha (deixa o fetch falhar depois naturalmente)', async () => {
      mockState.dnsLookup.mockRejectedValue(new Error('ENOTFOUND'))
      await expect(assertPublicUrl('https://naoexiste.exemplo.com/x')).resolves.toBeUndefined()
    })
  })

  describe('safeFetch', () => {
    it('faz o fetch normalmente quando não há redirect', async () => {
      const fetchMock = vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true }))
      const resp = await safeFetch('https://api.exemplo.com/x')
      expect(resp.status).toBe(200)
      expect(fetch.mock.calls[0][0]).toBe('https://api.exemplo.com/x')
      expect(fetch.mock.calls[0][1].redirect).toBe('manual')
    })

    it('segue um redirect (302) pra outro host público e revalida o novo destino', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({ status: 302, headers: { get: () => 'https://outro-publico.com/y' } })
        .mockResolvedValueOnce({ status: 200, ok: true }))
      const resp = await safeFetch('https://api.exemplo.com/x')
      expect(resp.status).toBe(200)
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(fetch.mock.calls[1][0]).toBe('https://outro-publico.com/y')
    })

    it('bloqueia quando um redirect aponta pra IP privado (bypass via 302)', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({ status: 302, headers: { get: () => 'http://169.254.169.254/latest/meta-data' } }))
      await expect(safeFetch('https://api.exemplo.com/x')).rejects.toThrow(/não permitido/)
    })

    it('bloqueia quando o redirect resolve (via DNS) pra IP privado', async () => {
      mockState.dnsLookup
        .mockResolvedValueOnce({ address: '93.184.216.34' })
        .mockResolvedValueOnce({ address: '10.0.0.5' })
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({ status: 302, headers: { get: () => 'https://interno.exemplo.com/y' } }))
      await expect(safeFetch('https://api.exemplo.com/x')).rejects.toThrow(/rede privada/)
    })

    it('aborta depois de muitos redirects em cadeia', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        status: 302, headers: { get: () => 'https://api.exemplo.com/loop' },
      })
      vi.stubGlobal('fetch', fetchMock)
      await expect(safeFetch('https://api.exemplo.com/x')).rejects.toThrow(/redirects/)
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6)
    })

    it('converte 303 em GET sem corpo no próximo hop', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({ status: 303, headers: { get: () => 'https://api.exemplo.com/y' } })
        .mockResolvedValueOnce({ status: 200, ok: true }))
      await safeFetch('https://api.exemplo.com/x', { method: 'POST', body: '{"a":1}' })
      expect(fetch.mock.calls[1][1].method).toBe('GET')
      expect(fetch.mock.calls[1][1].body).toBeUndefined()
    })
  })
})
