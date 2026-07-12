import { describe, it, expect } from 'vitest'
import { assertSingleInstance } from '../utils/assertSingleInstance.js'

describe('assertSingleInstance', () => {
  it('não lança quando NODE_APP_INSTANCE não está definido (fork mode local/dev, sem PM2)', () => {
    expect(() => assertSingleInstance({})).not.toThrow()
  })

  it('não lança quando NODE_APP_INSTANCE é "0" (única instância PM2)', () => {
    expect(() => assertSingleInstance({ NODE_APP_INSTANCE: '0' })).not.toThrow()
  })

  it('lança quando NODE_APP_INSTANCE é "1" (segunda instância PM2 — cache em memória divergiria)', () => {
    expect(() => assertSingleInstance({ NODE_APP_INSTANCE: '1' })).toThrow(/NODE_APP_INSTANCE=1/)
  })

  it('lança quando NODE_APP_INSTANCE é qualquer valor diferente de "0"', () => {
    expect(() => assertSingleInstance({ NODE_APP_INSTANCE: '3' })).toThrow(/orchestrator/)
  })
})
