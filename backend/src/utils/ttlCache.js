// Cache TTL simples em memória de processo, compartilhado por quem precisar
// (orchestrator.js, services/whatsapp/*) — reduz queries repetidas ao Supabase
// para dados que mudam raramente (config de tenant, status de canal).
const _cache = new Map()

export function ttlGet(key, ttlSec, fn) {
  const now = Date.now()
  const hit = _cache.get(key)
  if (hit && hit.exp > now) return Promise.resolve(hit.val)
  return Promise.resolve(fn()).then((val) => {
    _cache.set(key, { val, exp: now + ttlSec * 1000 })
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
