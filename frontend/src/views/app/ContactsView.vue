<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-5 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Contatos</h1>
        <p class="text-body-2" style="color:#9FB0BC">{{ contacts.length }} contatos na base</p>
      </div>
      <div class="d-flex ga-2 flex-wrap">
        <v-btn variant="tonal" prepend-icon="mdi-upload" @click="importDialog = true">Importar</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-download" @click="exportContacts">Exportar</v-btn>
        <v-btn color="warning" variant="tonal" prepend-icon="mdi-content-duplicate" :loading="deduping" @click="deduplicate">Remover duplicados</v-btn>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Novo Contato</v-btn>
      </div>
    </div>

    <div class="d-flex ga-3 mb-4 flex-wrap align-center">
      <v-text-field v-model="search" placeholder="Buscar por nome, telefone ou e-mail..." prepend-inner-icon="mdi-magnify" density="compact" hide-details style="max-width:340px" clearable @input="debouncedLoad" />
      <v-btn icon variant="text" :loading="loading" @click="load"><v-icon icon="mdi-refresh" /></v-btn>
    </div>

    <v-card class="glass" border>
      <div style="overflow-x:auto">
      <v-data-table :headers="headers" :items="contacts" :loading="loading" item-value="id" class="bg-transparent" :items-per-page="25">
        <template #item.name="{ item }">
          <div class="d-flex align-center ga-3 py-1">
            <div class="contact-avatar d-flex align-center justify-center">
              <span>{{ (item.name || item.phone).slice(0, 2).toUpperCase() }}</span>
            </div>
            <div>
              <div class="text-body-2 font-weight-medium">{{ item.name || '—' }}</div>
              <div class="text-caption font-mono" style="color:#9FB0BC">{{ item.phone }}</div>
            </div>
          </div>
        </template>
        <template #item.tags="{ item }">
          <div class="d-flex flex-wrap ga-1">
            <v-chip v-for="tag in (item.tags || [])" :key="tag" color="primary" variant="tonal" size="x-small">{{ tag }}</v-chip>
            <span v-if="!item.tags?.length" style="color:#9FB0BC">—</span>
          </div>
        </template>
        <template #item.stage="{ item }">
          <v-chip
            variant="tonal" size="small"
            :style="`background:${stageBadgeColor(item.stage)}22;color:${stageBadgeColor(item.stage)}`"
          >{{ item.stage }}</v-chip>
        </template>
        <template #item.created_at="{ item }">
          <span class="text-caption">{{ formatDate(item.created_at) }}</span>
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex ga-1 justify-end">
            <v-btn icon variant="text" size="small" color="success" :to="`/chat/${item.id}`" title="Chat"><v-icon icon="mdi-chat-outline" size="16" /></v-btn>
            <v-btn icon variant="text" size="small" @click="openEdit(item)"><v-icon icon="mdi-pencil-outline" size="16" /></v-btn>
            <v-btn icon variant="text" size="small" color="error" @click="confirmDelete(item)"><v-icon icon="mdi-delete-outline" size="16" /></v-btn>
          </div>
        </template>
        <template #no-data>
          <div class="py-8 text-center" style="color:#6B7C88">Nenhum contato encontrado.</div>
        </template>
      </v-data-table>
      </div>
    </v-card>

    <!-- Dialog: criar/editar -->
    <v-dialog v-model="formDialog" max-width="460">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">{{ editing ? 'Editar Contato' : 'Novo Contato' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" label="Nome" class="mb-2" />
          <v-text-field v-model="form.phone" label="Telefone *" class="mb-2" />
          <v-text-field v-model="form.email" label="E-mail" type="email" class="mb-2" />
          <v-combobox
            v-model="form.tags"
            :items="availableTags"
            label="Etiquetas"
            multiple
            chips
            closable-chips
            clearable
            density="compact"
            class="mb-3"
            placeholder="Selecione ou crie etiquetas..."
          >
            <template #chip="{ item, props }">
              <v-chip v-bind="props" closable size="small" :style="{ background: labelColor(item.value) + '22', borderColor: labelColor(item.value) + '55', color: labelColor(item.value) }">
                <span class="label-chip-dot" :style="{ background: labelColor(item.value) }" />
                {{ item.value }}
              </v-chip>
            </template>
            <template #item="{ item, props }">
              <v-list-item v-bind="props" :title="undefined">
                <template #prepend>
                  <span class="label-list-dot" :style="{ background: labelColor(item.value) }" />
                </template>
                {{ item.value }}
              </v-list-item>
            </template>
          </v-combobox>
          <v-select v-model="form.stage" :items="stages" label="Estágio" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="formDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="save">{{ editing ? 'Salvar' : 'Criar' }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: excluir -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Excluir contato</v-card-title>
        <v-card-text>Excluir <strong>{{ deleteTarget?.name || deleteTarget?.phone }}</strong>? Irreversível.</v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" :loading="deleting" @click="deleteContact">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: importar -->
    <v-dialog v-model="importDialog" max-width="460">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Importar Contatos</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-4" style="color:#9FB0BC">Selecione um arquivo CSV, XLSX, XLS ou TXT com colunas de <strong>Nome</strong> e <strong>Telefone</strong>.</p>
          <v-file-input label="Arquivo" accept=".csv,.xlsx,.xls,.txt" variant="outlined" density="compact" @change="onFileChange" />
          <v-alert v-if="importResult" :type="importResult.error ? 'error' : 'success'" variant="tonal" density="compact" class="mt-2">
            <span v-if="importResult.error">{{ importResult.error }}</span>
            <span v-else>{{ importResult.imported }} importados · {{ importResult.skipped }} ignorados</span>
          </v-alert>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="importDialog = false; importResult = null; importFile = null">Fechar</v-btn>
          <v-btn color="primary" :loading="importing" :disabled="!importFile" @click="runImport">Importar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api, http } from '@/services/api'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const contacts = ref([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const deduping = ref(false)
const importing = ref(false)
const search = ref('')
const formDialog = ref(false)
const deleteDialog = ref(false)
const importDialog = ref(false)
const editing = ref(null)
const deleteTarget = ref(null)
const importFile = ref(null)
const importResult = ref(null)
const availableLabels = ref([])
const availableTags = computed(() => availableLabels.value.map((l) => l.name))
const form = reactive({ name: '', phone: '', email: '', tags: [], stage: 'Novo Lead' })
const stages = ['Novo Lead', 'Em Qualificação', 'Qualificado', 'Reunião Agendada', 'Vendido', 'Perdido']

const headers = [
  { title: 'Contato', key: 'name' },
  { title: 'E-mail', key: 'email' },
  { title: 'Etiquetas', key: 'tags', sortable: false },
  { title: 'Estágio', key: 'stage' },
  { title: 'Cadastrado', key: 'created_at' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
]

function stageBadgeColor(s) {
  return {
    'Novo Lead': '#6366F1',
    'Em Qualificação': '#38BDF8',
    'Qualificado': '#10B981',
    'Reunião Agendada': '#F59E0B',
    'Perdido': '#EF4444',
    'Vendido': '#A855F7',
  }[s] || '#6366F1'
}
function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('pt-BR') }
async function loadTags() {
  try { availableLabels.value = (await http.get('/labels').then((r) => r.data)).labels || [] } catch { /* */ }
}

function labelColor(name) {
  return availableLabels.value.find((l) => l.name === name)?.color || '#6366F1'
}

let debounceTimer = null
function debouncedLoad() { clearTimeout(debounceTimer); debounceTimer = setTimeout(load, 400) }

async function load() {
  loading.value = true
  try { const params = {}; if (search.value) params.search = search.value; contacts.value = await api.listContacts(params) }
  catch (e) { toast.error(e.message) } finally { loading.value = false }
}

function openCreate() { editing.value = null; Object.assign(form, { name: '', phone: '', email: '', tags: [], stage: 'Novo Lead' }); formDialog.value = true }
function openEdit(c) { editing.value = c; Object.assign(form, { name: c.name || '', phone: c.phone || '', email: c.email || '', tags: [...(c.tags || [])], stage: c.stage || 'Novo Lead' }); formDialog.value = true }

async function save() {
  if (!form.phone) return toast.error('Telefone é obrigatório.')
  saving.value = true
  try {
    const payload = { name: form.name || null, phone: form.phone, email: form.email || null, tags: form.tags, stage: form.stage }
    if (editing.value) {
      const updated = await api.updateContact(editing.value.id, payload)
      const idx = contacts.value.findIndex((c) => c.id === editing.value.id)
      if (idx !== -1) contacts.value[idx] = updated
      toast.success('Contato atualizado.')
    } else { contacts.value.unshift(await api.createContact(payload)); toast.success('Contato criado.') }
    formDialog.value = false
    loadTags()
  } catch (e) { toast.error(e.message) } finally { saving.value = false }
}

function confirmDelete(c) { deleteTarget.value = c; deleteDialog.value = true }
async function deleteContact() {
  deleting.value = true
  try { await api.deleteContact(deleteTarget.value.id); contacts.value = contacts.value.filter((c) => c.id !== deleteTarget.value.id); deleteDialog.value = false; toast.success('Contato excluído.') }
  catch (e) { toast.error(e.message) } finally { deleting.value = false }
}

async function exportContacts() {
  try {
    const token = localStorage.getItem('sdr_token')
    const r = await fetch(`${http.defaults.baseURL}/contacts/export`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) throw new Error('Erro ao exportar')
    const blob = await r.blob(); const burl = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = burl; a.download = 'contatos.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(burl), 3000)
  } catch (e) { toast.error('Erro ao exportar: ' + e.message) }
}

function onFileChange(e) { importFile.value = e.target?.files?.[0] || null; importResult.value = null }
async function runImport() {
  if (!importFile.value) return
  importing.value = true; importResult.value = null
  try { importResult.value = await api.importContacts(importFile.value); await load() }
  catch (e) { importResult.value = { error: e.message } } finally { importing.value = false }
}

async function deduplicate() {
  deduping.value = true
  try { const { removed } = await api.deduplicateContacts(); await load(); toast.success(removed > 0 ? `${removed} duplicado(s) removido(s).` : 'Nenhum duplicado encontrado.') }
  catch (e) { toast.error(e.message) } finally { deduping.value = false }
}

onMounted(() => { load(); loadTags() })
</script>

<style scoped>
.contact-avatar {
  width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
  background: rgba(99,102,241,0.15); font-size: 12px; font-weight: 700; color: #818CF8;
}
.label-chip-dot {
  width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 5px; flex-shrink: 0;
}
.label-list-dot {
  width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 10px; flex-shrink: 0;
}
</style>
