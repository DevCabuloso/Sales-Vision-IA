// Cache TTL simples em memória de processo, compartilhado por quem precisar
// (orchestrator.js, services/whatsapp/*) — reduz queries repetidas ao Supabase
// para dados que mudam raramente (config de tenant, status de canal).
const _cache = new Map()

// Sem isso, o Map cresce monotonicamente com o número de chaves distintas já
// usadas (uma por tenant por prefixo) ao longo da vida do processo PM2 — que
// não reinicia com frequência — já que entradas expiradas só eram
// sobrescritas se a MESMA chave fosse buscada de novo, nunca removidas.
const MAX_ENTRIES = 5000

function evictIfNeeded() {
  if (_cache.size <= MAX_ENTRIES) return
  const now = Date.now()
  for (const [key, entry] of _cache) {
    if (entry.exp <= now) _cache.delete(key)
  }
  if (_cache.size <= MAX_ENTRIES) return
  // ainda grande demais mesmo depois de tirar as expiradas — remove as mais
  // antigas por inserção (Map preserva ordem de inserção em JS).
  const excess = _cache.size - MAX_ENTRIES
  let i = 0
  for (const key of _cache.keys()) {
    if (i++ >= excess) break
    _cache.delete(key)
  }
}

export function ttlGet(key, ttlSec, fn) {
  const now = Date.now()
  const hit = _cache.get(key)
  if (hit && hit.exp > now) return Promise.resolve(hit.val)
  return Promise.resolve(fn()).then((val) => {
    _cache.set(key, { val, exp: now + ttlSec * 1000 })
    evictIfNeeded()
    return val
  })
}

export function ttlInvalidate(key) {
  _cache.delete(key)
}

// Só pra testes: o Map é module-level (compartilhado pelo processo todo), então
// testes que reusam o mesmo tenantId/key entre "it"s diferentes precisam limpar
// o cache no beforeEach pra não vazar valor de um teste pro outro.
export function ttlClearAll() {
  _cache.clear()
}
