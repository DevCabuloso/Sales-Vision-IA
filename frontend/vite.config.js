import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    open: true,
    host: true,
    port: 5173,
    proxy: {
      // regex (não string) para não casar por prefixo com rotas do SPA como
      // /apis (Custom APIs) — '/api' como chave de string do Vite faz match
      // por prefixo e proxyava /apis inteiro pro backend, que devolvia 404
      // cru em vez de renderizar a view (só afeta navegação direta/refresh,
      // já que roteamento client-side do Vue Router não passa pelo Vite).
      '^/api(/|$)': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-vuetify': ['vuetify'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
