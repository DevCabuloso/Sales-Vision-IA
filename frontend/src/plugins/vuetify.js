import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import { THEMES } from '@/themes'

const vuetifyThemes = {}
Object.entries(THEMES).forEach(([key, t]) => {
  vuetifyThemes[key] = {
    dark: t.dark,
    colors: t.colors,
    variables: {
      'border-color': t.css['--glass-border'],
      'border-opacity': 1,
    },
  }
})

const savedTheme = localStorage.getItem('sdr_theme') || 'night'

const vuetify = createVuetify({
  theme: {
    defaultTheme: savedTheme,
    themes: vuetifyThemes,
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  defaults: {
    VCard:      { rounded: 'lg', flat: true },
    VBtn:       { rounded: 'lg', class: 'text-none', style: 'font-weight:600;letter-spacing:.2px' },
    VTextField: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VSelect:    { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VChip:      { rounded: 'md' },
    // transição própria (mais suave/lenta que o dialog-transition padrão do Vuetify) —
    // ver .dialog-fluid-* em assets/main.css
    VDialog:    { transition: 'dialog-fluid' },
  },
})

export { vuetify }
export default vuetify
