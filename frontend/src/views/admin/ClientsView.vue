<template>
  <div class="admin-page">
    <!-- Header -->
    <div class="page-header mb-5">
      <div>
        <h1 class="page-title">Clientes</h1>
        <p class="page-sub">{{ filtered.length }} de {{ clients.length }} tenant{{ clients.length !== 1 ? 's' : '' }} na plataforma</p>
      </div>
      <div class="d-flex align-center ga-2">
        <v-text-field
          v-model="search"
          placeholder="Buscar cliente..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined" density="compact" hide-details clearable
          style="max-width:240px"
          bg-color="transparent"
        />
        <v-btn
          icon variant="text" size="small"
          :loading="loading"
          @click="load"
        >
          <v-icon icon="mdi-refresh" />
        </v-btn>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" @click="openCreate">
          Novo Cliente
        </v-btn>
      </div>
    </div>

    <!-- Table -->
    <div class="ztable-wrap">
      <div v-if="loading" class="ztable-spinner">
        <v-progress-circular indeterminate color="primary" size="28" width="2" />
      </div>
      <table class="ztable" :class="{ 'ztable--faded': loading }">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Status</th>
            <th>Plano</th>
            <th>Leads</th>
            <th>Criado em</th>
            <th style="text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in filtered" :key="c.id"
            class="ztable-row"
            @click="$router.push(`/admin/clientes/${c.id}`)"
          >
            <td>
              <div class="d-flex align-center ga-3">
                <div class="z-avatar" :style="{ background: avatarBg(c.name), borderColor: avatarColor(c.name) }">
                  <span :style="{ color: avatarColor(c.name) }">{{ initials(c.name) }}</span>
                </div>
                <div>
                  <div class="ztable-name">{{ c.name }}</div>
                  <div class="ztable-sub">{{ c.slug }}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="z-badge" :class="`z-badge--${c.status}`">
                {{ { active: 'Ativo', suspended: 'Suspenso', trial: 'Trial' }[c.status] || c.status }}
              </span>
            </td>
            <td>
              <span class="z-badge z-badge--plan">{{ c.plan }}</span>
            </td>
            <td class="ztable-num">{{ c.leads_count ?? 0 }}</td>
            <td class="ztable-sub">{{ formatDate(c.created_at) }}</td>
            <td style="text-align:right; white-space:nowrap" @click.stop>
              <v-btn icon variant="text" size="small" :to="`/admin/clientes/${c.id}`">
                <v-icon icon="mdi-pencil-outline" size="17" />
              </v-btn>
              <v-menu location="bottom end">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon variant="text" size="small">
                    <v-icon icon="mdi-dots-vertical" size="17" />
                  </v-btn>
                </template>
                <v-list density="compact" min-width="180" class="py-1">
                  <v-list-item :to="`/admin/clientes/${c.id}`" prepend-icon="mdi-cog-outline" title="Configurações" />
                  <v-list-item
                    :prepend-icon="c.status === 'suspended' ? 'mdi-play-circle-outline' : 'mdi-pause-circle-outline'"
                    :title="c.status === 'suspended' ? 'Reativar' : 'Suspender'"
                    @click="toggleStatus(c)"
                  />
                  <v-divider class="my-1" />
                  <v-list-item
                    prepend-icon="mdi-delete-outline"
                    title="Excluir"
                    class="text-error"
                    @click="openDeleteConfirm(c)"
                  />
                </v-list>
              </v-menu>
            </td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="6" class="ztable-empty">
              <v-icon icon="mdi-domain-off" size="40" style="opacity:.2" />
              <p>Nenhum cliente encontrado.</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Dialog: novo cliente -->
    <v-dialog v-model="dialog" max-width="580">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold pa-4 pb-2">Novo Cliente</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.name" label="Nome da empresa" variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.slug" label="Slug" hint="ex: acme-corp" variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select v-model="form.plan" :items="plans" label="Plano" variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model.number="form.max_leads" label="Limite de leads" type="number" variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12">
              <v-divider class="my-2" />
              <p class="text-caption mb-3" style="color:#9FB0BC">Usuário administrador do cliente</p>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.adminEmail" label="E-mail do admin" type="email" variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.adminPassword" label="Senha" type="password" variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12">
              <v-divider class="my-2" />
              <p class="text-caption mb-3" style="color:#9FB0BC">Funções habilitadas</p>
              <div class="features-grid">
                <label v-for="f in featureDefs" :key="f.key" class="feat-toggle" :class="{ active: form.features[f.key] }">
                  <v-icon :icon="f.icon" size="16" />
                  <span>{{ f.label }}</span>
                  <input type="checkbox" v-model="form.features[f.key]" style="display:none" />
                </label>
              </div>
            </v-col>
          </v-row>
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" :text="formError" class="mt-3" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="create">Criar Cliente</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: excluir cliente -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Excluir cliente</v-card-title>
        <v-card-text>
          Confirma a exclusão de <strong>{{ deleteTarget?.name }}</strong>?
          <div class="text-caption mt-1" style="color:#F87171">Esta ação é irreversível.</div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="doDelete">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3500">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/services/api'
import { createClientSchema } from '@/schemas/admin'
import { validateForm } from '@/composables/useZodValidation'

const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const clients = ref([])
const dialog = ref(false)
const formError = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })

const deleteDialog = ref(false)
const deleteTarget = ref(null)

const search = ref('')
const plans = ['trial', 'starter', 'pro', 'enterprise']

const featureDefs = [
  { key: 'feat_evolution_api', label: 'Evolution API',   icon: 'mdi-cellphone-wireless' },
  { key: 'feat_meta_api',      label: 'Meta API',         icon: 'mdi-whatsapp' },
  { key: 'feat_hybrid',        label: 'Modo Híbrido',     icon: 'mdi-shuffle-variant' },
  { key: 'feat_google_cal',    label: 'Google Calendar',  icon: 'mdi-calendar' },
  { key: 'feat_broadcast',     label: 'Broadcast',        icon: 'mdi-bullhorn-outline' },
  { key: 'feat_kanban',        label: 'CRM Kanban',       icon: 'mdi-view-column-outline' },
  { key: 'feat_agenda',        label: 'Agenda',           icon: 'mdi-calendar-clock-outline' },
  { key: 'feat_contacts',      label: 'Contatos',         icon: 'mdi-contacts-outline' },
  { key: 'feat_ia_config',     label: 'Config IA',        icon: 'mdi-robot-outline' },
  { key: 'feat_operators',     label: 'Operadores',       icon: 'mdi-account-group-outline' },
  { key: 'feat_custom_apis',   label: 'APIs Externas',    icon: 'mdi-api' },
]

const AVATAR_COLORS = ['#6366F1','#8B5CF6','#EC4899','#06B6D4','#10B981','#F59E0B','#EF4444','#14B8A6']
function _colorIdx(name = '') {
  return [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length
}
function avatarColor(name = '') { return AVATAR_COLORS[_colorIdx(name)] }
function avatarBg(name = '') { return AVATAR_COLORS[_colorIdx(name)] + '1A' }
function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'
}

const blankForm = () => ({
  name: '', slug: '', plan: 'trial', max_leads: 1000,
  adminEmail: '', adminPassword: '',
  features: {
    feat_evolution_api: false, feat_meta_api: false, feat_hybrid: false,
    feat_google_cal: true, feat_broadcast: true,
    feat_kanban: true, feat_agenda: true, feat_contacts: true,
    feat_ia_config: true, feat_operators: true, feat_custom_apis: false,
  },
})
const form = reactive(blankForm())

const filtered = computed(() => {
  if (!search.value) return clients.value
  const q = search.value.toLowerCase()
  return clients.value.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.slug || '').toLowerCase().includes(q)
  )
})

function toast(text, color = 'success') {
  snack.text = text; snack.color = color; snack.show = true
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function openCreate() {
  Object.assign(form, blankForm())
  formError.value = ''
  dialog.value = true
}

function openDeleteConfirm(c) {
  deleteTarget.value = c
  deleteDialog.value = true
}

async function load() {
  loading.value = true
  try {
    clients.value = (await api.adminClients().catch(() => [])) || []
  } finally {
    loading.value = false
  }
}

async function create() {
  formError.value = ''
  const check = validateForm(createClientSchema, {
    name: form.name, slug: form.slug, adminEmail: form.adminEmail, adminPassword: form.adminPassword,
  })
  if (!check.success) { formError.value = check.error; return }
  saving.value = true
  try {
    await api.adminCreateClient({ ...form, ...check.data })
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

async function doDelete() {
  if (!deleteTarget.value) return
  saving.value = true
  try {
    await api.adminDeleteClient(deleteTarget.value.id)
    deleteDialog.value = false
    toast('Cliente excluído.')
    await load()
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.admin-page { padding: 0; }

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text-primary, #E2E8F0);
}
.page-sub {
  font-size: 0.8rem;
  color: #6B7C88;
  margin-top: 2px;
}

/* Table */
.ztable-wrap {
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  background: var(--glass-bg, #1C2333);
  position: relative;
}
.ztable-spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.3);
  z-index: 5;
  border-radius: 12px;
}
.ztable--faded { opacity: 0.5; pointer-events: none; }
.ztable {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.ztable thead th {
  padding: 11px 16px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #6B7C88;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  white-space: nowrap;
}
.ztable tbody td {
  padding: 11px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  vertical-align: middle;
  color: var(--text-primary, #E2E8F0);
}
.ztable-row {
  cursor: pointer;
  transition: background 0.15s;
}
.ztable-row:last-child td { border-bottom: none; }
.ztable-row:hover td { background: rgba(255,255,255,0.03); }

.z-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1.5px solid;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: 700;
  flex-shrink: 0;
}
.ztable-name { font-weight: 600; font-size: 0.875rem; }
.ztable-sub { font-size: 0.75rem; color: #6B7C88; margin-top: 1px; }
.ztable-num { font-variant-numeric: tabular-nums; color: #9FB0BC; }

.ztable-empty {
  text-align: center;
  padding: 48px 16px;
  color: #6B7C88;
}
.ztable-empty p { margin-top: 12px; font-size: 0.875rem; }

/* Badges */
.z-badge {
  display: inline-flex; align-items: center;
  padding: 2px 10px; border-radius: 20px;
  font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.3px; white-space: nowrap;
}
.z-badge--active { background: rgba(16,185,129,0.15); color: #34D399; border: 1px solid rgba(16,185,129,0.25); }
.z-badge--suspended { background: rgba(239,68,68,0.15); color: #F87171; border: 1px solid rgba(239,68,68,0.25); }
.z-badge--trial { background: rgba(245,158,11,0.15); color: #FBB040; border: 1px solid rgba(245,158,11,0.25); }
.z-badge--plan { background: rgba(255,255,255,0.06); color: #9FB0BC; border: 1px solid rgba(255,255,255,0.1); text-transform: capitalize; }

/* Features grid in dialog */
.features-grid {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.feat-toggle {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 8px; cursor: pointer;
  font-size: 0.78rem; font-weight: 500;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: #6B7C88;
  transition: all 0.15s;
  user-select: none;
}
.feat-toggle.active {
  background: rgba(99,102,241,0.12);
  border-color: rgba(99,102,241,0.3);
  color: #A5B4FC;
}
</style>
