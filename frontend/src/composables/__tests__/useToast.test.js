import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useToast } from '../useToast.js'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('success/error/info/warning exibem a mensagem com a cor correta', () => {
    const { state, success, error, info, warning } = useToast()

    success('deu certo')
    expect(state.show).toBe(true)
    expect(state.text).toBe('deu certo')
    expect(state.color).toBe('success')

    error('deu ruim')
    expect(state.text).toBe('deu ruim')
    expect(state.color).toBe('error')

    info('fica sabendo')
    expect(state.color).toBe('info')

    warning('cuidado')
    expect(state.color).toBe('warning')
  })

  it('esconde o toast automaticamente após 3500ms', () => {
    const { state, success } = useToast()
    success('some depois')
    expect(state.show).toBe(true)

    vi.advanceTimersByTime(3499)
    expect(state.show).toBe(true)

    vi.advanceTimersByTime(1)
    expect(state.show).toBe(false)
  })

  it('reinicia o timer se um novo toast aparece antes do anterior sumir', () => {
    const { state, success } = useToast()
    success('primeiro')
    vi.advanceTimersByTime(3000)
    success('segundo')
    vi.advanceTimersByTime(3000)

    // já passaram 6000ms no total, mas o timer do "segundo" só completa aos 3500ms dele
    expect(state.show).toBe(true)
    expect(state.text).toBe('segundo')

    vi.advanceTimersByTime(500)
    expect(state.show).toBe(false)
  })
})
