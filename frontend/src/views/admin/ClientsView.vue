<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h4 font-weight-bold mb-1">Clientes</h1>
        <p class="text-body-2" style="color:#9FB0BC">{{ clients.length }} clientes na plataforma.</p>
      </div>
      <v-btn color="accent" prepend-icon="mdi-plus" @click="openCreate">Novo cliente</v-btn>
    </div>

    <v-card class="glass" border>
      <v-data-table
        :headers="headers"
        :items="clients"
        :loading="loading"
        item-value="id"
        class="bg-transparent"
      >
        <template #item.name="{ item }">
          <div class="font-weight-medium">{{ item.name }}</div>
          <div class="text-caption" style="color:#9FB0BC">{{ item.slug }}</div>
        </template>
        <template #item.plan="{ item }">
          <v-chip variant="outlined" size="small">{{ item.plan }}</v-chip>
        </template>
        <template #item.status="{ item }">
          <v-chip :color="statusColor(item.status)" variant="tonal" size="small">
            {{ item.status }}
          </v-chip>
        </template>
        <template #item.features="{ item }">
          <div class="d-flex ga-1 flex-wrap">
            <v-tooltip v-for="f in featuresOf(item)" :key="f.key" :text="f.label">
              <template #activator="{ props }">
                <v-icon v-bind="props" :icon="f.icon" size="18" color="secondary" />
              </template>
            </v-tooltip>
            <span v-if="!featuresOf(item).length" class="text-caption" style="color:#6B7C88">—</span>
          </div>
        </template>
        <template #item.usage="{ item }">
          <span class="text-body-2">{{ item.leads_count }} leads · {{ item.appts_count }} reuniões</span>
        </template>
        <template #item.actions="{ item }">
          <v-btn icon variant="text" size="small" :to="`/admin/clientes/${item.id}`">
            <v-icon icon="mdi-cog-outline" />
          </v-btn>
          <v-btn
            icon variant="text" size="small"
            :color="item.status === 'suspended' ? 'success' : 'warning'"
            @click="toggleStatus(item)"
          >
            <v-icon :icon="item.status === 'suspended' ? 'mdi-play' : 'mdi-pause'" />
          </v-btn>
        </template>
        <template #no-data>
          <div class="py-8 text-center" style="color:#6B7C88">Nenhum cliente ainda.</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Dialog criar cliente -->
    <v-dialog v-model="dialog" max-width="560">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Novo cliente</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.name" label="Nome da empresa" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.slug" label="Slug" hint="ex: acme-corp" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select v-model="form.plan" :items="plans" label="Plano" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model.number="form.max_leads" label="Limite de leads" type="number" />
            </v-col>
            <v-col cols="12">
              <v-divider class="my-2" />
              <div class="text-body-2 mb-2" style="color:#9FB0BC">Usuário admin do cliente</div>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.adminEmail" label="E-mail do admin" type="email" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.adminPassword" label="Senha" type="password" />
            </v-col>
            <v-col cols="12">
              <div class="text-body-2 mb-2" style="color:#9FB0BC">Funções habilitadas</div>
              <div class="d-flex flex-wrap ga-2">
                <v-checkbox v-for="f in featureDefs" :key="f.key"
                  v-model="form.features[f.key]" :label="f.label" density="compact" hide-details />
              </div>
            </v-col>
          </v-row>
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" :text="formError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">Cancelar</v-btn>
          <v-btn color="accent" :loading="saving" @click="create">Criar cliente</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3500">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '@/services/api'

const loading = ref(true)
const saving = ref(false)
const clients = ref([])
const dialog = ref(false)
const formError = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })

const plans = ['trial', 'starter', 'pro', 'enterprise']

const featureDefs = [
  { key: 'feat_meta_api', label: 'Meta API', icon: 'mdi-whatsapp' },
  { key: 'feat_evolution_api', label: 'Evolution', icon: 'mdi-api' },
  { key: 'feat_hybrid', label: 'Híbrido', icon: 'mdi-shuffle-variant' },
  { key: 'feat_google_cal', label: 'Google Calendar', icon: 'mdi-calendar' },
  { key: 'feat_broadcast', label: 'Broadcast', icon: 'mdi-bullhorn-outline' },
]

const headers = [
  { title: 'Cliente', key: 'name' },
  { title: 'Plano', key: 'plan' },
  { title: 'Status', key: 'status' },
  { title: 'Funções', key: 'features', sortable: false },
  { title: 'Uso', key: 'usage', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' },
]

const blankForm = () => ({
  name: '', slug: '', plan: 'trial', max_leads: 1000,
  adminEmail: '', adminPassword: '',
  features: { feat_google_cal: true, feat_broadcast: true },
})
const form = reactive(blankForm())

function toast(text, color = 'success') {
  snack.text = text; snack.color = color; snack.show = true
}
function statusColor(s) {
  return { active: 'success', suspended: 'error', trial: 'warning' }[s] || 'info'
}
function featuresOf(c) {
  return featureDefs.filter((f) => c[f.key])
}

function openCreate() {
  Object.assign(form, blankForm())
  formError.value = ''
  dialog.value = true
}

async function load() {
  clients.value = (await api.adminClients().catch(() => [])) || []
}

async function create() {
  formError.value = ''
  if (!form.name || !form.slug || !form.adminEmail || !form.adminPassword) {
    formError.value = 'Preencha nome, slug, e-mail e senha do admin.'
    return
  }
  saving.value = true
  try {
    await api.adminCreateClient({ ...form })
    dialog.value = false
    toast('Cliente criado com sucesso.')
    await load()
  } catch (e) {
    formError.value = e.message
  } finally {
    saving.value = false
  }
}

async function toggleStatus(c) {
  const next = c.status === 'suspended' ? 'active' : 'suspended'
  try {
    await api.adminUpdateStatus(c.id, next)
    toast(next === 'active' ? 'Cliente reativado.' : 'Cliente suspenso.')
    await load()
  } catch (e) {
    toast(e.message, 'error')
  }
}

onMounted(async () => {
  try { await load() } finally { loading.value = false }
})
</script>
