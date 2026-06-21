import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import { applyTheme } from './themes'
import './assets/main.css'

// aplica as variáveis CSS do tema salvo antes de montar
applyTheme(localStorage.getItem('sdr_theme') || 'night')

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(vuetify)
app.mount('#app')
