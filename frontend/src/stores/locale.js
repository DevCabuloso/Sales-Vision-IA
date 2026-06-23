import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { messages } from '@/locales/index.js'

const LOCALE_KEY = 'sdr_locale'
const SUPPORTED   = ['pt-BR', 'en-US', 'es-ES']
const DEFAULT     = 'pt-BR'

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref(localStorage.getItem(LOCALE_KEY) || DEFAULT)

  function setLocale(l) {
    if (!SUPPORTED.includes(l)) return
    locale.value = l
    localStorage.setItem(LOCALE_KEY, l)
  }

  const dict = computed(() => messages[locale.value] || messages[DEFAULT])

  function t(path) {
    const parts = path.split('.')
    let cur = dict.value
    for (const p of parts) { cur = cur?.[p] }
    return cur ?? path
  }

  return { locale, setLocale, t }
})
