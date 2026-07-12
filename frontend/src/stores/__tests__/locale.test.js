import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/locales/index.js', () => ({
  messages: {
    'pt-BR': { greeting: 'Olá', nested: { deep: 'Profundo' } },
    'en-US': { greeting: 'Hello', nested: { deep: 'Deep' } },
  },
}))

const { useLocaleStore } = await import('../locale.js')

describe('stores/locale.js', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('locale inicia com "pt-BR" quando não há preferência salva', () => {
    const store = useLocaleStore()
    expect(store.locale).toBe('pt-BR')
  })

  it('locale inicia com a preferência salva em localStorage', () => {
    localStorage.setItem('sdr_locale', 'en-US')
    const store = useLocaleStore()
    expect(store.locale).toBe('en-US')
  })

  it('setLocale(l) atualiza o locale e persiste quando suportado', () => {
    const store = useLocaleStore()
    store.setLocale('en-US')
    expect(store.locale).toBe('en-US')
    expect(localStorage.getItem('sdr_locale')).toBe('en-US')
  })

  it('setLocale(l) é no-op para um locale não suportado', () => {
    const store = useLocaleStore()
    store.setLocale('fr-FR')
    expect(store.locale).toBe('pt-BR')
    expect(localStorage.getItem('sdr_locale')).toBeNull()
  })

  it('t(path) resolve uma chave simples do dicionário do locale atual', () => {
    const store = useLocaleStore()
    expect(store.t('greeting')).toBe('Olá')
  })

  it('t(path) resolve uma chave aninhada por "."', () => {
    const store = useLocaleStore()
    expect(store.t('nested.deep')).toBe('Profundo')
  })

  it('t(path) troca de dicionário depois de setLocale()', () => {
    const store = useLocaleStore()
    store.setLocale('en-US')
    expect(store.t('greeting')).toBe('Hello')
  })

  it('t(path) retorna o próprio path como fallback quando a chave não existe', () => {
    const store = useLocaleStore()
    expect(store.t('chave.inexistente')).toBe('chave.inexistente')
  })
})
