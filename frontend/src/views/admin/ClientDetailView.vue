<template>
  <div>
    <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/admin/clientes" class="mb-4">
      Voltar para clientes
    </v-btn>

    <div v-if="loading" class="py-12 text-center">
      <v-progress-circular indeterminate color="accent" />
    </div>

    <template v-else-if="client">
      <!-- Cabeçalho do cliente -->
      <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
        <div>
          <h1 class="text-h4 font-weight-bold mb-2">{{ client.name }}</h1>
          <div class="d-flex ga-2 align-center flex-wrap">
            <v-chip variant="outlined" size="small">{{ client.slug }}</v-chip>
            <v-chip :color="statusColor(client.status)" variant="tonal" size="small">
              {{ client.status }}
            </v-chip>
            <v-chip variant="outlined" size="small" color="accent">{{ client.plan }}</v-chip>
            <span class="text-caption" style="color:#6B7C88">
              {{ client.max_leads ?? 1000 }} leads máx.
            </span>
          </div>
        </div>
        <div class="d-flex ga-2">
          <v-btn variant="tonal" prepend-icon="mdi-pencil-outline" @click="openEditClient">
            Editar
          </v-btn>
          <v-btn
            :color="client.status === 'suspended' ? 'success' : 'warning'"
            variant="tonal"
            :prepend-icon="client.status === 'suspended' ? 'mdi-play' : 'mdi-pause'"
            @click="toggleStatus"
          >
            {{ client.status === 'suspended' ? 'Reativar' : 'Suspender' }}
          </v-btn>
        </div>
      </div>

      <v-row>
        <!-- Funções habilitadas -->
        <v-col cols="12" md="5">
          <v-card class="glass pa-6 mb-4" border>
            <div class="text-subtitle-1 font-weight-bold mb-1">Funções habilitadas</div>
            <p class="text-caption mb-4" style="color:#9FB0BC">Alterações são salvas imediatamente.</p>
            <v-switch
              v-for="f in featureDefs"
              :key="f.key"
              v-model="features[f.key]"
              :label="f.label"
              color="secondary"
              hide-details
              :loading="savingKey === f.key"
              @update:model-value="(val) => updateFeature(f.key, val)"
            />
          </v-card>

          <!-- Integrações -->
          <v-card class="glass pa-6" border>
            <div class="text-subtitle-1 font-weight-bold mb-3">Integrações</div>
            <v-list class="bg-transparent">
              <v-list-item
                v-for="i in integrations"
                :key="i.provider"
                :title="providerLabel(i.provider)"
                class="px-0"
                density="compact"
              >
                <template #prepend>
                  <v-icon :icon="providerIcon(i.provider)" size="20" class="mr-2" />
                </template>
                <template #append>
                  <v-chip :color="i.status === 'connected' ? 'success' : 'error'" variant="tonal" size="small">
                    {{ i.status === 'connected' ? 'Conectado' : 'Desconectado' }}
                  </v-chip>
                </template>
              </v-list-item>
              <p v-if="!integrations.length" class="text-body-2 py-2" style="color:#6B7C88">
                Nenhuma integração configurada.
              </p>
            </v-list>
          </v-card>
        </v-col>

        <!-- Usuários -->
        <v-col cols="12" md="7">
          <v-card class="glass pa-6" border>
            <div class="d-flex align-center justify-space-between mb-4">
              <span class="text-subtitle-1 font-weight-bold">Usuários ({{ users.length }})</span>
              <v-btn color="accent" size="small" prepend-icon="mdi-account-plus-outline" @click="openCreateUser">
                Novo usuário
              </v-btn>
            </div>

            <div v-if="!users.length" class="text-body-2 py-4 text-center" style="color:#6B7C88">
              Nenhum usuário cadastrado.
            </div>

            <div v-for="u in users" :key="u.id" class="user-row d-flex align-center justify-space-between py-3">
              <div class="d-flex align-center ga-3">
                <div class="user-avatar d-flex align-center justify-center" :class="{ inactive: !u.active }">
                  <v-icon icon="mdi-account-outline" size="16" :color="u.active ? 'primary' : 'grey'" />
                </div>
                <div>
                  <div class="text-body-2 font-weight-medium d-flex align-center ga-1">
                    {{ u.name || u.email }}
                    <v-chip v-if="!u.active" size="x-small" color="error" variant="tonal">inativo</v-chip>
                  </div>
                  <div class="text-caption" style="color:#6B7C88">
                    {{ u.email }} · {{ roleLabel(u.role) }}
                  </div>
                  <div v-if="u.last_login_at" class="text-caption" style="color:#4D6070">
                    Último acesso: {{ formatDate(u.last_login_at) }}
                  </div>
                </div>
              </div>

              <div class="d-flex ga-1">
                <v-tooltip text="Editar usuário">
                  <template #activator="{ props }">
                    <v-btn v-bind="props" icon variant="text" size="small" @click="openEditUser(u)">
                      <v-icon icon="mdi-pencil-outline" size="18" />
                    </v-btn>
                  </template>
                </v-tooltip>
                <v-tooltip :text="u.active ? 'Desativar' : 'Ativar'">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon variant="text" size="small"
                      :color="u.active ? 'warning' : 'success'"
                      @click="toggleUserActive(u)"
                    >
                      <v-icon :icon="u.active ? 'mdi-account-off-outline' : 'mdi-account-check-outline'" size="18" />
                    </v-btn>
                  </template>
                </v-tooltip>
                <v-tooltip text="Redefinir senha">
                  <template #activator="{ props }">
                    <v-btn v-bind="props" icon variant="text" size="small" color="info" @click="openResetPassword(u)">
                      <v-icon icon="mdi-lock-reset" size="18" />
                    </v-btn>
                  </template>
                </v-tooltip>
                <v-tooltip text="Excluir usuário">
                  <template #activator="{ props }">
                    <v-btn v-bind="props" icon variant="text" size="small" color="error" @click="openDeleteUser(u)">
                      <v-icon icon="mdi-delete-outline" size="18" />
                    </v-btn>
                  </template>
                </v-tooltip>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Zona de perigo -->
      <v-card class="glass pa-6 mt-4" border>
        <div class="text-subtitle-1 font-weight-bold text-error mb-1">Zona de perigo</div>
        <p class="text-caption mb-4" style="color:#9FB0BC">
          Excluir remove permanentemente o cliente e todos os seus dados (leads, mensagens, configurações).
        </p>
        <v-btn color="error" variant="tonal" prepend-icon="mdi-delete-outline" @click="confirmDelete = true">
          Excluir cliente
        </v-btn>
      </v-card>
    </template>

    <!-- Dialog: editar cliente -->
    <v-dialog v-model="editClientDialog" max-width="480">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Editar cliente</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12">
              <v-text-field v-model="editForm.name" label="Nome da empresa" />
            </v-col>
            <v-col cols="6">
              <v-select v-model="editForm.plan" :items="plans" label="Plano" />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model.number="editForm.max_leads" label="Limite de leads" type="number" />
            </v-col>
          </v-row>
          <v-alert v-if="editError" type="error" variant="tonal" density="compact" :text="editError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="editClientDialog = false">Cancelar</v-btn>
          <v-btn color="accent" :loading="saving" @click="saveEditClient">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: criar/editar usuário -->
    <v-dialog v-model="userDialog" max-width="440">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">
          {{ editingUser ? 'Editar usuário' : 'Novo usuário' }}
        </v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12">
              <v-text-field v-model="userForm.name" label="Nome" prepend-inner-icon="mdi-account-outline" />
            </v-col>
            <v-col cols="12" v-if="!editingUser">
              <v-text-field v-model="userForm.email" label="E-mail" type="email" prepend-inner-icon="mdi-email-outline" />
            </v-col>
            <v-col cols="12" v-if="!editingUser">
              <v-text-field v-model="userForm.password" label="Senha (mín. 6 caracteres)" type="password" prepend-inner-icon="mdi-lock-outline" />
            </v-col>
            <v-col cols="12">
              <v-select v-model="userForm.role" :items="roles" label="Permissão" />
            </v-col>
          </v-row>
          <v-alert v-if="userError" type="error" variant="tonal" density="compact" :text="userError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="userDialog = false">Cancelar</v-btn>
          <v-btn color="accent" :loading="saving" @click="saveUser">
            {{ editingUser ? 'Salvar' : 'Criar usuário' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: redefinir senha -->
    <v-dialog v-model="resetDialog" max-width="400">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Redefinir senha</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-4" style="color:#9FB0BC">
            Definir nova senha para <strong>{{ resetUser?.email }}</strong>
          </p>
          <v-text-field v-model="newPassword" label="Nova senha" type="password" prepend-inner-icon="mdi-lock-outline" />
          <v-alert v-if="resetError" type="error" variant="tonal" density="compact" :text="resetError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="resetDialog = false">Cancelar</v-btn>
          <v-btn color="info" :loading="saving" @click="doResetPassword">Redefinir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: excluir usuário -->
    <v-dialog v-model="deleteUserDialog" max-width="400">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Excluir usuário</v-card-title>
        <v-card-text>
          Tem certeza que deseja excluir <strong>{{ deletingUser?.email }}</strong>?
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteUserDialog = false">Cancelar</v-btn>
          <v-btn color="error" :loading="saving" @click="doDeleteUser">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: excluir cliente -->
    <v-dialog v-model="confirmDelete" max-width="420">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Confirmar exclusão</v-card-title>
        <v-card-text>
          Tem certeza que deseja excluir <strong>{{ client?.name }}</strong>? Esta ação não pode ser desfeita.
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="confirmDelete = false">Cancelar</v-btn>
          <v-btn color="error" :loading="deleting" @click="removeClient">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/services/api'

const props = defineProps({ id: String })
const router = useRouter()

const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const savingKey = ref(null)
const confirmDelete = ref(false)

const client = ref(null)
const users = ref([])
const integrations = ref([])
const features = reactive({})

const editClientDialog = ref(false)
const editForm = reactive({ name: '', plan: '', max_leads: 1000 })
const editError = ref('')

const userDialog = ref(false)
const editingUser = ref(null)
const userForm = reactive({ name: '', email: '', password: '', role: 'agent' })
const userError = ref('')

const resetDialog = ref(false)
const resetUser = ref(null)
const newPassword = ref('')
const resetError = ref('')

const deleteUserDialog = ref(false)
const deletingUser = ref(null)

const snack = reactive({ show: false, text: '', color: 'success' })

const plans = ['trial', 'starter', 'pro', 'enterprise']
const roles = [
  { title: 'Administrador', value: 'admin' },
  { title: 'Agente', value: 'agent' },
]

const featureDefs = [
  { key: 'feat_evolution_api', label: 'Evolution API' },
  { key: 'feat_meta_api',      label: 'Meta API (WhatsApp Oficial)' },
  { key: 'feat_hybrid',        label: 'Modo Híbrido (IA + Humano)' },
  { key: 'feat_google_cal',    label: 'Google Calendar' },
  { key: 'feat_broadcast',     label: 'Campanhas em massa (Broadcast)' },
  { key: 'feat_kanban',        label: 'CRM Kanban' },
  { key: 'feat_agenda',        label: 'Agenda / Reuniões' },
  { key: 'feat_contacts',      label: 'Módulo de Contatos' },
  { key: 'feat_ia_config',     label: 'Configuração de IA' },
  { key: 'feat_operators',     label: 'Gestão de Operadores' },
  { key: 'feat_custom_apis',   label: 'APIs Externas' },
]

function toast(text, color = 'success') {
  snack.text = text; snack.color = color; snack.show = true
}

function statusColor(s) {
  return { active: 'success', suspended: 'error', trial: 'warning' }[s] || 'info'
}

function roleLabel(r) {
  return { admin: 'Administrador', agent: 'Agente', owner: 'Proprietário' }[r] || r
}

function providerLabel(p) {
  return { meta_whatsapp: 'Meta WhatsApp', evolution: 'Evolution API', google_calendar: 'Google Calendar' }[p] || p
}

function providerIcon(p) {
  return { meta_whatsapp: 'mdi-whatsapp', evolution: 'mdi-api', google_calendar: 'mdi-calendar' }[p] || 'mdi-connection'
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function load() {
  const data = await api.adminClient(props.id)
  client.value = data.client
  users.value = data.users || []
  integrations.value = data.integrations || []
  for (const f of featureDefs) features[f.key] = !!data.client[f.key]
}

async function updateFeature(key, val) {
  savingKey.value = key
  try {
    await api.adminUpdateFeatures(props.id, { [key]: val })
    toast('Função atualizada.')
  } catch (e) {
    features[key] = !val
    toast(e.message, 'error')
  } finally {
    savingKey.value = null
  }
}

async function toggleStatus() {
  const next = client.value.status === 'suspended' ? 'active' : 'suspended'
  try {
    await api.adminUpdateStatus(props.id, next)
    client.value.status = next
    toast(next === 'active' ? 'Cliente reativado.' : 'Cliente suspenso.')
  } catch (e) {
    toast(e.message, 'error')
  }
}

function openEditClient() {
  editForm.name = client.value.name
  editForm.plan = client.value.plan
  editForm.max_leads = client.value.max_leads ?? 1000
  editError.value = ''
  editClientDialog.value = true
}

async function saveEditClient() {
  editError.value = ''
  saving.value = true
  try {
    const updated = await api.adminUpdateClient(props.id, {
      name: editForm.name,
      plan: editForm.plan,
      max_leads: editForm.max_leads,
    })
    client.value = { ...client.value, ...updated }
    editClientDialog.value = false
    toast('Cliente atualizado.')
  } catch (e) {
    editError.value = e.message
  } finally {
    saving.value = false
  }
}

function openCreateUser() {
  editingUser.value = null
  Object.assign(userForm, { name: '', email: '', password: '', role: 'agent' })
  userError.value = ''
  userDialog.value = true
}

function openEditUser(u) {
  editingUser.value = u
  Object.assign(userForm, { name: u.name || '', email: u.email, password: '', role: u.role })
  userError.value = ''
  userDialog.value = true
}

async function saveUser() {
  userError.value = ''
  saving.value = true
  try {
    if (editingUser.value) {
      const updated = await api.adminUpdateUser(editingUser.value.id, {
        name: userForm.name,
        role: userForm.role,
      })
      const idx = users.value.findIndex((u) => u.id === editingUser.value.id)
      if (idx >= 0) users.value[idx] = { ...users.value[idx], ...updated }
      toast('Usuário atualizado.')
    } else {
      if (!userForm.email || !userForm.password) {
        userError.value = 'Preencha e-mail e senha.'
        return
      }
      const newUser = await api.adminCreateUser(props.id, {
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
      })
      users.value.push(newUser)
      toast('Usuário criado com sucesso.')
    }
    userDialog.value = false
  } catch (e) {
    userError.value = e.message
  } finally {
    saving.value = false
  }
}

async function toggleUserActive(u) {
  try {
    const updated = await api.adminUpdateUser(u.id, { active: !u.active })
    const idx = users.value.findIndex((x) => x.id === u.id)
    if (idx >= 0) users.value[idx] = { ...users.value[idx], ...updated }
    toast(u.active ? 'Usuário desativado.' : 'Usuário ativado.')
  } catch (e) {
    toast(e.message, 'error')
  }
}

function openResetPassword(u) {
  resetUser.value = u
  newPassword.value = ''
  resetError.value = ''
  resetDialog.value = true
}

async function doResetPassword() {
  resetError.value = ''
  if (!newPassword.value || newPassword.value.length < 6) {
    resetError.value = 'Senha deve ter pelo menos 6 caracteres.'
    return
  }
  saving.value = true
  try {
    await api.adminResetPassword(resetUser.value.id, newPassword.value)
    resetDialog.value = false
    toast('Senha redefinida com sucesso.')
  } catch (e) {
    resetError.value = e.message
  } finally {
    saving.value = false
  }
}

function openDeleteUser(u) {
  deletingUser.value = u
  deleteUserDialog.value = true
}

async function doDeleteUser() {
  saving.value = true
  try {
    await api.adminDeleteUser(deletingUser.value.id)
    users.value = users.value.filter((u) => u.id !== deletingUser.value.id)
    deleteUserDialog.value = false
    toast('Usuário excluído.')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    saving.value = false
  }
}

async function removeClient() {
  deleting.value = true
  try {
    await api.adminDeleteClient(props.id)
    router.push('/admin/clientes')
  } catch (e) {
    toast(e.message, 'error')
    deleting.value = false
  }
}

onMounted(async () => {
  try { await load() } catch (e) { toast(e.message, 'error') } finally { loading.value = false }
})
</script>

<style scoped>
.user-row {
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.user-row:last-child { border-bottom: none; }

.user-avatar {
  width: 32px; height: 32px; border-radius: 8px;
  background: rgba(99,102,241,0.1);
  border: 1px solid rgba(99,102,241,0.15);
  flex-shrink: 0;
}
.user-avatar.inactive {
  background: rgba(100,116,139,0.1);
  border-color: rgba(100,116,139,0.15);
}
</style>
