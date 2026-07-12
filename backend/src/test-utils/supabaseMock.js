import { vi } from 'vitest'

const CHAIN_METHODS = [
  'select', 'insert', 'update', 'upsert', 'delete',
  'eq', 'neq', 'like', 'ilike', 'gte', 'lte', 'gt', 'lt', 'limit', 'order', 'range',
  'single', 'maybeSingle', 'in', 'not', 'overlaps', 'contains', 'is', 'or',
]

/**
 * Mock mínimo do client supabase-js usado pelos testes.
 * Cada tabela tem uma fila FIFO de respostas ({ data, error }) consumida a
 * cada `.from(table)` awaited — a ordem deve seguir a ordem real das
 * chamadas no código sob teste. Chamadas sem resposta enfileirada caem no
 * default `{ data: null, error: null }`.
 */
export function createSupabaseMock(responses = {}) {
  const consumedIndex = {}
  const calls = []

  function nextFor(table) {
    const queue = responses[table]
    if (!queue || !queue.length) return { data: null, error: null }
    const idx = consumedIndex[table] || 0
    consumedIndex[table] = idx + 1
    return queue[Math.min(idx, queue.length - 1)]
  }

  function makeChain(table) {
    const chain = {}
    for (const method of CHAIN_METHODS) {
      chain[method] = vi.fn((...args) => {
        calls.push({ table, method, args })
        return chain
      })
    }
    chain.then = (resolve, reject) => Promise.resolve(nextFor(table)).then(resolve, reject)
    chain.catch = (reject) => Promise.resolve(nextFor(table)).catch(reject)
    return chain
  }

  const from = vi.fn((table) => makeChain(table))
  const rpc = vi.fn((name, args) => {
    calls.push({ table: `rpc:${name}`, method: 'rpc', args: [args] })
    return makeChain(`rpc:${name}`)
  })
  return { supabase: { from, rpc }, calls }
}

export function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}
