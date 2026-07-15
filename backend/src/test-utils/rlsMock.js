import { vi } from 'vitest'

/**
 * Mock mínimo de db/rls.js (withTenant + client pg) usado pelos testes de
 * rotas que já migraram pro client escopado por RLS (ver migration_rls.sql).
 * Fila FIFO global de respostas ({ rows } ou { error }) consumida a cada
 * `client.query(...)` awaited, na mesma ordem das chamadas no código sob
 * teste — diferente do supabaseMock.js (que enfileira por tabela), aqui
 * é só por ordem de chamada porque a query já é SQL bruto.
 */
export function createRlsMock() {
  const queue = []
  const calls = []

  const client = {
    query: vi.fn((sql, params) => {
      calls.push({ sql, params })
      const next = queue.shift()
      if (!next) return Promise.resolve({ rows: [], rowCount: 0 })
      if (next.error) return Promise.reject(next.error)
      const rows = next.rows ?? []
      return Promise.resolve({ rows, rowCount: rows.length })
    }),
  }

  const withTenant = vi.fn((tenantId, fn) => fn(client))

  return {
    withTenant,
    client,
    calls,
    queueRows: (rows) => queue.push({ rows }),
    queueError: (error) => queue.push({ error }),
  }
}
