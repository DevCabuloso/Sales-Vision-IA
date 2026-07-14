import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useIdleLogout } from '../useIdleLogout'

function mountWithHook(onIdle, idleMs) {
  return mount(defineComponent({
    setup() {
      useIdleLogout(onIdle, idleMs)
      return () => h('div')
    },
  }))
}

describe('useIdleLogout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('chama onIdle depois do tempo configurado sem nenhuma interação', () => {
    const onIdle = vi.fn()
    mountWithHook(onIdle, 1000)
    vi.advanceTimersByTime(999)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('reinicia o timer a cada interação do usuário (mousemove/keydown/click/scroll)', () => {
    const onIdle = vi.fn()
    mountWithHook(onIdle, 1000)

    vi.advanceTimersByTime(800)
    window.dispatchEvent(new Event('mousemove'))
    vi.advanceTimersByTime(800)
    expect(onIdle).not.toHaveBeenCalled() // ainda não passou 1000ms desde a última interação

    window.dispatchEvent(new Event('keydown'))
    vi.advanceTimersByTime(999)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('usa 30 minutos como padrão quando idleMs não é informado', () => {
    const onIdle = vi.fn()
    mountWithHook(onIdle)
    vi.advanceTimersByTime(30 * 60 * 1000 - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('para de escutar eventos e cancela o timer ao desmontar', () => {
    const onIdle = vi.fn()
    const wrapper = mountWithHook(onIdle, 1000)
    wrapper.unmount()
    vi.advanceTimersByTime(2000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})
