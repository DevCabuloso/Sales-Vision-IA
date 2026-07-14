import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ttlGet, ttlInvalidate, ttlClearAll } from '../ttlCache.js'

describe('ttlCache', () => {
  beforeEach(() => {
    ttlClearAll()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('roda fn() na primeira chamada e cacheia o resultado', async () => {
    const fn = vi.fn().mockResolvedValue('valor-1')
    const r1 = await ttlGet('k1', 60, fn)
    const r2 = await ttlGet('k1', 60, fn)
    expect(r1).toBe('valor-1')
    expect(r2).toBe('valor-1')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('roda fn() de novo depois que o TTL expira', async () => {
    const fn = vi.fn().mockResolvedValueOnce('velho').mockResolvedValueOnce('novo')
    await ttlGet('k2', 10, fn)
    vi.advanceTimersByTime(10_001)
    const r2 = await ttlGet('k2', 10, fn)
    expect(r2).toBe('novo')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('chaves diferentes não colidem', async () => {
    const fnA = vi.fn().mockResolvedValue('a')
    const fnB = vi.fn().mockResolvedValue('b')
    await ttlGet('key-a', 60, fnA)
    await ttlGet('key-b', 60, fnB)
    expect(fnA).toHaveBeenCalledTimes(1)
    expect(fnB).toHaveBeenCalledTimes(1)
  })

  it('não cacheia quando fn() rejeita — próxima chamada tenta de novo', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('falhou')).mockResolvedValueOnce('ok-depois')
    await expect(ttlGet('k3', 60, fn)).rejects.toThrow('falhou')
    const r2 = await ttlGet('k3', 60, fn)
    expect(r2).toBe('ok-depois')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('ttlInvalidate força fn() a rodar de novo antes do TTL expirar', async () => {
    const fn = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')
    await ttlGet('k4', 300, fn)
    ttlInvalidate('k4')
    const r2 = await ttlGet('k4', 300, fn)
    expect(r2).toBe('v2')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('faz eviction das entradas mais antigas quando passa do limite de tamanho (evita crescimento sem limite)', async () => {
    // MAX_ENTRIES = 5000 (não exportado) — preenche além disso e confirma que
    // as primeiras chaves inseridas (as mais antigas) foram removidas, mas as
    // mais recentes continuam servidas do cache sem rechamar fn().
    for (let i = 0; i < 5010; i++) {
      await ttlGet(`bulk-${i}`, 300, () => Promise.resolve(i))
    }

    const fnOld = vi.fn().mockResolvedValue('recalculado')
    await ttlGet('bulk-0', 300, fnOld)
    expect(fnOld).toHaveBeenCalledTimes(1) // foi evictado, precisou recalcular

    const fnRecent = vi.fn().mockResolvedValue('nao-deveria-rodar')
    await ttlGet('bulk-5009', 300, fnRecent)
    expect(fnRecent).not.toHaveBeenCalled() // ainda em cache
  })

  it('prioriza remover entradas já expiradas antes de remover entradas válidas mais antigas', async () => {
    await ttlGet('expira-logo', 5, () => Promise.resolve('x'))
    vi.advanceTimersByTime(5_001) // expira essa chave, mas ela continua ocupando espaço no Map

    for (let i = 0; i < 5010; i++) {
      await ttlGet(`bulk2-${i}`, 300, () => Promise.resolve(i))
    }

    const fnRecent = vi.fn().mockResolvedValue('nao-deveria-rodar')
    await ttlGet('bulk2-5009', 300, fnRecent)
    expect(fnRecent).not.toHaveBeenCalled() // a chave expirada foi limpa primeiro, preservando as válidas recentes
  })
})
