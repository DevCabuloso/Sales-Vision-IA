import { describe, it, expect } from 'vitest'
import { messages } from '../index.js'

function leafPaths(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, val]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (val && typeof val === 'object' && !Array.isArray(val)) return leafPaths(val, path)
    return [path]
  })
}

describe('locales/index.js — consistência entre idiomas', () => {
  const locales = Object.keys(messages)

  it('expõe pt-BR, en-US e es-ES', () => {
    expect(locales.sort()).toEqual(['en-US', 'es-ES', 'pt-BR'])
  })

  it('todos os idiomas têm exatamente o mesmo conjunto de chaves (folhas)', () => {
    const paths = Object.fromEntries(locales.map((l) => [l, leafPaths(messages[l]).sort()]))
    const reference = paths['pt-BR']
    for (const l of locales) {
      expect(paths[l], `chaves de ${l} não batem com pt-BR`).toEqual(reference)
    }
  })

  it('nenhuma tradução está vazia ou ausente em nenhum idioma', () => {
    for (const l of locales) {
      for (const path of leafPaths(messages[l])) {
        const value = path.split('.').reduce((cur, p) => cur?.[p], messages[l])
        expect(typeof value, `${l}.${path} deveria ser string`).toBe('string')
        expect(value.trim().length, `${l}.${path} está vazio`).toBeGreaterThan(0)
      }
    }
  })
})
