<template>
  <div>
    <div class="mb-5">
      <h1 class="text-h5 font-weight-bold mb-1">Auditoria</h1>
      <p class="text-body-2" style="color:#9FB0BC">Histórico de alterações feitas por administradores e operadores</p>
    </div>

    <v-card class="glass mb-4 pa-4" border>
      <div class="d-flex flex-wrap ga-3 align-center">
        <v-select
          v-model="filters.entity" :items="entityOptions" label="Entidade" clearable
          density="compact" hide-details style="max-width:220px"
        />
        <v-text-field v-model="filters.from" type="date" label="De" density="compact" hide-details style="max-width:180px" />
        <v-text-field v-model="filters.to" type="date" label="Até" density="compact" hide-details style="max-width:180px" />
        <v-btn color="primary" variant="tonal" @click="load">Filtrar</v-btn>
        <v-btn variant="text" @click="clearFilters">Limpar</v-btn>
      </div>
    </v-card>

    <v-card class="glass" border>
      <v-data-table :headers="headers" :items="entries" :loading="loading" item-value="id" class="bg-transparent" :items-per-page="25">
        <template #item.createdAt="{ item }">
          {{ formatDate(item.createdAt) }}
        </template>
        <template #item.entity="{ item }">
          <v-chip variant="tonal" size="small">{{ entityLabel(item.entity) }}</v-chip>
        </template>
        <template #item.action="{ item }">
          <v-chip :color="actionColor(item.action)" variant="tonal" size="small">{{ actionLabel(item.action) }}</v-chip>
        </template>
        <template #item.actorName="{ item }">
          {{ item.actorName }}
        </template>
        <template #item.details="{ item }">
          <v-btn size="small" variant="text" @click="openDetails(item)">Ver detalhes</v-btn>
        </template>
        <template #no-data>
          <div class="py-8 text-center" style="color:#6B7C88">Nenhum evento de auditoria encontrado.</div>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="detailsDialog" max-width="520">
      <v-card class="glass pa-2" border v-if="selected">
        <v-card-title class="text-h6 font-weight-bold">{{ entityLabel(selected.entity) }} — {{ actionLabel(selected.action) }}</v-card-title>
        <v-card-text>
          <div class="text-caption mb-1" style="color:#9FB0BC">Ator</div>
          <div class="mb-3">{{ selected.actorName }}</div>
          <div class="text-caption mb-1" style="color:#9FB0BC">Registro afetado</div>
          <div class="mb-3">{{ selected.entityId || '—' }}</div>
          <div class="text-caption mb-1" style="color:#9FB0BC">Alterações</div>
          <pre class="details-pre">{{ JSON.stringify(selected.changes, null, 2) }}</pre>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="detailsDialog = false">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '@/services/api'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const loading = ref(true)
const entries = ref([])
const detailsDialog = ref(false)
const selected = ref(null)

const filters = reactive({ entity: null, from: '', to: '' })

const entityOptions = [
  { title: 'Lead', value: 'lead' },
  { title: 'Operador', value: 'operator' },
  { title: 'Template', value: 'template' },
  { title: 'Canal', value: 'channel' },
  { title: 'Fluxo (Chat Flow)', value: 'flow' },
  { title: 'Acompanhamento', value: 'followup' },
  { title: 'Horário de funcionamento', value: 'business_hours' },
  { title: 'Configurações operacionais', value: 'op_settings' },
  { title: 'Configuração de IA', value: 'ai_config' },
  { title: 'API personalizada', value: 'custom_api' },
  { title: 'Fila', value: 'queue' },
  { title: 'Etiqueta', value: 'label' },
]

const headers = [
  { title: 'Data/Hora', key: 'createdAt' },
  { title: 'Ator', key: 'actorName' },
  { title: 'Entidade', key: 'entity' },
  { title: 'Ação', key: 'action' },
  { title: '', key: 'details', sortable: false, align: 'end' },
]

function entityLabel(entity) {
  return entityOptions.find((o) => o.value === entity)?.title || entity || '—'
}
function actionLabel(action) {
  const map = { create: 'Criação', update: 'Atualização', delete: 'Exclusão', rename: 'Renomeação', disconnect: 'Desconexão', password_reset: 'Reset de senha', bulk_delete: 'Exclusão em massa' }
  return map[action] || action || '—'
}
function actionColor(action) {
  if (action === 'delete' || action === 'bulk_delete') return 'error'
  if (action === 'create') return 'success'
  return undefined
}
function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

function openDetails(item) {
  selected.value = item
  detailsDialog.value = true
}

function clearFilters() {
  filters.entity = null
  filters.from = ''
  filters.to = ''
  load()
}

async function load() {
  loading.value = true
  try {
    const params = {}
    if (filters.entity) params.entity = filters.entity
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    const data = await api.listAuditLog(params)
    entries.value = data.entries || []
  } catch (e) {
    toast.error(e.message || 'Falha ao carregar auditoria.')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.details-pre {
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  max-height: 300px;
  overflow-y: auto;
}
</style>
