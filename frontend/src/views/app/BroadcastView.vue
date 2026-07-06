<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Broadcast</h1>
        <p class="text-body-2" style="color:#9FB0BC">Disparos em massa para seus leads</p>
      </div>
      <v-btn v-if="!activeCampaign" color="primary" prepend-icon="mdi-plus" @click="openCreate">Nova Campanha</v-btn>
    </div>

    <!-- Lista de campanhas -->
    <div v-if="!activeCampaign">
      <div v-if="loading" class="py-12 text-center"><v-progress-circular indeterminate color="primary" /></div>
      <v-card v-else class="glass" border>
        <v-data-table :headers="headers" :items="campaigns" item-value="id" class="bg-transparent" :items-per-page="25">
          <template #item.name="{ item }">
            <div>
              <div class="text-body-2 font-weight-medium">{{ item.name }}</div>
              <div class="text-caption text-truncate" style="color:#9FB0BC;max-width:240px">{{ item.content.slice(0, 60) }}{{ item.content.length > 60 ? '…' : '' }}</div>
            </div>
          </template>
          <template #item.status="{ item }">
            <v-chip :color="statusColor(item.status)" variant="tonal" size="small">{{ statusLabel(item.status) }}</v-chip>
          </template>
          <template #item.metrics="{ item }">
            <div class="d-flex ga-2 text-caption flex-wrap">
              <span style="color:#10B981">{{ item.sent_count }} env.</span>
              <span style="color:#38BDF8">{{ item.delivered_count }} entg.</span>
              <span style="color:#F59E0B">{{ item.read_count }} lid.</span>
            </div>
          </template>
          <template #item.scheduled_at="{ item }">
            <span class="text-caption">{{ item.scheduled_at ? formatDate(item.scheduled_at) : '—' }}</span>
          </template>
          <template #item.actions="{ item }">
            <div class="d-flex ga-1 justify-end">
              <v-btn icon variant="text" size="small" title="Gerenciar" @click="openManage(item)"><v-icon icon="mdi-cog-outline" size="16" /></v-btn>
              <v-btn v-if="item.status === 'draft'" icon variant="text" size="small" color="success" @click="startSend(item)"><v-icon icon="mdi-send-outline" size="16" /></v-btn>
              <v-btn v-if="item.status === 'sending'" icon variant="text" size="small" color="warning" @click="cancelCampaign(item)"><v-icon icon="mdi-stop-circle-outline" size="16" /></v-btn>
              <v-btn v-if="item.status !== 'sending'" icon variant="text" size="small" color="error" @click="deleteCampaign(item)"><v-icon icon="mdi-delete-outline" size="16" /></v-btn>
            </div>
          </template>
          <template #no-data>
            <div class="py-8 text-center" style="color:#6B7C88">Nenhuma campanha. Crie a primeira!</div>
          </template>
        </v-data-table>
      </v-card>
    </div>

    <!-- Gerenciador de campanha ativa -->
    <div v-else>
      <div class="d-flex align-center ga-3 mb-5 flex-wrap">
        <v-btn icon variant="text" @click="activeCampaign = null"><v-icon icon="mdi-arrow-left" /></v-btn>
        <div class="flex-1">
          <h2 class="text-h6 font-weight-bold">{{ activeCampaign.name }}</h2>
          <v-chip :color="statusColor(activeCampaign.status)" variant="tonal" size="small">{{ statusLabel(activeCampaign.status) }}</v-chip>
        </div>
        <v-btn v-if="activeCampaign.status === 'draft'" color="success" prepend-icon="mdi-send" :loading="starting" @click="startSend(activeCampaign)">Iniciar Envio</v-btn>
        <v-btn v-if="activeCampaign.status === 'sending'" color="warning" prepend-icon="mdi-stop" @click="cancelCampaign(activeCampaign)">Cancelar</v-btn>
      </div>

      <v-row>
        <v-col cols="12" md="4">
          <v-card class="glass pa-5" border>
            <div class="text-subtitle-2 font-weight-bold mb-3">Mensagem</div>
            <p class="text-body-2 mb-4" style="color:#9FB0BC;white-space:pre-wrap">{{ activeCampaign.content }}</p>
            <v-divider class="mb-3" />
            <v-row dense>
              <v-col cols="6" class="text-center"><div class="text-h5 font-weight-black" style="color:#10B981">{{ activeCampaign.sent_count }}</div><div class="text-caption" style="color:#9FB0BC">Enviadas</div></v-col>
              <v-col cols="6" class="text-center"><div class="text-h5 font-weight-black" style="color:#38BDF8">{{ activeCampaign.delivered_count }}</div><div class="text-caption" style="color:#9FB0BC">Entregues</div></v-col>
              <v-col cols="6" class="text-center"><div class="text-h5 font-weight-black" style="color:#F59E0B">{{ activeCampaign.read_count }}</div><div class="text-caption" style="color:#9FB0BC">Lidas</div></v-col>
              <v-col cols="6" class="text-center"><div class="text-h5 font-weight-black" style="color:#A78BFA">{{ activeCampaign.replied_count }}</div><div class="text-caption" style="color:#9FB0BC">Respondidas</div></v-col>
            </v-row>
          </v-card>
        </v-col>

        <v-col cols="12" md="8">
          <v-card class="glass pa-5" border>
            <div class="d-flex align-center justify-space-between mb-4">
              <div class="text-subtitle-2 font-weight-bold">Contatos ({{ contacts.length }})</div>
              <div v-if="['draft', 'scheduled'].includes(activeCampaign.status)" class="d-flex ga-2">
                <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-account-multiple-outline" @click="openImportFromBase">Importar da Base</v-btn>
                <v-btn size="small" color="primary" prepend-icon="mdi-import" @click="importDialog = true">Colar Lista</v-btn>
                <v-btn v-if="contacts.length" size="small" variant="tonal" color="error" prepend-icon="mdi-broom" @click="doClearContacts">Limpar Lista</v-btn>
              </div>
            </div>
            <v-data-table :headers="contactHeaders" :items="contacts" :loading="loadingContacts" item-value="id" density="compact" class="bg-transparent" :items-per-page="15">
              <template #item.status="{ item }"><v-chip :color="contactBadgeColor(item.status)" variant="tonal" size="x-small">{{ item.status }}</v-chip></template>
              <template #item.sent_at="{ item }"><span class="text-caption">{{ item.sent_at ? formatDate(item.sent_at) : '—' }}</span></template>
              <template #item.actions="{ item }">
                <v-btn
                  v-if="['draft', 'scheduled'].includes(activeCampaign.status)"
                  icon variant="text" size="small" color="error" title="Remover"
                  @click="doRemoveContact(item)"
                ><v-icon icon="mdi-close" size="16" /></v-btn>
              </template>
              <template #no-data><div class="py-6 text-center" style="color:#6B7C88">Nenhum contato importado.</div></template>
            </v-data-table>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <!-- Dialog: criar campanha -->
    <v-dialog v-model="createDialog" max-width="500">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Nova Campanha</v-card-title>
        <v-card-text>
          <v-text-field v-model="createForm.name" label="Nome da campanha" class="mb-3" />
          <v-select
            v-model="createForm.template_id"
            :items="templateOptions"
            item-title="title"
            item-value="value"
            label="Usar um template (opcional)"
            clearable
            class="mb-3"
            @update:model-value="applyCampaignTemplate"
          />
          <v-textarea v-model="createForm.content" label="Mensagem" placeholder="Olá {nome}! Estamos com uma oferta especial..." rows="4" auto-grow maxlength="4000" class="mb-3" />
          <v-text-field v-model="createForm.scheduled_at" label="Agendar para (opcional)" type="datetime-local" />
          <v-alert v-if="createError" type="error" variant="tonal" density="compact" :text="createError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="createDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveCampaign">Criar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: importar contatos -->
    <v-dialog v-model="importDialog" max-width="500">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Importar Contatos</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3" style="color:#9FB0BC">Cole os contatos no formato: <code>nome,telefone</code> (um por linha). O telefone deve incluir o DDI (ex: 5511999999999).</p>
          <v-textarea v-model="importText" label="Contatos" rows="6" placeholder="João Silva,5511999999999&#10;Maria Souza,5521988888888" class="font-mono" style="font-size:12px" />
          <div class="text-caption mt-1" style="color:#9FB0BC">{{ parsedContacts.length }} contato(s) identificado(s)</div>
          <v-alert v-if="importError" type="error" variant="tonal" density="compact" :text="importError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="importDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="importing" :disabled="!parsedContacts.length" @click="doImport">Importar {{ parsedContacts.length }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: importar da base (com filtros) -->
    <v-dialog v-model="importBaseDialog" max-width="500">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Importar da Base</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3" style="color:#9FB0BC">Importa contatos direto do seu CRM. Deixe os filtros vazios para importar todos os contatos com telefone.</p>
          <v-select
            v-model="importBaseForm.stages" :items="stageOptions" label="Etapa (opcional)"
            multiple chips closable-chips density="compact" variant="outlined" class="mb-3"
          />
          <v-select
            v-model="importBaseForm.queueIds" :items="queueOptions" item-title="title" item-value="value" label="Fila (opcional)"
            multiple chips closable-chips density="compact" variant="outlined" class="mb-3"
          />
          <v-select
            v-model="importBaseForm.tags" :items="tagOptions" label="Etiqueta (opcional)"
            multiple chips closable-chips density="compact" variant="outlined"
          />
          <v-alert v-if="importBaseError" type="error" variant="tonal" density="compact" :text="importBaseError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="importBaseDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="importingBase" @click="doImportFromBase">Importar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const starting = ref(false)
const importing = ref(false)
const loadingContacts = ref(false)
const campaigns = ref([])
const contacts = ref([])
const activeCampaign = ref(null)
const createDialog = ref(false)
const importDialog = ref(false)
const importText = ref('')
const importError = ref('')
const createError = ref('')
const createForm = reactive({ name: '', content: '', scheduled_at: '', template_id: null })
const templates = ref([])
const templateOptions = computed(() =>
  templates.value.map((t) => ({ title: `${t.name} (${t.category})`, value: t.id }))
)

// ——— importar da base (com filtros) ———
const importBaseDialog = ref(false)
const importingBase    = ref(false)
const importBaseError  = ref('')
const importBaseForm   = reactive({ stages: [], queueIds: [], tags: [] })
const stageOptions = ['Novo Lead', 'Em Qualificação', 'Qualificado', 'Reunião Agendada', 'Vendido', 'Perdido']
const queues = ref([])
const tagOptions = ref([])
const queueOptions = computed(() => queues.value.map((q) => ({ title: q.name, value: q.id })))

const headers = [
  { title: 'Campanha', key: 'name' },
  { title: 'Status', key: 'status' },
  { title: 'Métricas', key: 'metrics', sortable: false },
  { title: 'Agendado', key: 'scheduled_at' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
]
const contactHeaders = [
  { title: 'Nome', key: 'name' }, { title: 'Telefone', key: 'phone' }, { title: 'Status', key: 'status' }, { title: 'Enviado em', key: 'sent_at' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
]

const parsedContacts = computed(() => {
  if (!importText.value.trim()) return []
  return importText.value.trim().split('\n').map((line) => { const p = line.split(','); return p.length >= 2 ? { name: p[0].trim(), phone: p[1].trim() } : { phone: p[0].trim() } }).filter((c) => c.phone)
})

const statusLabel = (s) => ({ draft: 'Rascunho', scheduled: 'Agendada', sending: 'Enviando', completed: 'Concluída', cancelled: 'Cancelada' }[s] || s)
const statusColor = (s) => ({ draft: undefined, scheduled: 'info', sending: 'warning', completed: 'success', cancelled: 'error' }[s])
const contactBadgeColor = (s) => ({ pending: undefined, sent: 'info', delivered: 'primary', read: 'success', replied: 'secondary', failed: 'error' }[s])
function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }

async function load() { loading.value = true; try { const { campaigns: c } = await api.listCampaigns(); campaigns.value = c } catch (e) { toast.error(e.message) } finally { loading.value = false } }

function openCreate() { Object.assign(createForm, { name: '', content: '', scheduled_at: '', template_id: null }); createError.value = ''; createDialog.value = true }

function applyCampaignTemplate(templateId) {
  const tpl = templates.value.find((t) => t.id === templateId)
  if (tpl) createForm.content = tpl.content
}

async function loadTemplates() {
  try { const { templates: t } = await api.listTemplates(); templates.value = t } catch { /* silencioso */ }
}

async function saveCampaign() {
  if (!createForm.name || !createForm.content) { createError.value = 'Nome e mensagem são obrigatórios.'; return }
  saving.value = true
  try {
    const { campaign } = await api.createCampaign({
      name: createForm.name,
      content: createForm.content,
      template_id: createForm.template_id || null,
      scheduled_at: createForm.scheduled_at ? new Date(createForm.scheduled_at).toISOString() : null,
    })
    campaigns.value.unshift(campaign); createDialog.value = false; toast.success('Campanha criada.')
  }
  catch (e) { createError.value = e.message } finally { saving.value = false }
}

async function openManage(camp) {
  activeCampaign.value = camp; loadingContacts.value = true
  try { const { contacts: c } = await api.listBroadcastContacts(camp.id); contacts.value = c } catch (e) { toast.error(e.message) } finally { loadingContacts.value = false }
}

async function doRemoveContact(item) {
  try {
    await api.removeBroadcastContact(activeCampaign.value.id, item.id)
    contacts.value = contacts.value.filter((c) => c.id !== item.id)
  } catch (e) { toast.error(e.message) }
}

async function doClearContacts() {
  try {
    await api.clearBroadcastContacts(activeCampaign.value.id)
    contacts.value = []
    toast.success('Lista de contatos limpa.')
  } catch (e) { toast.error(e.message) }
}

async function startSend(camp) {
  starting.value = true
  try { await api.sendCampaign(camp.id); camp.status = 'sending'; if (activeCampaign.value?.id === camp.id) activeCampaign.value = { ...camp }; toast.success('Envio iniciado!') }
  catch (e) { toast.error(e.message) } finally { starting.value = false }
}

async function cancelCampaign(camp) { try { await api.cancelCampaign(camp.id); camp.status = 'cancelled'; toast.success('Campanha cancelada.') } catch (e) { toast.error(e.message) } }
async function deleteCampaign(camp) { try { await api.deleteCampaign(camp.id); campaigns.value = campaigns.value.filter((c) => c.id !== camp.id); toast.success('Campanha excluída.') } catch (e) { toast.error(e.message) } }

async function doImport() {
  importError.value = ''; importing.value = true
  try { const { imported } = await api.importContacts(activeCampaign.value.id, parsedContacts.value); await openManage(activeCampaign.value); importDialog.value = false; importText.value = ''; toast.success(`${imported} contato(s) importado(s).`) }
  catch (e) { importError.value = e.message } finally { importing.value = false }
}

function openImportFromBase() {
  Object.assign(importBaseForm, { stages: [], queueIds: [], tags: [] })
  importBaseError.value = ''
  importBaseDialog.value = true
}

async function doImportFromBase() {
  importBaseError.value = ''; importingBase.value = true
  try {
    const { imported, skipped } = await api.importLeadsToCampaign(activeCampaign.value.id, { ...importBaseForm })
    await openManage(activeCampaign.value)
    importBaseDialog.value = false
    toast.success(`${imported} contato(s) importado(s)${skipped ? ` (${skipped} já estavam na lista)` : ''}.`)
  } catch (e) { importBaseError.value = e.message } finally { importingBase.value = false }
}

async function loadFilterOptions() {
  try { const { queues: q } = await api.listQueues(); queues.value = q } catch { /* silencioso */ }
  try { tagOptions.value = await api.listContactTags() } catch { /* silencioso */ }
}

onMounted(() => { load(); loadFilterOptions(); loadTemplates() })
</script>
