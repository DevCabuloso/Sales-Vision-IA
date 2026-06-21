<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h4 font-weight-bold mb-1">Usuários</h1>
        <p class="text-body-2" style="color:#9FB0BC">
          {{ users.length }} usuário{{ users.length !== 1 ? 's' : '' }} em toda a plataforma
        </p>
      </div>
    </div>

    <!-- ── Superadmins ── -->
    <v-card class="glass mb-6" border>
      <v-card-title class="d-flex align-center justify-space-between pa-4 pb-2">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-shield-crown-outline" color="warning" />
          <span class="text-subtitle-1 font-weight-bold">Superadmins</span>
          <v-chip size="x-small" color="warning" variant="tonal">{{ owners.length }}</v-chip>
        </div>
        <v-btn color="warning" variant="tonal" size="small" prepend-icon="mdi-plus" @click="openCreateOwner">
          Novo superadmin
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-list density="compact" class="bg-transparent pa-2">
        <v-list-item
          v-for="o in owners" :key="o.id"
          rounded="lg" class="mb-1"
        >
          <template #prepend>
            <div class="owner-avatar d-flex align-center justify-center mr-3">
              <v-icon icon="mdi-shield-crown" size="16" color="warning" />
            </div>
          </template>
          <v-list-item-title class="text-body-2 font-weight-medium">{{ o.name }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ o.email }}</v-list-item-subtitle>
          <template #append>
            <div class="d-flex align-center ga-1">
              <span class="text-caption mr-2" style="color:#6B7C88">
                {{ o.last_login_at ? 'Último acesso ' + formatDate(o.last_login_at) : 'Nunca acessou' }}
              </span>
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
            </div>
          </template>
        </v-list-item>
        <div v-if="!owners.length" class="py-4 text-center text-caption" style="color:#6B7C88">
          Nenhum superadmin encontrado.
        </div>
      </v-list>
    </v-card>

    <!-- Filtros -->
    <v-card class="glass pa-4 mb-4" border>
      <div class="d-flex align-center flex-wrap ga-3">
        <v-text-field
          v-model="search"
          placeholder="Buscar por nome ou e-mail..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width:280px"
          clearable
        />
        <v-select
          v-model="filterTenant"
          :items="tenantOptions"
          label="Filtrar por cliente"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width:240px"
        />
        <v-select
          v-model="filterRole"
          :items="roleOptions"
          label="Permissão"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width:160px"
        />
        <v-btn variant="tonal" color="accent" :loading="loading" @click="load">
          <v-icon icon="mdi-refresh" />
        </v-btn>
      </div>
    </v-card>

    <v-card class="glass" border>
      <v-data-table
        :headers="headers"
        :items="filtered"
        :loading="loading"
        item-value="id"
        class="bg-transparent"
        :items-per-page="20"
      >
        <template #item.name="{ item }">
          <div class="d-flex align-center ga-3 py-1">
            <div class="user-avatar d-flex align-center justify-center" :class="{ inactive: !item.active }">
              <v-icon icon="mdi-account-outline" size="15" :color="item.active ? 'primary' : 'grey'" />
            </div>
            <div>
              <div class="text-body-2 font-weight-medium">{{ item.name || '—' }}</div>
              <div class="text-caption" style="color:#6B7C88">{{ item.email }}</div>
            </div>
          </div>
        </template>
        <template #item.tenant="{ item }">
          <div v-if="item.tenant">
            <div class="text-body-2">{{ item.tenant.name }}</div>
            <div class="text-caption" style="color:#6B7C88">{{ item.tenant.slug }}</div>
          </div>
          <span v-else class="text-caption" style="color:#6B7C88">—</span>
        </template>
        <template #item.role="{ item }">
          <v-chip :color="roleColor(item.role)" variant="tonal" size="small">
            {{ roleLabel(item.role) }}
          </v-chip>
        </template>
        <template #item.active="{ item }">
          <v-chip :color="item.active ? 'success' : 'error'" variant="tonal" size="small">
            {{ item.active ? 'Ativo' : 'Inativo' }}
          </v-chip>
        </template>
        <template #item.last_login_at="{ item }">
          <span class="text-caption">{{ formatDate(item.last_login_at) }}</span>
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex ga-1 justify-end">
            <v-tooltip text="Editar">
              <template #activator="{ props }">
                <v-btn v-bind="props" icon variant="text" size="small" @click="openEdit(item)">
                  <v-icon icon="mdi-pencil-outline" size="17" />
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip :text="item.active ? 'Desativar' : 'Ativar'">
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon variant="text" size="small"
                  :color="item.active ? 'warning' : 'success'"
                  @click="toggleActive(item)"
                >
                  <v-icon :icon="item.active ? 'mdi-account-off-outline' : 'mdi-account-check-outline'" size="17" />
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip text="Redefinir senha">
              <template #activator="{ props }">
                <v-btn v-bind="props" icon variant="text" size="small" color="info" @click="openReset(item)">
                  <v-icon icon="mdi-lock-reset" size="17" />
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip text="Ver cliente">
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon variant="text" size="small" color="accent"
                  :to="`/admin/clientes/${item.tenant_id}`"
                  v-if="item.tenant_id"
                >
                  <v-icon icon="mdi-domain" size="17" />
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip text="Excluir">
              <template #activator="{ props }">
                <v-btn v-bind="props" icon variant="text" size="small" color="error" @click="openDelete(item)">
                  <v-icon icon="mdi-delete-outline" size="17" />
                </v-btn>
              </template>
            </v-tooltip>
          </div>
        </template>
        <template #no-data>
          <div class="py-8 text-center" style="color:#6B7C88">Nenhum usuário encontrado.</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Dialog: editar usuário -->
    <v-dialog v-model="editDialog" max-width="420">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Editar usuário</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12">
              <v-text-field v-model="editForm.name" label="Nome" />
            </v-col>
            <v-col cols="12">
              <v-select v-model="editForm.role" :items="roles" label="Permissão" />
            </v-col>
          </v-row>
          <v-alert v-if="editError" type="error" variant="tonal" density="compact" :text="editError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">Cancelar</v-btn>
          <v-btn color="accent" :loading="saving" @click="saveEdit">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: redefinir senha -->
    <v-dialog v-model="resetDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Redefinir senha</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3" style="color:#9FB0BC">{{ resetTarget?.email }}</p>
          <v-text-field v-model="newPassword" label="Nova senha" type="password" />
          <v-alert v-if="resetError" type="error" variant="tonal" density="compact" :text="resetError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="resetDialog = false">Cancelar</v-btn>
          <v-btn color="info" :loading="saving" @click="doReset">Redefinir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: excluir -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Excluir usuário</v-card-title>
        <v-card-text>
          Confirma a exclusão de <strong>{{ deleteTarget?.email }}</strong>?
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" :loading="saving" @click="doDelete">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: criar superadmin -->
    <v-dialog v-model="createOwnerDialog" max-width="420">
      <v-card class="glass pa-2" border>
        <v-card-title class="d-flex align-center ga-2">
          <v-icon icon="mdi-shield-crown-outline" color="warning" />
          Novo Superadmin
        </v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12">
              <v-text-field v-model="ownerForm.name" label="Nome completo" />
            </v-col>
            <v-col cols="12">
              <v-text-field v-model="ownerForm.email" label="E-mail" type="email" />
            </v-col>
            <v-col cols="12">
              <v-text-field v-model="ownerForm.password" label="Senha" type="password" hint="Mínimo 6 caracteres" />
            </v-col>
          </v-row>
          <v-alert v-if="ownerError" type="error" variant="tonal" density="compact" :text="ownerError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="createOwnerDialog = false">Cancelar</v-btn>
          <v-btn color="warning" :loading="saving" @click="doCreateOwner">Criar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: redefinir senha de owner -->
    <v-dialog v-model="ownerResetDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title>Redefinir senha</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3" style="color:#9FB0BC">{{ ownerResetTarget?.email }}</p>
          <v-text-field v-model="ownerNewPassword" label="Nova senha" type="password" />
          <v-alert v-if="ownerResetError" type="error" variant="tonal" density="compact" :text="ownerResetError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="ownerResetDialog = false">Cancelar</v-btn>
          <v-btn color="info" :loading="saving" @click="doOwnerReset">Redefinir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: excluir owner -->
    <v-dialog v-model="ownerDeleteDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title>Excluir superadmin</v-card-title>
        <v-card-text>
          Confirma a exclusão de <strong>{{ ownerDeleteTarget?.email }}</strong>?
          <br><span class="text-caption" style="color:#F87171">Esta ação é irreversível.</span>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="ownerDeleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" :loading="saving" @click="doOwnerDelete">Excluir</v-btn>
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

const auth = useAuthStore()
const loading = ref(true)
const saving = ref(false)
const users = ref([])
const owners = ref([])

// ── owners ──
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
  if (!ownerForm.name || !ownerForm.email || !ownerForm.password) {
    ownerError.value = 'Preencha todos os campos.'; return
  }
  saving.value = true
  try {
    const o = await api.adminCreateOwner({ name: ownerForm.name, email: ownerForm.email, password: ownerForm.password })
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
  if (!ownerNewPassword.value || ownerNewPassword.value.length < 6) {
    ownerResetError.value = 'Mínimo 6 caracteres.'; return
  }
  saving.value = true
  try {
    await api.adminResetOwnerPassword(ownerResetTarget.value.id, ownerNewPassword.value)
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
const search = ref('')
const filterTenant = ref(null)
const filterRole = ref(null)

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

const headers = [
  { title: 'Usuário', key: 'name', minWidth: '200px' },
  { title: 'Cliente', key: 'tenant' },
  { title: 'Permissão', key: 'role' },
  { title: 'Status', key: 'active' },
  { title: 'Último acesso', key: 'last_login_at' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
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
  return { admin: 'Admin', agent: 'Agente', owner: 'Proprietário' }[r] || r
}

function roleColor(r) {
  return { admin: 'warning', agent: 'primary', owner: 'accent' }[r] || 'secondary'
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
  saving.value = true
  try {
    const updated = await api.adminUpdateUser(editTarget.value.id, { name: editForm.name, role: editForm.role })
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
  if (!newPassword.value || newPassword.value.length < 6) {
    resetError.value = 'Senha deve ter pelo menos 6 caracteres.'
    return
  }
  saving.value = true
  try {
    await api.adminResetPassword(resetTarget.value.id, newPassword.value)
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
.user-avatar {
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(99,102,241,0.1);
  border: 1px solid rgba(99,102,241,0.15);
  flex-shrink: 0;
}
.user-avatar.inactive {
  background: rgba(100,116,139,0.1);
  border-color: rgba(100,116,139,0.15);
}
.owner-avatar {
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(245,158,11,0.1);
  border: 1px solid rgba(245,158,11,0.2);
  flex-shrink: 0;
}
</style>
