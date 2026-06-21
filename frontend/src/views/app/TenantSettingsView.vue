<template>
  <div>
    <h1 class="text-h5 font-weight-bold mb-1">Configurações</h1>
    <p class="text-body-2 mb-6" style="color:#9FB0BC">Painel centralizado de configuração da sua operação</p>

    <v-row class="mb-4">
      <!-- Dados da empresa -->
      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border>
          <div class="d-flex align-center ga-3 mb-5">
            <div class="cfg-icon" style="background:linear-gradient(135deg,#6366F1,#8B5CF6)">
              <v-icon icon="mdi-domain" color="white" size="20" />
            </div>
            <span class="text-subtitle-1 font-weight-bold">Dados da Empresa</span>
          </div>
          <v-list density="compact" class="bg-transparent">
            <v-list-item class="px-0">
              <template #prepend><v-icon icon="mdi-office-building-outline" size="16" class="mr-2" /></template>
              <v-list-item-title class="text-body-2">Nome</v-list-item-title>
              <template #append><span class="text-body-2 font-weight-medium">{{ auth.user?.tenantName || '—' }}</span></template>
            </v-list-item>
            <v-list-item class="px-0">
              <template #prepend><v-icon icon="mdi-identifier" size="16" class="mr-2" /></template>
              <v-list-item-title class="text-body-2">Slug</v-list-item-title>
              <template #append><code class="text-caption" style="color:#9FB0BC">{{ auth.user?.tenantSlug || '—' }}</code></template>
            </v-list-item>
            <v-list-item class="px-0">
              <template #prepend><v-icon icon="mdi-account-outline" size="16" class="mr-2" /></template>
              <v-list-item-title class="text-body-2">Meu e-mail</v-list-item-title>
              <template #append><span class="text-body-2">{{ auth.user?.email }}</span></template>
            </v-list-item>
            <v-list-item class="px-0">
              <template #prepend><v-icon icon="mdi-shield-account-outline" size="16" class="mr-2" /></template>
              <v-list-item-title class="text-body-2">Permissão</v-list-item-title>
              <template #append>
                <v-chip :color="auth.user?.role === 'admin' ? 'warning' : 'primary'" variant="tonal" size="small">{{ auth.user?.role }}</v-chip>
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <!-- Alterar senha -->
      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border>
          <div class="d-flex align-center ga-3 mb-5">
            <div class="cfg-icon" style="background:linear-gradient(135deg,#10B981,#2DD4BF)">
              <v-icon icon="mdi-lock-outline" color="white" size="20" />
            </div>
            <span class="text-subtitle-1 font-weight-bold">Alterar Senha</span>
          </div>
          <v-text-field v-model="pwForm.current" label="Senha atual" type="password" class="mb-3" />
          <v-text-field v-model="pwForm.newPw" label="Nova senha (mín. 6)" type="password" class="mb-3" />
          <v-text-field v-model="pwForm.confirm" label="Confirmar nova senha" type="password" class="mb-3" />
          <v-alert v-if="pwError" type="error" variant="tonal" density="compact" :text="pwError" class="mb-3" />
          <v-alert v-if="pwSuccess" type="success" variant="tonal" density="compact" text="Senha alterada com sucesso!" class="mb-3" />
          <v-btn color="primary" block :loading="savingPw" @click="changePassword">Alterar Senha</v-btn>
        </v-card>
      </v-col>
    </v-row>

    <!-- Atalhos -->
    <v-card class="glass pa-6" border>
      <div class="text-subtitle-1 font-weight-bold mb-4">Configurações Rápidas</div>
      <v-row dense>
        <v-col v-for="link in configLinks" :key="link.to" cols="12" sm="6" md="4" lg="3">
          <v-card :to="link.to" class="glass pa-4 d-flex align-center ga-3" border>
            <div class="cfg-icon" :style="`background:${link.gradient}`">
              <v-icon :icon="link.icon" color="white" size="18" />
            </div>
            <div class="flex-1 min-width-0">
              <div class="text-body-2 font-weight-bold text-truncate">{{ link.title }}</div>
              <div class="text-caption text-truncate" style="color:#9FB0BC">{{ link.desc }}</div>
            </div>
            <v-icon icon="mdi-chevron-right" size="16" style="opacity:.3" />
          </v-card>
        </v-col>
      </v-row>
    </v-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { http } from '@/services/api'

const auth = useAuthStore()
const savingPw = ref(false)
const pwError = ref('')
const pwSuccess = ref(false)
const pwForm = reactive({ current: '', newPw: '', confirm: '' })

const configLinks = [
  { to: '/ia-config',   title: 'Configuração da IA', desc: 'Prompt, modelo, temperatura',  icon: 'mdi-robot-outline',            gradient: 'linear-gradient(135deg,#6366F1,#8B5CF6)' },
  { to: '/integracoes', title: 'Integrações',         desc: 'WhatsApp, Google, APIs',       icon: 'mdi-puzzle-outline',           gradient: 'linear-gradient(135deg,#10B981,#2DD4BF)' },
  { to: '/templates',   title: 'Templates',           desc: 'Mensagens prontas',             icon: 'mdi-file-document-outline',    gradient: 'linear-gradient(135deg,#F59E0B,#FBBF24)' },
  { to: '/apis',        title: 'APIs Externas',       desc: 'OpenAI, Claude, Gemini...',    icon: 'mdi-api',                      gradient: 'linear-gradient(135deg,#38BDF8,#0EA5E9)' },
  { to: '/operadores',  title: 'Operadores',          desc: 'Equipe de atendimento',         icon: 'mdi-account-group-outline',    gradient: 'linear-gradient(135deg,#EF4444,#F87171)' },
  { to: '/broadcast',   title: 'Broadcast',           desc: 'Campanhas em massa',            icon: 'mdi-bullhorn-outline',         gradient: 'linear-gradient(135deg,#A78BFA,#C4B5FD)' },
]

async function changePassword() {
  pwError.value = ''; pwSuccess.value = false
  if (!pwForm.current) { pwError.value = 'Informe a senha atual.'; return }
  if (pwForm.newPw.length < 6) { pwError.value = 'Nova senha deve ter pelo menos 6 caracteres.'; return }
  if (pwForm.newPw !== pwForm.confirm) { pwError.value = 'Confirmação de senha não confere.'; return }
  savingPw.value = true
  try {
    await http.post('/auth/change-password', { currentPassword: pwForm.current, newPassword: pwForm.newPw })
    pwSuccess.value = true
    Object.assign(pwForm, { current: '', newPw: '', confirm: '' })
  } catch (e) { pwError.value = e.message } finally { savingPw.value = false }
}
</script>

<style scoped>
.cfg-icon {
  width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
</style>
