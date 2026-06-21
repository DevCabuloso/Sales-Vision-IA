<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Leads</h1>
        <p class="text-body-2" style="color:#9FB0BC">{{ leads.length }} leads na sua base.</p>
      </div>
      <div class="d-flex ga-3">
        <v-text-field v-model="search" placeholder="Buscar..." prepend-inner-icon="mdi-magnify" density="compact" hide-details style="max-width:220px" />
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Novo lead</v-btn>
      </div>
    </div>

    <v-card class="glass" border>
      <v-data-table
        :headers="headers"
        :items="filtered"
        :loading="loading"
        item-value="id"
        class="bg-transparent"
        :items-per-page="25"
      >
        <template #item.name="{ item }">
          <span class="font-weight-medium">{{ item.name || '—' }}</span>
        </template>
        <template #item.stage="{ item }">
          <v-chip variant="outlined" size="small">{{ item.stage || 'Novo Lead' }}</v-chip>
        </template>
        <template #item.score="{ item }">
          <v-chip :color="scoreColor(item.score)" variant="tonal" size="small">{{ item.score ?? 0 }}</v-chip>
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex ga-1 justify-end">
            <v-btn icon variant="text" size="small" :loading="analyzing === item.id" title="Re-analisar IA" @click="analyze(item)">
              <v-icon icon="mdi-robot-outline" size="18" />
            </v-btn>
            <v-btn icon variant="text" size="small" color="error" @click="remove(item)">
              <v-icon icon="mdi-delete-outline" size="18" />
            </v-btn>
          </div>
        </template>
        <template #no-data>
          <div class="py-8 text-center" style="color:#6B7C88">Nenhum lead encontrado.</div>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="dialog" max-width="460">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Novo lead</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" label="Nome" class="mb-2" />
          <v-text-field v-model="form.phone" label="Telefone (5548999999999)" class="mb-2" />
          <v-text-field v-model="form.intention" label="Intenção (opcional)" class="mb-2" />
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" :text="formError" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="create">Adicionar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { useRealtime } from '@/composables/useRealtime'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const analyzing = ref(null)
const leads = ref([])
const search = ref('')
const dialog = ref(false)
const formError = ref('')
const form = reactive({ name: '', phone: '', intention: '' })

const headers = [
  { title: 'Nome', key: 'name' },
  { title: 'Telefone', key: 'phone' },
  { title: 'Etapa', key: 'stage' },
  { title: 'Score', key: 'score' },
  { title: 'Intenção', key: 'intention' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
]

const filtered = computed(() => {
  if (!search.value) return leads.value
  const q = search.value.toLowerCase()
  return leads.value.filter((l) => (l.name || '').toLowerCase().includes(q) || (l.phone || '').includes(q))
})

function scoreColor(s) { if ((s ?? 0) >= 70) return 'success'; if ((s ?? 0) >= 40) return 'warning'; return 'error' }

function openCreate() { form.name = ''; form.phone = ''; form.intention = ''; formError.value = ''; dialog.value = true }

async function load() { leads.value = (await api.listLeads().catch(() => [])) || [] }

async function create() {
  formError.value = ''
  if (!form.phone) { formError.value = 'Telefone é obrigatório.'; return }
  saving.value = true
  try {
    await api.createLead({ name: form.name, phone: form.phone, intention: form.intention })
    dialog.value = false; toast.success('Lead adicionado.'); await load()
  } catch (e) { formError.value = e.message } finally { saving.value = false }
}

async function analyze(lead) {
  analyzing.value = lead.id
  try { await api.analyzeLead(lead.id); toast.success('Lead re-analisado pela IA.'); await load() }
  catch (e) { toast.error(e.message) } finally { analyzing.value = null }
}

async function remove(lead) {
  try { await api.deleteLead(lead.id); await load() }
  catch (e) { toast.error(e.message) }
}

onMounted(async () => { try { await load() } finally { loading.value = false } })

let t = null
useRealtime('leads', auth.user?.tenantId, () => { clearTimeout(t); t = setTimeout(load, 300) })
</script>
