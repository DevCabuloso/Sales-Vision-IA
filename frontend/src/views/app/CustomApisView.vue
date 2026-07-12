<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">APIs Customizadas</h1>
        <p class="text-body-2" style="color:#9FB0BC">Conecte provedores externos de IA e APIs próprias</p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Nova API</v-btn>
    </div>

    <!-- Atalhos de provider -->
    <v-row class="mb-6" dense>
      <v-col v-for="p in providerSuggestions" :key="p.id" cols="4" sm="2">
        <v-card class="glass pa-3 text-center cursor-pointer" border @click="prefill(p)" style="transition:transform .15s" @mouseenter="$event.currentTarget.style.transform='translateY(-2px)'" @mouseleave="$event.currentTarget.style.transform=''">
          <v-icon :icon="p.icon" :color="p.color" size="32" class="mb-2" />
          <div class="text-caption font-weight-bold">{{ p.name }}</div>
        </v-card>
      </v-col>
    </v-row>

    <div v-if="loading" class="py-12 text-center"><v-progress-circular indeterminate color="primary" /></div>

    <v-card v-else class="glass" border>
      <v-data-table :headers="headers" :items="apis" item-value="id" class="bg-transparent" :items-per-page="25">
        <template #item.name="{ item }">
          <div class="d-flex align-center ga-3 py-1">
            <v-icon :icon="providerIcon(item.provider)" :color="providerColor(item.provider)" size="22" />
            <div>
              <div class="text-body-2 font-weight-medium">{{ item.name }}</div>
              <div class="text-caption font-mono text-truncate" style="color:#9FB0BC;max-width:160px">{{ item.base_url }}</div>
            </div>
          </div>
        </template>
        <template #item.provider="{ item }">
          <v-chip variant="outlined" size="small">{{ item.provider }}</v-chip>
        </template>
        <template #item.active="{ item }">
          <v-chip :color="item.active ? 'success' : 'error'" variant="tonal" size="small">{{ item.active ? 'Ativa' : 'Inativa' }}</v-chip>
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex ga-1 justify-end">
            <v-btn icon variant="text" size="small" :loading="testing === item.id" title="Testar conexão" @click="testApi(item)"><v-icon icon="mdi-test-tube" size="16" /></v-btn>
            <v-btn icon variant="text" size="small" @click="openEdit(item)"><v-icon icon="mdi-pencil-outline" size="16" /></v-btn>
            <v-btn icon variant="text" size="small" color="error" @click="doDelete(item)"><v-icon icon="mdi-delete-outline" size="16" /></v-btn>
          </div>
        </template>
        <template #no-data>
          <div class="py-8 text-center" style="color:#6B7C88">Nenhuma API cadastrada. Clique num provider acima para começar.</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Dialog: criar/editar -->
    <v-dialog v-model="editDialog" max-width="500">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">{{ editMode ? 'Editar' : 'Nova' }} API</v-card-title>
        <v-card-text>
          <div class="d-flex ga-3 mb-3">
            <v-text-field v-model="editForm.name" label="Nome" class="flex-1" />
            <v-select v-model="editForm.provider" :items="providerSuggestions.map((p) => ({ title: p.name, value: p.id }))" label="Provider" style="max-width:140px" />
          </div>
          <v-text-field v-model="editForm.base_url" label="Base URL" placeholder="https://api.openai.com/v1" class="mb-3" />
          <v-text-field v-model="editForm.api_key" type="password" :label="editMode ? 'API Key (em branco = manter)' : 'API Key'" class="mb-3" />
          <v-text-field v-model="editForm.model" label="Modelo padrão (ex: gpt-4o-mini)" />
          <v-alert v-if="editError" type="error" variant="tonal" density="compact" :text="editError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveApi">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { customApiSchema } from '@/schemas/customApis'
import { validateForm } from '@/composables/useZodValidation'

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const testing = ref(null)
const apis = ref([])
const editDialog = ref(false)
const editMode = ref(false)
const editTarget = ref(null)
const editForm = reactive({ name: '', provider: 'openai', base_url: '', api_key: '', model: '' })
const editError = ref('')

const headers = [
  { title: 'API', key: 'name' },
  { title: 'Provider', key: 'provider' },
  { title: 'Modelo', key: 'model' },
  { title: 'Status', key: 'active' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
]

const providerSuggestions = [
  { id: 'openai',   name: 'OpenAI',   icon: 'mdi-robot-outline',          color: '#10B981', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'claude',   name: 'Claude',   icon: 'mdi-head-snowflake-outline', color: '#F59E0B', base_url: 'https://api.anthropic.com', model: 'claude-3-haiku-20240307' },
  { id: 'gemini',   name: 'Gemini',   icon: 'mdi-google',                 color: '#38BDF8', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-1.5-flash' },
  { id: 'deepseek', name: 'DeepSeek', icon: 'mdi-layers-triple-outline',  color: '#A78BFA', base_url: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { id: 'custom',   name: 'Própria',  icon: 'mdi-api',                    color: '#6B7C88', base_url: '', model: '' },
]

const iconMap = { openai: 'mdi-robot-outline', claude: 'mdi-head-snowflake-outline', gemini: 'mdi-google', deepseek: 'mdi-layers-triple-outline', custom: 'mdi-api' }
const colorMap = { openai: '#10B981', claude: '#F59E0B', gemini: '#38BDF8', deepseek: '#A78BFA', custom: '#6B7C88' }
function providerIcon(p) { return iconMap[p] || 'mdi-api' }
function providerColor(p) { return colorMap[p] || '#6B7C88' }

async function load() { loading.value = true; try { const { apis: a } = await api.listCustomApis(); apis.value = a } catch (e) { toast.error(e.message) } finally { loading.value = false } }

function prefill(p) { editMode.value = false; editTarget.value = null; editError.value = ''; Object.assign(editForm, { name: p.name, provider: p.id, base_url: p.base_url, api_key: '', model: p.model }); editDialog.value = true }
function openCreate() { editMode.value = false; editTarget.value = null; editError.value = ''; Object.assign(editForm, { name: '', provider: 'custom', base_url: '', api_key: '', model: '' }); editDialog.value = true }
function openEdit(a) { editMode.value = true; editTarget.value = a; editError.value = ''; Object.assign(editForm, { name: a.name, provider: a.provider, base_url: a.base_url, api_key: '', model: a.model || '' }); editDialog.value = true }

async function saveApi() {
  editError.value = ''
  const check = validateForm(customApiSchema, editForm)
  if (!check.success) { editError.value = check.error; return }
  saving.value = true
  try {
    const payload = { ...check.data }
    if (editMode.value && !payload.api_key) delete payload.api_key
    if (editMode.value) { const { api: updated } = await api.updateCustomApi(editTarget.value.id, payload); const idx = apis.value.findIndex((x) => x.id === editTarget.value.id); if (idx >= 0) apis.value[idx] = { ...apis.value[idx], ...updated } }
    else { const { api: created } = await api.createCustomApi(payload); apis.value.unshift(created) }
    editDialog.value = false; toast.success(editMode.value ? 'API atualizada.' : 'API criada.')
  } catch (e) { editError.value = e.message } finally { saving.value = false }
}

async function testApi(a) {
  testing.value = a.id
  try { const { reply } = await api.testCustomApi(a.id); toast.success(`✓ Resposta: "${reply.slice(0, 100)}"`) }
  catch (e) { toast.error('Erro: ' + e.message) } finally { testing.value = null }
}

async function doDelete(a) {
  try { await api.deleteCustomApi(a.id); apis.value = apis.value.filter((x) => x.id !== a.id); toast.success('API excluída.') }
  catch (e) { toast.error(e.message) }
}

onMounted(load)
</script>
