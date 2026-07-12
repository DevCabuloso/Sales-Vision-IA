import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AppToast from '../AppToast.vue'
import { useToast } from '@/composables/useToast.js'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

describe('AppToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // reseta o estado global do toast entre os testes
    useToast().state.show = false
  })

  it('não exibe nada por padrão', () => {
    const wrapper = mount(AppToast, pluginOptions())
    expect(wrapper.findComponent({ name: 'VSnackbar' }).props('modelValue')).toBe(false)
  })

  it('exibe a mensagem e a cor quando o composable useToast dispara um toast', async () => {
    const wrapper = mount(AppToast, { attachTo: document.body, ...pluginOptions() })
    const { success } = useToast()
    success('Salvo com sucesso!')
    await nextTick()

    const snackbar = wrapper.findComponent({ name: 'VSnackbar' })
    expect(snackbar.props('modelValue')).toBe(true)
    expect(snackbar.props('color')).toBe('success')
    // o VSnackbar é teleportado para document.body — não é filho do wrapper montado
    expect(document.body.textContent).toContain('Salvo com sucesso!')
    wrapper.unmount()
  })

  it('exibe erro com a cor correta', async () => {
    const wrapper = mount(AppToast, { attachTo: document.body, ...pluginOptions() })
    useToast().error('Algo deu errado')
    await nextTick()
    const snackbar = wrapper.findComponent({ name: 'VSnackbar' })
    expect(snackbar.props('color')).toBe('error')
    expect(document.body.textContent).toContain('Algo deu errado')
    wrapper.unmount()
  })
})
