<template>
  <div>
    <h1 class="text-h5 font-weight-bold mb-1">Integrações</h1>
    <p class="text-body-2 mb-6" style="color:#9FB0BC">Conecte serviços externos à sua operação.</p>

    <!-- ── Canais de WhatsApp ── -->
    <div class="section-label">Canais de WhatsApp</div>
    <v-row class="mb-6">
      <!-- Meta WhatsApp -->
      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border style="height:100%">
          <div class="d-flex align-center ga-3 mb-4 flex-wrap">
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
        <v-card class="glass pa-6" border style="height:100%">
          <div class="d-flex align-center ga-3 mb-4 flex-wrap">
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

    <!-- ── Agenda ── -->
    <div class="section-label">Agenda</div>
    <v-row class="mb-6">
      <v-col cols="12">
        <v-card class="glass pa-6" border>
          <div class="d-flex align-center ga-3 mb-4 flex-wrap">
            <v-avatar color="info" variant="tonal" size="48" rounded="xl"><v-icon icon="mdi-google" color="info" /></v-avatar>
            <div class="flex-1">
              <div class="text-subtitle-2 font-weight-bold">Google Calendar</div>
              <div class="text-caption" style="color:#9FB0BC">Agendamento real com link do Meet.</div>
            </div>
            <v-chip v-if="google.connected" color="success" variant="tonal" size="small">Conectado</v-chip>
          </div>
          <p v-if="google.connected && google.email" class="text-body-2 mb-4" style="color:#9FB0BC">Conta: <strong>{{ google.email }}</strong></p>

          <v-row>
            <!-- Passo 1 -->
            <v-col cols="12" md="6">
              <div class="d-flex align-center ga-2 mb-2 flex-wrap">
                <v-chip color="info" size="x-small" variant="tonal">Passo 1</v-chip>
                <span class="text-body-2 font-weight-medium">Credenciais OAuth do Google</span>
                <v-chip v-if="google.setupConfigured" color="success" size="x-small" variant="tonal" prepend-icon="mdi-check">Configurado</v-chip>
              </div>
              <p class="text-caption mb-3" style="color:#9FB0BC">Crie um projeto em console.cloud.google.com, ative a API do Google Calendar e gere as credenciais OAuth 2.0.</p>
              <v-text-field v-model="googleSetupForm.clientId" label="Client ID" placeholder="xxx.apps.googleusercontent.com" density="compact" class="mb-2" />
              <v-text-field v-model="googleSetupForm.clientSecret" label="Client Secret" placeholder="GOCSPX-..." type="password" density="compact" class="mb-3" />
              <v-btn color="info" size="small" :loading="savingGoogleSetup" @click="saveGoogleSetup">{{ google.setupConfigured ? 'Atualizar credenciais' : 'Salvar credenciais' }}</v-btn>
            </v-col>

            <!-- Passo 2 -->
            <v-col cols="12" md="6">
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
            </v-col>
          </v-row>
        </v-card>
      </v-col>
    </v-row>

    <!-- ── CRM Externo ── -->
    <div class="section-label">CRM Externo</div>
    <v-row class="mb-6">
      <v-col cols="12">
        <v-card class="glass pa-6" border>
          <div class="d-flex align-center ga-3 mb-5 flex-wrap">
            <v-avatar color="primary" variant="tonal" size="48" rounded="xl"><v-icon icon="mdi-sitemap" color="primary" /></v-avatar>
            <div class="flex-1">
              <div class="text-subtitle-2 font-weight-bold">Pipeline CRM</div>
              <div class="text-caption" style="color:#9FB0BC">Importa os estágios do funil e recebe eventos de deals.</div>
            </div>
            <v-chip v-if="status.pipeline_crm" color="success" variant="tonal" size="small">Conectado</v-chip>
          </div>

          <v-row>
            <!-- Passo 1: API Key -->
            <v-col cols="12" md="4" class="pipeline-step">
              <div class="d-flex align-center ga-2 mb-2 flex-wrap">
                <v-chip color="info" size="x-small" variant="tonal">Passo 1</v-chip>
                <span class="text-body-2 font-weight-medium">Conectar API Key</span>
              </div>
              <p class="text-caption mb-3" style="color:#9FB0BC">Gere uma API Key em Settings → API → API Integrations, na conta do Pipeline CRM.</p>
              <v-text-field v-model="pipelineCrmApiKey" label="API Key" type="password" density="compact" class="mb-2" />
              <v-btn color="primary" size="small" :loading="connectingPipelineCrm" @click="connectPipelineCrm">{{ status.pipeline_crm ? 'Atualizar API Key' : 'Conectar' }}</v-btn>
            </v-col>

            <!-- Passo 2: importar colunas -->
            <v-col cols="12" md="4" class="pipeline-step">
              <div class="d-flex align-center ga-2 mb-2 flex-wrap">
                <v-chip color="primary" size="x-small" variant="tonal">Passo 2</v-chip>
                <span class="text-body-2 font-weight-medium">Importar colunas</span>
                <v-chip v-if="pipelineStagesCount > 0" color="success" size="x-small" variant="tonal" prepend-icon="mdi-check">{{ pipelineStagesCount }} estágios</v-chip>
              </div>
              <p class="text-caption mb-3" style="color:#9FB0BC">Traz os estágios (deal stages) da sua conta pro Kanban, numa aba separada do funil local — nada do funil de hoje é alterado.</p>
              <v-btn variant="tonal" size="small" :disabled="!status.pipeline_crm" :loading="importingStages" @click="importPipelineStages">{{ pipelineStagesCount > 0 ? 'Reimportar colunas' : 'Importar colunas' }}</v-btn>
            </v-col>

            <!-- Passo 3: recebimento de webhooks -->
            <v-col cols="12" md="4" class="pipeline-step">
              <div class="d-flex align-center ga-2 mb-2 flex-wrap">
                <v-chip color="secondary" size="x-small" variant="tonal">Passo 3</v-chip>
                <span class="text-body-2 font-weight-medium">Receber eventos</span>
                <v-chip v-if="pipelineCrm.lastEventAt" color="success" size="x-small" variant="tonal">Evento recebido</v-chip>
                <v-chip v-else-if="pipelineCrm.configured" color="info" size="x-small" variant="tonal">Aguardando</v-chip>
              </div>

              <div v-if="!pipelineCrm.configured">
                <p class="text-caption mb-3" style="color:#9FB0BC">Gere uma URL exclusiva e cole nas configurações de webhook do Pipeline CRM (deal criado/atualizado, mudança de estágio).</p>
                <v-btn variant="tonal" size="small" :loading="generatingPipelineCrm" @click="generatePipelineCrmWebhook">Gerar URL de recebimento</v-btn>
              </div>
              <div v-else>
                <v-text-field
                  :model-value="pipelineCrm.webhookUrl"
                  label="URL do webhook"
                  density="compact"
                  readonly
                  class="mb-2"
                  append-inner-icon="mdi-content-copy"
                  @click:append-inner="copyPipelineCrmUrl"
                />
                <p class="text-caption mb-3" style="color:#9FB0BC">
                  {{ pipelineCrm.lastEventAt ? `Último evento: ${formatDate(pipelineCrm.lastEventAt)}` : 'Nenhum evento recebido ainda.' }}
                </p>
                <v-btn variant="text" size="small" color="error" :loading="generatingPipelineCrm" @click="generatePipelineCrmWebhook">Gerar nova URL</v-btn>
              </div>
            </v-col>
          </v-row>
        </v-card>
      </v-col>
    </v-row>

    <!-- ── Webhooks de Saída (Desenvolvedores) ── -->
    <div class="section-label">Webhooks de Saída (Desenvolvedores)</div>
    <v-row>
      <v-col cols="12">
        <v-card class="glass pa-6" border>
          <div class="d-flex align-center ga-3 mb-5 flex-wrap">
            <v-avatar color="warning" variant="tonal" size="48" rounded="xl"><v-icon icon="mdi-webhook" color="warning" /></v-avatar>
            <div class="flex-1">
              <div class="text-subtitle-2 font-weight-bold">Webhooks de saída</div>
              <div class="text-caption" style="color:#9FB0BC">Notifique sistemas externos quando algo acontecer na sua operação.</div>
            </div>
          </div>

          <v-row>
            <v-col cols="12" md="7">
              <div class="text-body-2 font-weight-medium mb-2">Endpoints configurados</div>
              <div v-if="webhookEndpoints.length">
                <div v-for="ep in webhookEndpoints" :key="ep.id" class="webhook-endpoint-row mb-2 pa-3">
                  <div class="d-flex align-center ga-2 flex-wrap">
                    <span class="text-body-2 font-mono text-truncate" style="max-width:260px">{{ ep.url }}</span>
                    <v-chip :color="ep.active ? 'success' : undefined" variant="tonal" size="x-small">{{ ep.active ? 'Ativo' : 'Inativo' }}</v-chip>
                    <v-spacer />
                    <v-btn size="small" variant="text" @click="toggleWebhookEndpoint(ep)">{{ ep.active ? 'Desativar' : 'Ativar' }}</v-btn>
                    <v-btn size="small" variant="text" @click="regenerateSecret(ep)">Regerar segredo</v-btn>
                    <v-btn icon variant="text" size="small" color="error" @click="deleteWebhookEndpoint(ep)"><v-icon icon="mdi-delete-outline" size="16" /></v-btn>
                  </div>
                  <div class="d-flex flex-wrap ga-1 mt-1">
                    <v-chip v-for="ev in ep.events" :key="ev" size="x-small" variant="tonal">{{ ev }}</v-chip>
                  </div>
                </div>
              </div>
              <p v-else class="text-body-2" style="color:#9FB0BC">Nenhum webhook de saída configurado ainda.</p>

              <v-alert v-if="newEndpointSecret" type="success" variant="tonal" density="compact" class="mt-3">
                Segredo gerado (só é mostrado uma vez): <code>{{ newEndpointSecret }}</code>
                <v-btn size="x-small" variant="text" @click="copySecret">Copiar</v-btn>
              </v-alert>
            </v-col>

            <v-col cols="12" md="5">
              <div class="text-body-2 font-weight-medium mb-2">Novo endpoint</div>
              <v-text-field v-model="newEndpoint.url" label="URL" placeholder="https://seusistema.com/webhook" density="compact" class="mb-2" />
              <div class="d-flex flex-wrap ga-1 mb-3">
                <v-checkbox
                  v-for="ev in webhookEventTypes" :key="ev" v-model="newEndpoint.events" :value="ev" :label="ev"
                  density="compact" hide-details color="primary"
                />
              </div>
              <v-btn color="primary" size="small" :loading="creatingEndpoint" @click="createWebhookEndpoint">Adicionar endpoint</v-btn>
            </v-col>
          </v-row>
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
import { googleSetupSchema, metaConnectSchema, evolutionConnectSchema } from '@/schemas/integrations'
import { validateForm } from '@/composables/useZodValidation'

const auth = useAuthStore()
const toast = useToast()
const connecting = ref(false)
const savingMeta = ref(false)
const savingEvo = ref(false)
const savingGoogleSetup = ref(false)
const testingMeta = ref(false)
const metaTestResult = ref(null)

const google = reactive({ connected: false, email: null, setupConfigured: false })
const status = reactive({ meta_whatsapp: false, evolution: false, pipeline_crm: false })
const metaForm = reactive({ phoneNumberId: '', accessToken: '', wabaId: '' })
const evoForm = reactive({ baseUrl: '', instance: '', apiKey: '' })
const googleSetupForm = reactive({ clientId: '', clientSecret: '' })
const pipelineCrm = reactive({ configured: false, webhookUrl: null, lastEventAt: null })
const generatingPipelineCrm = ref(false)
const pipelineCrmApiKey = ref('')
const connectingPipelineCrm = ref(false)
const pipelineStagesCount = ref(0)
const importingStages = ref(false)

const webhookEndpoints = ref([])
const webhookEventTypes = ['lead.created', 'lead.stage_changed', 'appointment.created', 'message.received']
const newEndpoint = reactive({ url: '', events: [] })
const newEndpointSecret = ref('')
const creatingEndpoint = ref(false)

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

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
      if (i.provider === 'pipeline_crm') status.pipeline_crm = i.status === 'connected'
    }
  } catch { /* */ }
  try {
    const { data } = await http.get('/integrations/pipeline-crm/webhook-setup')
    pipelineCrm.configured = !!data.configured
    pipelineCrm.webhookUrl = data.webhookUrl || null
    pipelineCrm.lastEventAt = data.lastEventAt || null
  } catch { /* */ }
  try { pipelineStagesCount.value = (await api.listPipelineStages()).length } catch { /* */ }
  try { webhookEndpoints.value = await api.listWebhookEndpoints() } catch { /* */ }
}

async function createWebhookEndpoint() {
  if (!newEndpoint.url) { toast.warning('Informe a URL.'); return }
  if (!newEndpoint.events.length) { toast.warning('Selecione ao menos um evento.'); return }
  creatingEndpoint.value = true
  try {
    const ep = await api.createWebhookEndpoint({ url: newEndpoint.url, events: newEndpoint.events })
    newEndpointSecret.value = ep.secret
    webhookEndpoints.value.unshift(ep)
    newEndpoint.url = ''; newEndpoint.events = []
    toast.success('Endpoint criado.')
  } catch (e) { toast.error(e.message) } finally { creatingEndpoint.value = false }
}

async function toggleWebhookEndpoint(ep) {
  try {
    const updated = await api.updateWebhookEndpoint(ep.id, { active: !ep.active })
    const idx = webhookEndpoints.value.findIndex((e) => e.id === ep.id)
    if (idx !== -1) webhookEndpoints.value[idx] = { ...webhookEndpoints.value[idx], ...updated }
  } catch (e) { toast.error(e.message) }
}

async function regenerateSecret(ep) {
  try {
    const updated = await api.regenerateWebhookEndpointSecret(ep.id)
    newEndpointSecret.value = updated.secret
    toast.success('Novo segredo gerado.')
  } catch (e) { toast.error(e.message) }
}

async function deleteWebhookEndpoint(ep) {
  try {
    await api.deleteWebhookEndpoint(ep.id)
    webhookEndpoints.value = webhookEndpoints.value.filter((e) => e.id !== ep.id)
    toast.success('Endpoint excluído.')
  } catch (e) { toast.error(e.message) }
}

async function copySecret() {
  try { await navigator.clipboard.writeText(newEndpointSecret.value); toast.success('Segredo copiado.') }
  catch { toast.error('Não foi possível copiar.') }
}

async function connectPipelineCrm() {
  if (!pipelineCrmApiKey.value) { toast.warning('Informe a API Key.'); return }
  connectingPipelineCrm.value = true
  try {
    await api.connectPipelineCrm(pipelineCrmApiKey.value)
    status.pipeline_crm = true
    pipelineCrmApiKey.value = ''
    toast.success('Pipeline CRM conectado.')
  } catch (e) { toast.error(e.message) } finally { connectingPipelineCrm.value = false }
}

async function importPipelineStages() {
  importingStages.value = true
  try {
    const { imported } = await api.importPipelineCrmStages()
    pipelineStagesCount.value = imported
    toast.success(`${imported} estágio(s) importado(s).`)
  } catch (e) { toast.error(e.message) } finally { importingStages.value = false }
}

async function generatePipelineCrmWebhook() {
  generatingPipelineCrm.value = true
  try {
    const { data } = await http.post('/integrations/pipeline-crm/webhook-setup')
    pipelineCrm.configured = true
    pipelineCrm.webhookUrl = data.webhookUrl
    pipelineCrm.lastEventAt = null
    toast.success('URL de webhook gerada. Cole nas configurações de webhook do Pipeline CRM.')
  } catch (e) { toast.error(e.message) } finally { generatingPipelineCrm.value = false }
}

async function copyPipelineCrmUrl() {
  if (!pipelineCrm.webhookUrl) return
  try { await navigator.clipboard.writeText(pipelineCrm.webhookUrl); toast.success('URL copiada.') }
  catch { toast.error('Não foi possível copiar a URL.') }
}

async function saveGoogleSetup() {
  const check = validateForm(googleSetupSchema, googleSetupForm)
  if (!check.success) { toast.warning(check.error); return }
  savingGoogleSetup.value = true
  try { await api.googleSaveSetup(check.data); google.setupConfigured = true; googleSetupForm.clientId = ''; googleSetupForm.clientSecret = ''; toast.success('Credenciais Google salvas.') }
  catch (e) { toast.error(e.message) } finally { savingGoogleSetup.value = false }
}

async function connectGoogle() { connecting.value = true; try { const { authUrl } = await api.googleConnect(); window.location.href = authUrl } catch (e) { toast.error(e.message); connecting.value = false } }
async function disconnectGoogle() { try { await http.post('/integrations/google/disconnect'); google.connected = false; google.email = null; toast.success('Google Calendar desconectado.') } catch (e) { toast.error(e.message) } }

async function testMeta() { testingMeta.value = true; metaTestResult.value = null; try { metaTestResult.value = { ok: true, ...await api.testMetaConnection() } } catch (e) { metaTestResult.value = { ok: false, error: e.message } } finally { testingMeta.value = false } }
async function saveMeta() {
  const check = validateForm(metaConnectSchema, metaForm)
  if (!check.success) { toast.error(check.error); return }
  savingMeta.value = true
  try { await http.post('/integrations/meta/connect', check.data); status.meta_whatsapp = true; toast.success('Credenciais Meta salvas.') } catch (e) { toast.error(e.message) } finally { savingMeta.value = false }
}
async function saveEvo() {
  const check = validateForm(evolutionConnectSchema, evoForm)
  if (!check.success) { toast.error(check.error); return }
  savingEvo.value = true
  try { await http.post('/integrations/evolution/connect', check.data); status.evolution = true; toast.success('Credenciais Evolution salvas.') } catch (e) { toast.error(e.message) } finally { savingEvo.value = false }
}

function handleReturn() {
  const params = new URLSearchParams(window.location.search)
  const g = params.get('gcal'); if (!g) return
  window.history.replaceState({}, document.title, window.location.pathname)
  if (g === 'connected') { toast.success('Google Calendar conectado!'); setTimeout(loadStatus, 500) }
  else if (g === 'error') toast.error('Falha ao conectar Google: ' + (params.get('reason') || 'erro'))
}

onMounted(() => { handleReturn(); loadStatus() })
</script>

<style scoped>
.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4D6070;
  margin-bottom: 12px;
}

.webhook-endpoint-row {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

/* separador vertical entre os 3 passos do Pipeline CRM em telas largas —
   md() já empilha em coluna única no mobile, então o divisor só faz
   sentido lateralmente */
.pipeline-step + .pipeline-step {
  border-left: 1px solid var(--sep, rgba(255, 255, 255, 0.08));
}
@media (max-width: 959px) {
  .pipeline-step + .pipeline-step {
    border-left: none;
    border-top: 1px solid var(--sep, rgba(255, 255, 255, 0.08));
    padding-top: 16px;
  }
}
</style>
