import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useIsMobile } from '../useIsMobile'

function mountWithHook() {
  let exposedIsMobile
  const wrapper = mount(defineComponent({
    setup() {
      const { isMobile } = useIsMobile()
      exposedIsMobile = isMobile
      return () => h('div', String(isMobile.value))
    },
  }))
  return { wrapper, get isMobile() { return exposedIsMobile } }
}

function setInnerWidth(width) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

describe('useIsMobile', () => {
  afterEach(() => setInnerWidth(1024))

  it('começa como true quando a largura inicial é menor que 768px', () => {
    setInnerWidth(375)
    const { isMobile } = mountWithHook()
    expect(isMobile.value).toBe(true)
  })

  it('começa como false quando a largura inicial é maior ou igual a 768px', () => {
    setInnerWidth(1024)
    const { isMobile } = mountWithHook()
    expect(isMobile.value).toBe(false)
  })

  it('atualiza ao redimensionar a janela', async () => {
    setInnerWidth(1024)
    const { isMobile } = mountWithHook()
    expect(isMobile.value).toBe(false)

    setInnerWidth(500)
    window.dispatchEvent(new Event('resize'))
    expect(isMobile.value).toBe(true)
  })

  it('remove o listener de resize ao desmontar', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { wrapper } = mountWithHook()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    removeSpy.mockRestore()
  })
})
