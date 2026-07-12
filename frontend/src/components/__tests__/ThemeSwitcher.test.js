import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { nextTick } from 'vue'
import ThemeSwitcher from '../ThemeSwitcher.vue'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockThemeStore = reactive({ current: 'night', apply: vi.fn() })
mockThemeStore.apply.mockImplementation((key) => { mockThemeStore.current = key })

vi.mock('@/stores/theme', () => ({
  useThemeStore: () => mockThemeStore,
}))

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    mockThemeStore.current = 'night'
    mockThemeStore.apply.mockClear()
  })

  it('renderiza o botão ativador de troca de tema', () => {
    const wrapper = mount(ThemeSwitcher, pluginOptions())
    expect(wrapper.find('button[title="Trocar tema"]').exists()).toBe(true)
  })

  it('abre o menu e lista os temas ao clicar no ativador', async () => {
    const wrapper = mount(ThemeSwitcher, { attachTo: document.body, ...pluginOptions() })
    await wrapper.find('button[title="Trocar tema"]').trigger('click')
    await nextTick()

    expect(document.body.textContent).toContain('Night')
    expect(document.body.textContent).toContain('Dracula')
    wrapper.unmount()
  })

  it('chama themeStore.apply com a chave do tema selecionado', async () => {
    const wrapper = mount(ThemeSwitcher, { attachTo: document.body, ...pluginOptions() })
    await wrapper.find('button[title="Trocar tema"]').trigger('click')
    await nextTick()

    const draculaBtn = [...document.body.querySelectorAll('.ts-item')].find((el) => el.textContent.includes('Dracula'))
    draculaBtn.click()
    await nextTick()

    expect(mockThemeStore.apply).toHaveBeenCalledWith('dracula')
    wrapper.unmount()
  })

  it('marca o tema atual como ativo (ícone de check)', async () => {
    mockThemeStore.current = 'dracula'
    const wrapper = mount(ThemeSwitcher, { attachTo: document.body, ...pluginOptions() })
    await wrapper.find('button[title="Trocar tema"]').trigger('click')
    await nextTick()

    const activeItem = [...document.body.querySelectorAll('.ts-item.active')]
    expect(activeItem.some((el) => el.textContent.includes('Dracula'))).toBe(true)
    wrapper.unmount()
  })
})
