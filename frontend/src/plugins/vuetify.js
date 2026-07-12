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
  // alinha o estado "mobile" interno do Vuetify (v-navigation-drawer, v-data-table
  // etc.) com a convenção de breakpoint já usada manualmente no projeto
  // (isMobile = window.innerWidth < 768, ver AppLayout/ChatView) em vez do
  // default do Vuetify (960px / breakpoint "md").
  display: {
    mobileBreakpoint: 768,
  },
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
    // VDataTable não herda o mobileBreakpoint global sozinho (a prop tem
    // default próprio) — setar aqui faz todas as tabelas do app empilharem
    // em cards "rótulo: valor" abaixo de 768px sem tocar em cada arquivo.
    VDataTable: { mobileBreakpoint: 768 },
  },
})

export { vuetify }
export default vuetify
