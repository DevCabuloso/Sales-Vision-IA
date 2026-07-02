<template>
  <div>
    <h1 class="text-h5 font-weight-bold mb-1">Integrações</h1>
    <p class="text-body-2 mb-6" style="color:#9FB0BC">Conecte serviços externos à sua operação.</p>

    <v-row>
      <!-- Google Calendar -->
      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border>
          <div class="d-flex align-center ga-3 mb-4">
            <v-avatar color="info" variant="tonal" size="48" rounded="xl"><v-icon icon="mdi-google" color="info" /></v-avatar>
            <div class="flex-1">
              <div class="text-subtitle-2 font-weight-bold">Google Calendar</div>
              <div class="text-caption" style="color:#9FB0BC">Agendamento real com link do Meet.</div>
            </div>
            <v-chip v-if="google.connected" color="success" variant="tonal" size="small">Conectado</v-chip>
          </div>

          <p v-if="google.connected && google.email" class="text-body-2 mb-4" style="color:#9FB0BC">Conta: <strong>{{ google.email }}</strong></p>

          <!-- Passo 1 -->
          <div class="mb-4">
            <div class="d-flex align-center ga-2 mb-2">
              <v-chip color="info" size="x-small" variant="tonal">Passo 1</v-chip>
              <span class="text-body-2 font-weight-medium">Credenciais OAuth do Google</span>
              <v-chip v-if="google.setupConfigured" color="success" size="x-small" variant="tonal" prepend-icon="mdi-check">Configurado</v-chip>
            </div>
            <p class="text-caption mb-3" style="color:#9FB0BC">Crie um projeto em console.cloud.google.com, ative a API do Google Calendar e gere as credenciais OAuth 2.0.</p>
            <v-text-field v-model="googleSetupForm.clientId" label="Client ID" placeholder="xxx.apps.googleusercontent.com" density="compact" class="mb-2" />
            <v-text-field v-model="googleSetupForm.clientSecret" label="Client Secret" placeholder="GOCSPX-..." type="password" density="compact" class="mb-3" />
            <v-btn color="info" size="small" :loading="savingGoogleSetup" @click="saveGoogleSetup">{{ google.setupConfigured ? 'Atualizar credenciais' : 'Salvar credenciais' }}</v-btn>
          </div>

          <v-divider class="mb-4" />

          <!-- Passo 2 -->
          <div class="d-flex align-center ga-2 mb-3">
            <v-chip color="primary" size="x-small" variant="tonal">Passo 2</v-chip>
            <span class="text-body-2 font-weight-medium">Autorizar conta Google</span>
          </div>
          <div v-if="!google.connected">
            <v-btn color="primary" size="small" prepend-icon="mdi-link-variant" :loading="connecting" @click="connectGoogle">Conectar Google Calendar</v-btn>
          </div>
          <div v-else class="d-flex align-center ga-3 flex-wrap">
            <v-chip color="success" variant="tonal" prepend-icon="mdi-check-circle">A IA já agenda reuniões reais</v-chip>
            <v-btn variant="text" size="small" color="error" @click="disconnectGoogle">Desconectar</v-btn>
          </div>
        </v-card>
      </v-col>

      <!-- Meta WhatsApp -->
      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border>
          <div class="d-flex align-center ga-3 mb-4">
            <v-avatar color="success" variant="tonal" size="48" rounded="xl"><v-icon icon="mdi-whatsapp" color="success" /></v-avatar>
            <div class="flex-1">
              <div class="text-subtitle-2 font-weight-bold">WhatsApp (Meta API)</div>
              <div class="text-caption" style="color:#9FB0BC">API oficial do WhatsApp Cloud.</div>
            </div>
            <v-chip v-if="status.meta_whatsapp" color="success" variant="tonal" size="small">Conectado</v-chip>
          </div>
          <v-text-field v-model="metaForm.phoneNumberId" label="Phone Number ID" density="compact" class="mb-2" />
          <v-text-field v-model="metaForm.accessToken" label="Access Token" type="password" density="compact" class="mb-2" />
          <v-text-field v-model="metaForm.wabaId" label="WABA ID (opcional)" density="compact" class="mb-3" />
          <div class="d-flex ga-2 flex-wrap">
            <v-btn color="primary" size="small" :loading="savingMeta" @click="saveMeta">Salvar credenciais Meta</v-btn>
            <v-btn v-if="status.meta_whatsapp" variant="tonal" size="small" :loading="testingMeta" @click="testMeta">Validar conexão</v-btn>
          </div>
          <v-alert v-if="metaTestResult" :type="metaTestResult.ok ? 'success' : 'error'" variant="tonal" density="compact" class="mt-3">
            <span>{{ metaTestResult.ok ? `✓ ${metaTestResult.name} · ${metaTestResult.phone}` : metaTestResult.error }}</span>
          </v-alert>
        </v-card>
      </v-col>

      <!-- Evolution -->
      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border>
          <div class="d-flex align-center ga-3 mb-4">
            <v-avatar color="secondary" variant="tonal" size="48" rounded="xl"><v-icon icon="mdi-api" color="secondary" /></v-avatar>
            <div class="flex-1">
              <div class="text-subtitle-2 font-weight-bold">WhatsApp (Evolution)</div>
              <div class="text-caption" style="color:#9FB0BC">API não-oficial via Evolution.</div>
            </div>
            <v-chip v-if="status.evolution" color="success" variant="tonal" size="small">Conectado</v-chip>
          </div>
          <v-text-field v-model="evoForm.baseUrl" label="URL do servidor" placeholder="https://evo.seudominio.com" density="compact" class="mb-2" />
          <v-text-field v-model="evoForm.instance" label="Instância" density="compact" class="mb-2" />
          <v-text-field v-model="evoForm.apiKey" label="API Key" type="password" density="compact" class="mb-3" />
          <v-btn color="primary" size="small" :loading="savingEvo" @click="saveEvo">Salvar credenciais Evolution</v-btn>
          <div class="mt-3 text-caption" style="color:#6B7C88">
            Configure o webhook para:<br />
            <code class="text-caption" style="color:#9FB0BC">{{ webhookUrl }}</code>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api, http } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const toast = useToast()
const connecting = ref(false)
const savingMeta = ref(false)
const savingEvo = ref(false)
const savingGoogleSetup = ref(false)
const testingMeta = ref(false)
const metaTestResult = ref(null)

const google = reactive({ connected: false, email: null, setupConfigured: false })
const status = reactive({ meta_whatsapp: false, evolution: false })
const metaForm = reactive({ phoneNumberId: '', accessToken: '', wabaId: '' })
const evoForm = reactive({ baseUrl: '', instance: '', apiKey: '' })
const googleSetupForm = reactive({ clientId: '', clientSecret: '' })

const backendOrigin = import.meta.env.VITE_BACKEND_URL || window.location.origin
const webhookUrl = computed(() => `${backendOrigin}/webhooks/evolution/${auth.user?.tenantId || '<tenant_id>'}`)

async function loadStatus() {
  try { const g = await api.googleStatus(); google.connected = !!g.connected; google.email = g.email || null } catch { /* */ }
  try { const setup = await api.googleSetupStatus(); google.setupConfigured = !!setup.configured } catch { /* */ }
  try {
    const { data } = await http.get('/integrations/status')
    for (const i of data.integrations || []) {
      if (i.provider === 'meta_whatsapp') status.meta_whatsapp = i.status === 'connected'
      if (i.provider === 'evolution') status.evolution = i.status === 'connected'
    }
  } catch { /* */ }
}

async function saveGoogleSetup() {
  if (!googleSetupForm.clientId || !googleSetupForm.clientSecret) { toast.warning('Preencha o Client ID e o Client Secret.'); return }
  savingGoogleSetup.value = true
  try { await api.googleSaveSetup({ clientId: googleSetupForm.clientId, clientSecret: googleSetupForm.clientSecret }); google.setupConfigured = true; googleSetupForm.clientId = ''; googleSetupForm.clientSecret = ''; toast.success('Credenciais Google salvas.') }
  catch (e) { toast.error(e.message) } finally { savingGoogleSetup.value = false }
}

async function connectGoogle() { connecting.value = true; try { const { authUrl } = await api.googleConnect(); window.location.href = authUrl } catch (e) { toast.error(e.message); connecting.value = false } }
async function disconnectGoogle() { try { await http.post('/integrations/google/disconnect'); google.connected = false; google.email = null; toast.success('Google Calendar desconectado.') } catch (e) { toast.error(e.message) } }

async function testMeta() { testingMeta.value = true; metaTestResult.value = null; try { metaTestResult.value = { ok: true, ...await api.testMetaConnection() } } catch (e) { metaTestResult.value = { ok: false, error: e.message } } finally { testingMeta.value = false } }
async function saveMeta() { savingMeta.value = true; try { await http.post('/integrations/meta/connect', { ...metaForm }); status.meta_whatsapp = true; toast.success('Credenciais Meta salvas.') } catch (e) { toast.error(e.message) } finally { savingMeta.value = false } }
async function saveEvo() { savingEvo.value = true; try { await http.post('/integrations/evolution/connect', { ...evoForm }); status.evolution = true; toast.success('Credenciais Evolution salvas.') } catch (e) { toast.error(e.message) } finally { savingEvo.value = false } }

function handleReturn() {
  const params = new URLSearchParams(window.location.search)
  const g = params.get('gcal'); if (!g) return
  window.history.replaceState({}, document.title, window.location.pathname)
  if (g === 'connected') { toast.success('Google Calendar conectado!'); setTimeout(loadStatus, 500) }
  else if (g === 'error') toast.error('Falha ao conectar Google: ' + (params.get('reason') || 'erro'))
}

onMounted(() => { handleReturn(); loadStatus() })
</script>
