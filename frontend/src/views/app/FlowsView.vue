<template>
  <div class="flows-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Chat Flow</h1>
        <p class="page-sub">Crie chatbots visuais para automatizar atendimentos</p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Novo Fluxo</v-btn>
    </div>

    <div v-if="loading" class="d-flex justify-center mt-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <div v-else-if="!flows.length" class="empty-state">
      <v-icon icon="mdi-robot-outline" size="56" style="opacity:.2" />
      <p class="mt-3">Nenhum fluxo criado ainda.</p>
      <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="openCreate">Criar primeiro fluxo</v-btn>
    </div>

    <div v-else class="flows-grid">
      <div v-for="f in flows" :key="f.id" class="flow-card">
        <div class="flow-card__header">
          <v-icon icon="mdi-robot-outline" size="22" style="color:#6366F1" />
          <v-chip :color="f.status === 'active' ? 'success' : 'default'" size="x-small" variant="tonal">
            {{ f.status === 'active' ? 'Ativo' : 'Inativo' }}
          </v-chip>
        </div>
        <div class="flow-card__name">{{ f.name }}</div>
        <div class="flow-card__meta">
          <span><v-icon icon="mdi-graph-outline" size="13" /> {{ nodeCount(f) }} nós</span>
          <span><v-icon icon="mdi-clock-outline" size="13" /> {{ formatDate(f.updated_at) }}</span>
        </div>
        <div v-if="f.trigger_keywords?.length" class="flow-card__kws">
          <v-chip v-for="kw in f.trigger_keywords.slice(0,3)" :key="kw" size="x-small" variant="outlined" color="primary">{{ kw }}</v-chip>
        </div>
        <div class="flow-card__actions">
          <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-pencil-outline" @click="edit(f.id)">Editar</v-btn>
          <v-btn size="small" variant="tonal" :color="f.status === 'active' ? 'warning' : 'success'"
            :prepend-icon="f.status === 'active' ? 'mdi-pause' : 'mdi-play'"
            @click="toggleStatus(f)">
            {{ f.status === 'active' ? 'Pausar' : 'Ativar' }}
          </v-btn>
          <v-btn size="small" variant="tonal" color="error" icon="mdi-delete-outline" @click="confirmDelete(f)" />
        </div>
      </div>
    </div>

    <!-- Dialog: criar fluxo -->
    <v-dialog v-model="createDialog" max-width="480" persistent>
      <v-card class="dialog-card">
        <v-card-title>Novo Fluxo</v-card-title>
        <v-card-text class="pt-4">
          <v-text-field v-model="form.name" label="Nome do fluxo" variant="outlined" density="compact" autofocus />
          <v-select
            v-model="form.channel_id"
            :items="channels"
            item-title="name"
            item-value="id"
            label="Canal vinculado (opcional)"
            variant="outlined"
            density="compact"
            clearable
            class="mt-2"
          />
          <v-combobox
            v-model="form.trigger_keywords"
            label="Palavras-gatilho (opcional)"
            hint="Digite e pressione Enter para adicionar"
            variant="outlined"
            density="compact"
            chips
            multiple
            clearable
            class="mt-2"
          />
        </v-card-text>
        <v-card-actions class="pb-4 px-6">
          <v-spacer />
          <v-btn variant="text" @click="createDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="createFlow">Criar e Editar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: confirmar exclusão -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card class="dialog-card">
        <v-card-title>Excluir fluxo</v-card-title>
        <v-card-text>Tem certeza que deseja excluir <strong>{{ deleteTarget?.name }}</strong>? As sessões ativas serão encerradas.</v-card-text>
        <v-card-actions class="pb-4 px-6">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" :loading="deleting" @click="doDelete">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { http } from '@/services/api'
import { createFlowSchema } from '@/schemas/flows'
import { validateForm } from '@/composables/useZodValidation'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const router  = useRouter()
const flows   = ref([])
const channels = ref([])
const loading = ref(true)
const saving  = ref(false)
const deleting = ref(false)
const createDialog = ref(false)
const deleteDialog = ref(false)
const deleteTarget = ref(null)

const form = ref({ name: '', channel_id: null, trigger_keywords: [] })

onMounted(async () => {
  await Promise.all([loadFlows(), loadChannels()])
  loading.value = false
})

async function loadFlows() {
  const { data } = await http.get('/flows')
  flows.value = data.flows || []
}

async function loadChannels() {
  try {
    const { data } = await http.get('/channels')
    channels.value = data.channels || []
  } catch { /* ignora */ }
}

function nodeCount(f) { return (f.nodes || []).length }

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function openCreate() {
  form.value = { name: '', channel_id: null, trigger_keywords: [] }
  createDialog.value = true
}

async function createFlow() {
  const check = validateForm(createFlowSchema, {
    name: form.value.name,
    channel_id: form.value.channel_id || null,
    trigger_keywords: form.value.trigger_keywords || [],
  })
  if (!check.success) { toast.error(check.error); return }
  saving.value = true
  try {
    const { data } = await http.post('/flows', check.data)
    createDialog.value = false
    router.push(`/flows/${data.flow.id}`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

function edit(id) { router.push(`/flows/${id}`) }

async function toggleStatus(f) {
  const next = f.status === 'active' ? 'inactive' : 'active'
  await http.patch(`/flows/${f.id}`, { status: next })
  f.status = next
}

function confirmDelete(f) { deleteTarget.value = f; deleteDialog.value = true }

async function doDelete() {
  deleting.value = true
  try {
    await http.delete(`/flows/${deleteTarget.value.id}`)
    flows.value = flows.value.filter(f => f.id !== deleteTarget.value.id)
    deleteDialog.value = false
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.flows-page { padding: 28px; max-width: 1100px; }

.page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 28px;
}
.page-title { font-size: 22px; font-weight: 700; color: var(--text-primary, #E2E8F0); margin: 0; }
.page-sub   { font-size: 13px; color: var(--text-muted, #6B7C88); margin: 2px 0 0; }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 64px 0; color: var(--text-muted, #6B7C88); text-align: center; gap: 12px;
}

.flows-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.flow-card {
  background: var(--glass-bg, rgba(20,28,45,0.95));
  border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
  border-radius: 14px;
  padding: 18px;
  display: flex; flex-direction: column; gap: 10px;
  transition: border-color 0.15s;
}
.flow-card:hover { border-color: rgba(99,102,241,0.4); }

.flow-card__header { display: flex; align-items: center; justify-content: space-between; }
.flow-card__name   { font-size: 15px; font-weight: 600; color: var(--text-primary, #E2E8F0); }
.flow-card__meta   { display: flex; gap: 12px; font-size: 11px; color: var(--text-muted, #6B7C88); }
.flow-card__meta span { display: flex; align-items: center; gap: 4px; }
.flow-card__kws    { display: flex; gap: 4px; flex-wrap: wrap; }
.flow-card__actions { display: flex; gap: 6px; margin-top: 4px; }

.dialog-card { background: #141C2D !important; }
</style>
