import { describe, it, expect, vi } from 'vitest'
import { requestId } from '../requestId.js'

function makeReq(headers = {}) {
  return { headers }
}
function makeRes() {
  const res = { headers: {} }
  res.setHeader = vi.fn((k, v) => { res.headers[k] = v })
  return res
}

describe('middleware/requestId', () => {
  it('gera um UUID, seta req.requestId e o header X-Request-Id, e chama next()', () => {
    const req = makeReq()
    const res = makeRes()
    const next = vi.fn()

    requestId(req, res, next)

    expect(typeof req.requestId).toBe('string')
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('gera IDs diferentes em chamadas diferentes', () => {
    const req1 = makeReq()
    const req2 = makeReq()
    requestId(req1, makeRes(), vi.fn())
    requestId(req2, makeRes(), vi.fn())
    expect(req1.requestId).not.toBe(req2.requestId)
  })

  it('reaproveita X-Request-Id vindo de um proxy reverso em vez de gerar um novo', () => {
    const req = makeReq({ 'x-request-id': 'from-nginx-123' })
    const res = makeRes()
    requestId(req, res, vi.fn())
    expect(req.requestId).toBe('from-nginx-123')
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'from-nginx-123')
  })

  it('ignora um X-Request-Id vazio/em branco e gera um novo', () => {
    const req = makeReq({ 'x-request-id': '   ' })
    const res = makeRes()
    requestId(req, res, vi.fn())
    expect(req.requestId.trim().length).toBeGreaterThan(0)
    expect(req.requestId).not.toBe('   ')
  })
})
