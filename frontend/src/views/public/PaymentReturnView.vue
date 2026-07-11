<template>
  <div class="pr-bg">
    <div class="pr-card">
      <template v-if="status === 'checking' || status === 'pending'">
        <v-progress-circular indeterminate size="48" width="3" color="#8B5CF6" class="pr-spinner" />
        <h2 class="pr-title">Confirmando seu pagamento…</h2>
        <p class="pr-text">
          Isso costuma levar só alguns segundos. Não feche esta página.
        </p>
      </template>

      <template v-else-if="status === 'paid'">
        <div class="pr-icon pr-icon-success"><v-icon icon="mdi-check-bold" size="28" color="white" /></div>
        <h2 class="pr-title">Pagamento confirmado!</h2>
        <p class="pr-text">Redirecionando para a configuração da sua conta…</p>
      </template>

      <template v-else>
        <div class="pr-icon pr-icon-warn"><v-icon icon="mdi-clock-alert-outline" size="26" color="white" /></div>
        <h2 class="pr-title">Ainda confirmando</h2>
        <p class="pr-text">
          Seu pagamento pode já ter sido aprovado, mas a confirmação está demorando mais que o normal.
          Tente verificar novamente ou fale com o suporte se o problema persistir.
        </p>
        <button class="pr-btn" @click="startPolling">
          <v-icon icon="mdi-refresh" size="16" />
          Verificar novamente
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const status = ref('checking') // checking | pending | paid | timeout
const orderNsu = route.query.order_nsu

let pollTimer = null
let timeoutTimer = null

async function poll() {
  if (!orderNsu) { status.value = 'timeout'; return }
  try {
    const data = await api.getOrderStatus(orderNsu)
    if (data.status === 'paid') {
      status.value = 'paid'
      auth.hydrate(data.user)
      clearInterval(pollTimer)
      clearTimeout(timeoutTimer)
      setTimeout(() => router.push('/onboarding'), 1200)
    } else {
      status.value = 'pending'
    }
  } catch {
    // pedido ainda pode não ter recebido o webhook — segue tentando até o timeout
  }
}

function startPolling() {
  status.value = 'checking'
  poll()
  clearInterval(pollTimer)
  pollTimer = setInterval(poll, 3000)
  clearTimeout(timeoutTimer)
  timeoutTimer = setTimeout(() => {
    clearInterval(pollTimer)
    if (status.value !== 'paid') status.value = 'timeout'
  }, 60000)
}

onMounted(startPolling)
onUnmounted(() => { clearInterval(pollTimer); clearTimeout(timeoutTimer) })
</script>

<style scoped>
.pr-bg {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background:
    radial-gradient(900px 500px at 85% -10%, var(--glow-1), transparent 60%),
    radial-gradient(700px 400px at -5% 110%, var(--glow-2), transparent 60%),
    var(--app-bg);
  padding: 24px;
}
.pr-card {
  width: 420px; max-width: 100%; text-align: center;
  background: rgba(13,17,23,0.85); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px; padding: 44px 32px; backdrop-filter: blur(20px);
}
.pr-spinner { margin-bottom: 20px; }
.pr-icon {
  width: 56px; height: 56px; border-radius: 16px; margin: 0 auto 20px;
  display: flex; align-items: center; justify-content: center;
}
.pr-icon-success { background: linear-gradient(135deg, #10B981, #059669); }
.pr-icon-warn { background: linear-gradient(135deg, #F59E0B, #D97706); }
.pr-title { font-size: 18px; font-weight: 700; color: #F1F5F9; margin: 0 0 8px; }
.pr-text { font-size: 13.5px; color: #9FB0BC; line-height: 1.6; margin: 0; }
.pr-btn {
  display: inline-flex; align-items: center; gap: 8px; margin-top: 20px;
  padding: 11px 20px; border: none; border-radius: 11px; cursor: pointer;
  font-size: 13.5px; font-weight: 700; color: white;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
}
</style>
