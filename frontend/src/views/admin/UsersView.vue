<template>
  <div class="admin-page">
    <!-- Header -->
    <div class="page-header mb-5">
      <div>
        <h1 class="page-title">Usuários</h1>
        <p class="page-sub">{{ filtered.length }} de {{ users.length }} usuário{{ users.length !== 1 ? 's' : '' }} na plataforma</p>
      </div>
    </div>

    <!-- Superadmins -->
    <div class="ztable-wrap mb-5">
      <div class="ztable-section-header">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-shield-crown-outline" color="warning" size="18" />
          <span class="section-label">Superadmins</span>
          <span class="z-badge z-badge--count">{{ owners.length }}</span>
        </div>
        <v-btn color="warning" variant="tonal" size="small" prepend-icon="mdi-plus" @click="openCreateOwner">
          Novo Superadmin
        </v-btn>
      </div>
      <table class="ztable">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Último acesso</th>
            <th style="text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in owners" :key="o.id" class="ztable-row-plain">
            <td>
              <div class="d-flex align-center ga-3">
                <div class="z-avatar" :style="{ background: avatarBg(o.name || o.email), borderColor: avatarColor(o.name || o.email) }">
                  <span :style="{ color: avatarColor(o.name || o.email) }">{{ initials(o.name || o.email) }}</span>
                </div>
                <div class="ztable-name">{{ o.name || '—' }}</div>
              </div>
            </td>
            <td class="ztable-sub">{{ o.email }}</td>
            <td class="ztable-sub">{{ o.last_login_at ? formatDate(o.last_login_at) : 'Nunca acessou' }}</td>
            <td style="text-align:right; white-space:nowrap">
              <v-tooltip text="Redefinir senha">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon variant="text" size="small" color="info" @click="openOwnerReset(o)">
                    <v-icon icon="mdi-lock-reset" size="16" />
                  </v-btn>
                </template>
              </v-tooltip>
              <v-tooltip text="Excluir">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon variant="text" size="small" color="error" @click="openOwnerDelete(o)">
                    <v-icon icon="mdi-delete-outline" size="16" />
                  </v-btn>
                </template>
              </v-tooltip>
            </td>
          </tr>
          <tr v-if="!owners.length">
            <td colspan="4" class="ztable-empty" style="padding:20px">Nenhum superadmin encontrado.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Filters -->
    <div class="filters-bar mb-3">
      <v-text-field
        v-model="search"
        placeholder="Buscar por nome ou e-mail..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined" density="compact" hide-details clearable
        style="max-width:280px"
        bg-color="transparent"
      />
      <v-select
        v-model="filterTenant"
        :items="tenantOptions"
        label="Filtrar por cliente"
        variant="outlined" density="compact" hide-details clearable
        style="max-width:220px"
        bg-color="transparent"
      />
      <v-select
        v-model="filterRole"
        :items="roleOptions"
        label="Permissão"
        variant="outlined" density="compact" hide-details clearable
        style="max-width:160px"
        bg-color="transparent"
      />
      <v-btn icon variant="text" size="small" :loading="loading" @click="load">
        <v-icon icon="mdi-refresh" />
      </v-btn>
    </div>

    <!-- Users table -->
    <div class="ztable-wrap">
      <div v-if="loading" class="ztable-spinner">
        <v-progress-circular indeterminate color="primary" size="28" width="2" />
      </div>
      <table class="ztable" :class="{ 'ztable--faded': loading }">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Cliente</th>
            <th>Perfil</th>
            <th>Status</th>
            <th>Último acesso</th>
            <th style="text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.id" class="ztable-row-plain">
            <td>
              <div class="d-flex align-center ga-3">
                <div
                  class="z-avatar"
                  :class="{ 'z-avatar--inactive': !u.active }"
                  :style="u.active ? { background: avatarBg(u.name || u.email), borderColor: avatarColor(u.name || u.email) } : {}"
                >
                  <span :style="u.active ? { color: avatarColor(u.name || u.email) } : {}">
                    {{ initials(u.name || u.email) }}
                  </span>
                </div>
                <div>
                  <div class="ztable-name">{{ u.name || '—' }}</div>
                  <div class="ztable-sub">{{ u.email }}</div>
                </div>
              </div>
            </td>
            <td>
              <div v-if="u.tenant">
                <div class="ztable-name" style="font-weight:500">{{ u.tenant.name }}</div>
                <div class="ztable-sub">{{ u.tenant.slug }}</div>
              </div>
              <span v-else class="ztable-sub">—</span>
            </td>
            <td>
              <span class="z-badge" :class="roleBadgeClass(u.role)">{{ roleLabel(u.role) }}</span>
            </td>
            <td>
              <span class="z-badge" :class="u.active ? 'z-badge--active' : 'z-badge--suspended'">
                {{ u.active ? 'Ativo' : 'Inativo' }}
              </span>
            </td>
            <td class="ztable-sub">{{ formatDate(u.last_login_at) }}</td>
            <td style="text-align:right; white-space:nowrap">
              <v-tooltip text="Editar">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon variant="text" size="small" @click="openEdit(u)">
                    <v-icon icon="mdi-pencil-outline" size="16" />
                  </v-btn>
                </template>
              </v-tooltip>
              <v-tooltip :text="u.active ? 'Desativar' : 'Ativar'">
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props" icon variant="text" size="small"
                    :color="u.active ? 'warning' : 'success'"
                    @click="toggleActive(u)"
                  >
                    <v-icon :icon="u.active ? 'mdi-account-off-outline' : 'mdi-account-check-outline'" size="16" />
                  </v-btn>
                </template>
              </v-tooltip>
              <v-tooltip text="Redefinir senha">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon variant="text" size="small" color="info" @click="openReset(u)">
                    <v-icon icon="mdi-lock-reset" size="16" />
                  </v-btn>
                </template>
              </v-tooltip>
              <v-tooltip text="Ver cliente" v-if="u.tenant_id">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon variant="text" size="small" color="primary" :to="`/admin/clientes/${u.tenant_id}`">
                    <v-icon icon="mdi-domain" size="16" />
                  </v-btn>
                </template>
              </v-tooltip>
              <v-tooltip text="Excluir">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon variant="text" size="small" color="error" @click="openDelete(u)">
                    <v-icon icon="mdi-delete-outline" size="16" />
                  </v-btn>
                </template>
              </v-tooltip>
            </td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="6" class="ztable-empty">
              <v-icon icon="mdi-account-off-outline" size="40" style="opacity:.2" />
              <p>Nenhum usuário encontrado.</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Dialog: editar usuário -->
    <v-dialog v-model="editDialog" max-width="420">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Editar usuário</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12">
              <v-text-field v-model="editForm.name" label="Nome" variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12">
              <v-select v-model="editForm.role" :items="roles" label="Permissão" variant="outlined" density="compact" />
            </v-col>
          </v-row>
          <v-alert v-if="editError" type="error" variant="tonal" density="compact" :text="editError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="saveEdit">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: redefinir senha -->
    <v-dialog v-model="resetDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Redefinir senha</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3" style="color:#9FB0BC">{{ resetTarget?.email }}</p>
          <v-text-field v-model="newPassword" label="Nova senha" type="password" variant="outlined" density="compact" />
          <v-alert v-if="resetError" type="error" variant="tonal" density="compact" :text="resetError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="resetDialog = false">Cancelar</v-btn>
          <v-btn color="info" variant="flat" :loading="saving" @click="doReset">Redefinir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: excluir usuário -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Excluir usuário</v-card-title>
        <v-card-text>
          Confirma a exclusão de <strong>{{ deleteTarget?.email }}</strong>?
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="doDelete">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: criar superadmin -->
    <v-dialog v-model="createOwnerDialog" max-width="420">
      <v-card class="glass pa-2" border>
        <v-card-title class="d-flex align-center ga-2 text-h6 font-weight-bold">
          <v-icon icon="mdi-shield-crown-outline" color="warning" size="20" />
          Novo Superadmin
        </v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12">
              <v-text-field v-model="ownerForm.name" label="Nome completo" variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12">
              <v-text-field v-model="ownerForm.email" label="E-mail" type="email" variant="outlined" density="compact" />
            </v-col>
            <v-col cols="12">
              <v-text-field v-model="ownerForm.password" label="Senha" type="password" hint="Mínimo 8 caracteres" variant="outlined" density="compact" />
            </v-col>
          </v-row>
          <v-alert v-if="ownerError" type="error" variant="tonal" density="compact" :text="ownerError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="createOwnerDialog = false">Cancelar</v-btn>
          <v-btn color="warning" variant="flat" :loading="saving" @click="doCreateOwner">Criar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: redefinir senha owner -->
    <v-dialog v-model="ownerResetDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Redefinir senha</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3" style="color:#9FB0BC">{{ ownerResetTarget?.email }}</p>
          <v-text-field v-model="ownerNewPassword" label="Nova senha" type="password" variant="outlined" density="compact" />
          <v-alert v-if="ownerResetError" type="error" variant="tonal" density="compact" :text="ownerResetError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="ownerResetDialog = false">Cancelar</v-btn>
          <v-btn color="info" variant="flat" :loading="saving" @click="doOwnerReset">Redefinir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: excluir owner -->
    <v-dialog v-model="ownerDeleteDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Excluir superadmin</v-card-title>
        <v-card-text>
          Confirma a exclusão de <strong>{{ ownerDeleteTarget?.email }}</strong>?
          <div class="text-caption mt-1" style="color:#F87171">Esta ação é irreversível.</div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="ownerDeleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="doOwnerDelete">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { createOwnerSchema, ownerResetPasswordSchema, editUserSchema, userResetPasswordSchema } from '@/schemas/admin'
import { validateForm } from '@/composables/useZodValidation'

const auth = useAuthStore()
const loading = ref(true)
const saving = ref(false)
const users = ref([])
const owners = ref([])

// Avatar helpers
const AVATAR_COLORS = ['#6366F1','#8B5CF6','#EC4899','#06B6D4','#10B981','#F59E0B','#EF4444','#14B8A6']
function _colorIdx(name = '') {
  return [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length
}
function avatarColor(name = '') { return AVATAR_COLORS[_colorIdx(name)] }
function avatarBg(name = '') { return AVATAR_COLORS[_colorIdx(name)] + '1A' }
function initials(name = '') {
  return name.split(/[\s@.]/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'
}

// Superadmin dialogs
const createOwnerDialog = ref(false)
const ownerForm = reactive({ name: '', email: '', password: '' })
const ownerError = ref('')

const ownerResetDialog = ref(false)
const ownerResetTarget = ref(null)
const ownerNewPassword = ref('')
const ownerResetError = ref('')

const ownerDeleteDialog = ref(false)
const ownerDeleteTarget = ref(null)

function openCreateOwner() {
  ownerForm.name = ''; ownerForm.email = ''; ownerForm.password = ''
  ownerError.value = ''
  createOwnerDialog.value = true
}

async function doCreateOwner() {
  ownerError.value = ''
  const check = validateForm(createOwnerSchema, { name: ownerForm.name, email: ownerForm.email, password: ownerForm.password })
  if (!check.success) { ownerError.value = check.error; return }
  saving.value = true
  try {
    const o = await api.adminCreateOwner(check.data)
    owners.value.push(o)
    createOwnerDialog.value = false
    toast('Superadmin criado com sucesso.')
  } catch (e) {
    ownerError.value = e.message
  } finally {
    saving.value = false
  }
}

function openOwnerReset(o) {
  ownerResetTarget.value = o; ownerNewPassword.value = ''; ownerResetError.value = ''
  ownerResetDialog.value = true
}

async function doOwnerReset() {
  ownerResetError.value = ''
  const check = validateForm(ownerResetPasswordSchema, { password: ownerNewPassword.value })
  if (!check.success) { ownerResetError.value = check.error; return }
  saving.value = true
  try {
    await api.adminResetOwnerPassword(ownerResetTarget.value.id, check.data.password)
    ownerResetDialog.value = false
    toast('Senha redefinida.')
  } catch (e) {
    ownerResetError.value = e.message
  } finally {
    saving.value = false
  }
}

function openOwnerDelete(o) {
  if (o.id === auth.user?.id) { toast('Você não pode excluir a própria conta.', 'warning'); return }
  ownerDeleteTarget.value = o; ownerDeleteDialog.value = true
}

async function doOwnerDelete() {
  saving.value = true
  try {
    await api.adminDeleteOwner(ownerDeleteTarget.value.id)
    owners.value = owners.value.filter((o) => o.id !== ownerDeleteTarget.value.id)
    ownerDeleteDialog.value = false
    toast('Superadmin excluído.')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    saving.value = false
  }
}

// Filters
const search = ref('')
const filterTenant = ref(null)
const filterRole = ref(null)

// User dialogs
const editDialog = ref(false)
const editTarget = ref(null)
const editForm = reactive({ name: '', role: '' })
const editError = ref('')

const resetDialog = ref(false)
const resetTarget = ref(null)
const newPassword = ref('')
const resetError = ref('')

const deleteDialog = ref(false)
const deleteTarget = ref(null)

const snack = reactive({ show: false, text: '', color: 'success' })

const roles = [
  { title: 'Administrador', value: 'admin' },
  { title: 'Agente', value: 'agent' },
]

const roleOptions = [
  { title: 'Todos', value: null },
  { title: 'Administrador', value: 'admin' },
  { title: 'Agente', value: 'agent' },
]

const tenantOptions = computed(() => {
  const seen = new Map()
  for (const u of users.value) {
    if (u.tenant && !seen.has(u.tenant_id)) {
      seen.set(u.tenant_id, { title: u.tenant.name, value: u.tenant_id })
    }
  }
  return [{ title: 'Todos os clientes', value: null }, ...seen.values()]
})

const filtered = computed(() => {
  let list = users.value
  if (filterTenant.value) list = list.filter((u) => u.tenant_id === filterTenant.value)
  if (filterRole.value) list = list.filter((u) => u.role === filterRole.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter((u) =>
      (u.name || '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.tenant?.name || '').toLowerCase().includes(q)
    )
  }
  return list
})

function toast(text, color = 'success') {
  snack.text = text; snack.color = color; snack.show = true
}

function roleLabel(r) {
  return { admin: 'Administrador', agent: 'Agente', owner: 'Super Admin' }[r] || r
}

function roleBadgeClass(r) {
  return { admin: 'z-badge--admin', agent: 'z-badge--agent', owner: 'z-badge--owner' }[r] || 'z-badge--agent'
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function load() {
  loading.value = true
  try {
    const [u, o] = await Promise.all([api.adminUsers(), api.adminListOwners()])
    users.value = u
    owners.value = o
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    loading.value = false
  }
}

function openEdit(u) {
  editTarget.value = u
  editForm.name = u.name || ''
  editForm.role = u.role
  editError.value = ''
  editDialog.value = true
}

async function saveEdit() {
  editError.value = ''
  const check = validateForm(editUserSchema, { name: editForm.name, role: editForm.role })
  if (!check.success) { editError.value = check.error; return }
  saving.value = true
  try {
    const updated = await api.adminUpdateUser(editTarget.value.id, check.data)
    const idx = users.value.findIndex((u) => u.id === editTarget.value.id)
    if (idx >= 0) users.value[idx] = { ...users.value[idx], ...updated }
    editDialog.value = false
    toast('Usuário atualizado.')
  } catch (e) {
    editError.value = e.message
  } finally {
    saving.value = false
  }
}

async function toggleActive(u) {
  try {
    const updated = await api.adminUpdateUser(u.id, { active: !u.active })
    const idx = users.value.findIndex((x) => x.id === u.id)
    if (idx >= 0) users.value[idx] = { ...users.value[idx], ...updated }
    toast(u.active ? 'Usuário desativado.' : 'Usuário ativado.')
  } catch (e) {
    toast(e.message, 'error')
  }
}

function openReset(u) {
  resetTarget.value = u
  newPassword.value = ''
  resetError.value = ''
  resetDialog.value = true
}

async function doReset() {
  resetError.value = ''
  const check = validateForm(userResetPasswordSchema, { password: newPassword.value })
  if (!check.success) { resetError.value = check.error; return }
  saving.value = true
  try {
    await api.adminResetPassword(resetTarget.value.id, check.data.password)
    resetDialog.value = false
    toast('Senha redefinida com sucesso.')
  } catch (e) {
    resetError.value = e.message
  } finally {
    saving.value = false
  }
}

function openDelete(u) {
  deleteTarget.value = u
  deleteDialog.value = true
}

async function doDelete() {
  saving.value = true
  try {
    await api.adminDeleteUser(deleteTarget.value.id)
    users.value = users.value.filter((u) => u.id !== deleteTarget.value.id)
    deleteDialog.value = false
    toast('Usuário excluído.')
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
  display: flex; align-items: center;
  justify-content: space-between; flex-wrap: wrap; gap: 12px;
}
.page-title {
  font-size: 1.5rem; font-weight: 700; letter-spacing: -0.3px;
  color: var(--text-primary, #E2E8F0);
}
.page-sub { font-size: 0.8rem; color: #6B7C88; margin-top: 2px; }

.filters-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}

.ztable-wrap {
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch;
  background: var(--glass-bg, #1C2333);
  position: relative;
}
.ztable-section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
}
.section-label {
  font-size: 0.85rem; font-weight: 600;
  color: var(--text-primary, #E2E8F0);
}
.ztable-spinner {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.3); z-index: 5; border-radius: 12px;
}
.ztable--faded { opacity: 0.5; pointer-events: none; }
.ztable {
  width: 100%; border-collapse: collapse; font-size: 0.875rem;
}
.ztable thead th {
  padding: 10px 16px;
  font-size: 0.72rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.6px;
  color: #6B7C88;
  background: rgba(255,255,255,0.015);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  white-space: nowrap;
}
.ztable tbody td {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  vertical-align: middle;
  color: var(--text-primary, #E2E8F0);
}
.ztable-row-plain:last-child td { border-bottom: none; }
.ztable-row-plain:hover td { background: rgba(255,255,255,0.025); }

.z-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1.5px solid transparent;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: 700; flex-shrink: 0;
}
.z-avatar--inactive {
  background: rgba(100,116,139,0.12) !important;
  border-color: rgba(100,116,139,0.25) !important;
}
.z-avatar--inactive span { color: #64748B !important; }

.ztable-name { font-weight: 600; font-size: 0.875rem; }
.ztable-sub { font-size: 0.75rem; color: #6B7C88; }
td.ztable-sub { color: #6B7C88; }

.ztable-empty {
  text-align: center; padding: 40px 16px; color: #6B7C88; font-size: 0.85rem;
}
.ztable-empty p { margin-top: 10px; }

.z-badge {
  display: inline-flex; align-items: center;
  padding: 2px 10px; border-radius: 20px;
  font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.3px; white-space: nowrap;
}
.z-badge--count {
  background: rgba(245,158,11,0.15); color: #FBB040;
  border: 1px solid rgba(245,158,11,0.3);
  padding: 1px 8px; font-size: 0.7rem;
}
.z-badge--active { background: rgba(16,185,129,0.15); color: #34D399; border: 1px solid rgba(16,185,129,0.25); }
.z-badge--suspended { background: rgba(239,68,68,0.15); color: #F87171; border: 1px solid rgba(239,68,68,0.25); }
.z-badge--admin { background: rgba(99,102,241,0.15); color: #A5B4FC; border: 1px solid rgba(99,102,241,0.3); }
.z-badge--agent { background: rgba(100,116,139,0.15); color: #94A3B8; border: 1px solid rgba(100,116,139,0.25); }
.z-badge--owner { background: rgba(245,158,11,0.15); color: #FBB040; border: 1px solid rgba(245,158,11,0.3); }
</style>
