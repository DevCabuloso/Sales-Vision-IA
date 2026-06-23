import { defineStore } from 'pinia'
import { ref } from 'vue'
import { applyTheme, THEMES } from '@/themes'
import { vuetify } from '@/plugins/vuetify'

const STORAGE_KEY = 'sdr_theme'

export const useThemeStore = defineStore('theme', () => {
  const current = ref(localStorage.getItem(STORAGE_KEY) || 'night')

  function apply(key) {
    if (!THEMES[key]) return
    applyTheme(key)
    vuetify.theme.change(key)
    current.value = key
    localStorage.setItem(STORAGE_KEY, key)
  }

  function init() {
    applyTheme(current.value)
    vuetify.theme.change(current.value)
  }

  return { current, apply, init }
})
