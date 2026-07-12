import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockState = vi.hoisted(() => ({ applyTheme: vi.fn(), change: vi.fn() }))

vi.mock('@/themes', () => ({
  applyTheme: (...a) => mockState.applyTheme(...a),
  THEMES: { night: {}, dracula: {} },
}))

vi.mock('@/plugins/vuetify', () => ({
  vuetify: { theme: { change: (...a) => mockState.change(...a) } },
}))

const { useThemeStore } = await import('../theme.js')

describe('stores/theme.js', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockState.applyTheme.mockClear()
    mockState.change.mockClear()
  })

  it('current inicia com "night" quando não há tema salvo', () => {
    const store = useThemeStore()
    expect(store.current).toBe('night')
  })

  it('current inicia com o tema salvo em localStorage, se houver', () => {
    localStorage.setItem('sdr_theme', 'dracula')
    const store = useThemeStore()
    expect(store.current).toBe('dracula')
  })

  it('apply(key) aplica o tema, atualiza o vuetify e persiste em localStorage', () => {
    const store = useThemeStore()
    store.apply('dracula')
    expect(mockState.applyTheme).toHaveBeenCalledWith('dracula')
    expect(mockState.change).toHaveBeenCalledWith('dracula')
    expect(store.current).toBe('dracula')
    expect(localStorage.getItem('sdr_theme')).toBe('dracula')
  })

  it('apply(key) não faz nada para uma chave de tema desconhecida', () => {
    const store = useThemeStore()
    store.apply('tema-inexistente')
    expect(mockState.applyTheme).not.toHaveBeenCalled()
    expect(mockState.change).not.toHaveBeenCalled()
    expect(store.current).toBe('night')
  })

  it('init() aplica o tema atual sem alterar localStorage', () => {
    localStorage.setItem('sdr_theme', 'dracula')
    const store = useThemeStore()
    store.init()
    expect(mockState.applyTheme).toHaveBeenCalledWith('dracula')
    expect(mockState.change).toHaveBeenCalledWith('dracula')
  })
})
