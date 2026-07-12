import { describe, it, expect, beforeEach } from 'vitest'
import { applyTheme, THEMES, THEME_GROUPS } from '../themes.js'

describe('themes.js — applyTheme()', () => {
  beforeEach(() => {
    const root = document.documentElement
    ;[...root.style].forEach((prop) => root.style.removeProperty(prop))
    root.removeAttribute('data-theme-dark')
  })

  it('não faz nada para uma chave de tema desconhecida', () => {
    applyTheme('tema-que-nao-existe')
    expect(document.documentElement.getAttribute('data-theme-dark')).toBeNull()
  })

  it('aplica as custom properties CSS do tema e marca data-theme-dark=1 para tema escuro', () => {
    applyTheme('night')
    const root = document.documentElement
    expect(root.getAttribute('data-theme-dark')).toBe('1')
    expect(root.style.getPropertyValue('--app-bg')).toBe(THEMES.night.css['--app-bg'])
    expect(root.style.getPropertyValue('--glass-border')).toBe(THEMES.night.css['--glass-border'])
    // extras de tema escuro
    expect(root.style.getPropertyValue('--text-primary')).toBe('#F1F5F9')
  })

  it('marca data-theme-dark=0 e usa as extras de tema claro para um tema claro', () => {
    applyTheme('corporate')
    const root = document.documentElement
    expect(root.getAttribute('data-theme-dark')).toBe('0')
    expect(root.style.getPropertyValue('--app-bg')).toBe(THEMES.corporate.css['--app-bg'])
    expect(root.style.getPropertyValue('--text-primary')).toBe('#0F172A')
  })

  it('as css props específicas do tema sobrescrevem as extras genéricas quando há conflito', () => {
    // 'cyberpunk' (claro) redefine --border-subtle no seu próprio css, diferente do LIGHT_EXTRA padrão
    applyTheme('cyberpunk')
    const root = document.documentElement
    expect(root.style.getPropertyValue('--border-subtle')).toBe(THEMES.cyberpunk.css['--border-subtle'])
  })

  it('THEME_GROUPS cobre exatamente todas as chaves de THEMES, sem repetição', () => {
    // Nota: "Escuro"/"Claro" aqui é uma categorização de UI (menu de seleção de tema),
    // não estritamente o campo t.dark — ex.: 'cyberpunk' tem dark:false mas está em Escuro.
    const allGrouped = [...THEME_GROUPS.Escuro, ...THEME_GROUPS.Claro]
    expect(allGrouped.sort()).toEqual(Object.keys(THEMES).sort())
    expect(new Set(allGrouped).size).toBe(allGrouped.length)
  })
})
