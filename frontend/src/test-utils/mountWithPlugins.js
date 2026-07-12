import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createRouter, createMemoryHistory } from 'vue-router'

const DummyView = { template: '<div />' }

/**
 * Opções globais padrão (Vuetify + Vue Router) para montar componentes que
 * usam <v-*> e/ou router-link/useRouter nos testes. Passe extras via `overrides`
 * (ex.: `{ plugins: [pinia] }`) — mescladas por cima dos defaults.
 */
export function pluginOptions(overrides = {}) {
  const vuetify = createVuetify({ components, directives })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: DummyView },
      { path: '/chat', component: DummyView },
      { path: '/chat/:id', component: DummyView },
    ],
  })

  const { plugins: extraPlugins = [], ...rest } = overrides
  return {
    global: {
      plugins: [vuetify, router, ...extraPlugins],
      ...rest,
    },
  }
}
