<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-5 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Usuários</h1>
        <p class="text-body-2" style="color:#9FB0BC">Gerencie os usuários do sistema</p>
      </div>
      <div v-if="isAdmin" class="d-flex ga-2">
        <v-btn variant="tonal" prepend-icon="mdi-chart-bar-outline" @click="tab = 'dashboard'">Dashboard</v-btn>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Novo Usuário</v-btn>
      </div>
    </div>

    <v-tabs v-model="tab" class="mb-5">
      <v-tab value="list" prepend-icon="mdi-account-group-outline">Usuários</v-tab>
      <v-tab value="dashboard" prepend-icon="mdi-chart-bar-outline" @click="onDashTab">Dashboard</v-tab>
    </v-tabs>

    <!-- Lista -->
    <div v-if="tab === 'list'">
      <div class="d-flex align-center ga-3 mb-4 flex-wrap">
        <v-text-field v-model="search" placeholder="Buscar por nome ou email..." prepend-inner-icon="mdi-magnify" density="compact" hide-details style="max-width:340px" clearable />
        <span class="text-caption ml-auto" style="color:#9FB0BC">{{ filteredOps.length }} usuário(s)</span>
      </div>
      <v-card class="glass" border>
        <v-data-table :headers="headers" :items="filteredOps" :loading="loading" item-value="id" class="bg-transparent" :items-per-page="25">
          <template #item.name="{ item }">
            <div class="d-flex align-center ga-3 py-1">
              <v-avatar :color="avatarColor(item)" size="34" rounded="lg">
                <span style="font-size:12px;font-weight:700;color:white">{{ (item.name || item.email).slice(0, 2).toUpperCase() }}</span>
              </v-avatar>
              <div>
                <div class="text-body-2 font-weight-medium">{{ item.name || '—' }}</div>
                <div v-if="item.is_restricted" class="text-caption" style="color:#F59E0B">Usuário restrito</div>
              </div>
            </div>
          </template>
          <template #item.role="{ item }">
            <v-chip :color="item.role === 'admin' ? 'primary' : undefined" variant="tonal" size="small" :prepend-icon="item.role === 'admin' ? 'mdi-shield-account-outline' : 'mdi-account-outline'">{{ item.role === 'admin' ? 'Admin' : 'Atendente' }}</v-chip>
          </template>
          <template #item.active="{ item }">
            <v-chip :color="item.active ? 'success' : 'error'" variant="tonal" size="small">{{ item.active ? 'Ativo' : 'Inativo' }}</v-chip>
          </template>
          <template #item.last_login_at="{ item }">
            <span class="text-caption">{{ formatDate(item.last_login_at) }}</span>
          </template>
          <template #item.actions="{ item }">
            <div v-if="isAdmin" class="d-flex ga-1 justify-end">
              <v-btn icon variant="text" size="small" title="Redefinir senha" @click="openReset(item)"><v-icon icon="mdi-lock-reset" size="16" /></v-btn>
              <v-btn icon variant="text" size="small" @click="openEdit(item)"><v-icon icon="mdi-pencil-outline" size="16" /></v-btn>
              <v-btn icon variant="text" size="small" :color="item.active ? 'warning' : 'success'" :title="item.active ? 'Desativar' : 'Ativar'" @click="toggleActive(item)">
                <v-icon :icon="item.active ? 'mdi-account-off-outline' : 'mdi-account-check-outline'" size="16" />
              </v-btn>
              <v-btn icon variant="text" size="small" color="error" @click="openDelete(item)"><v-icon icon="mdi-delete-outline" size="16" /></v-btn>
            </div>
          </template>
          <template #no-data><div class="py-8 text-center" style="color:#6B7C88">Nenhum usuário encontrado.</div></template>
        </v-data-table>
      </v-card>
    </div>

    <!-- Dashboard -->
    <div v-else>
      <div class="d-flex align-center justify-space-between mb-5">
        <p class="text-body-2" style="color:#9FB0BC">Desempenho dos últimos 30 dias</p>
        <v-btn icon variant="text" :loading="loadingDash" @click="loadDashboard"><v-icon icon="mdi-refresh" /></v-btn>
      </div>
      <div v-if="loadingDash" class="py-12 text-center"><v-progress-circular indeterminate color="primary" size="48" /></div>
      <v-row v-else>
        <v-col v-for="op in metrics" :key="op.id" cols="12" md="6" lg="4">
          <v-card class="glass pa-5" border>
            <div class="d-flex align-center ga-3 mb-4">
              <v-avatar :color="avatarColor(op)" size="46" rounded="lg">
                <span style="font-size:16px;font-weight:700;color:white">{{ (op.name || op.email).slice(0, 2).toUpperCase() }}</span>
              </v-avatar>
              <div class="flex-1 min-width-0">
                <div class="text-body-2 font-weight-bold text-truncate">{{ op.name || op.email }}</div>
                <v-chip :color="op.role === 'admin' ? 'primary' : undefined" variant="tonal" size="x-small">{{ op.role === 'admin' ? 'Admin' : 'Atendente' }}</v-chip>
              </div>
              <v-chip :color="op.active ? 'success' : 'error'" variant="tonal" size="small">{{ op.active ? 'Ativo' : 'Inativo' }}</v-chip>
            </div>
            <v-row dense>
              <v-col cols="6" class="text-center"><div class="text-h5 font-weight-black" style="color:#38BDF8">{{ op.messages_sent }}</div><div class="text-caption" style="color:#9FB0BC">Msgs enviadas</div></v-col>
              <v-col cols="6" class="text-center"><div class="text-h5 font-weight-black" style="color:#10B981">{{ op.leads_handled }}</div><div class="text-caption" style="color:#9FB0BC">Leads criados</div></v-col>
              <v-col cols="6" class="text-center"><div class="text-h5 font-weight-black" style="color:#F59E0B">{{ op.appointments }}</div><div class="text-caption" style="color:#9FB0BC">Agendamentos</div></v-col>
              <v-col cols="6" class="text-center"><div class="text-h5 font-weight-black" style="color:#A78BFA">{{ op.takeovers }}</div><div class="text-caption" style="color:#9FB0BC">Atend. humanos</div></v-col>
            </v-row>
          </v-card>
        </v-col>
        <v-col v-if="!metrics.length" cols="12">
          <v-card class="glass pa-12 text-center" border>
            <p class="text-body-2" style="color:#6B7C88">Nenhum usuário com atividade no período.</p>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <!-- Dialog: criar/editar -->
    <v-dialog v-model="editDialog" max-width="560">
      <v-card class="glass pa-2" border>
        <v-card-title class="d-flex align-center ga-3 text-h6 font-weight-bold">
          <v-avatar :color="avatarColor({ name: editForm.name || editForm.email || '?' })" size="36" rounded="lg">
            <span style="font-size:12px;font-weight:700;color:white">{{ (editForm.name || editForm.email || '?').slice(0, 2).toUpperCase() }}</span>
          </v-avatar>
          {{ editMode ? 'Editar Usuário' : 'Novo Usuário' }}
        </v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12" sm="6"><v-text-field v-model="editForm.name" label="Nome *" /></v-col>
            <v-col cols="12" sm="6"><v-text-field v-model="editForm.email" label="Email *" type="email" /></v-col>
            <v-col v-if="!editMode" cols="12" sm="6">
              <v-text-field v-model="editForm.password" label="Senha *" :type="showPass ? 'text' : 'password'" :append-inner-icon="showPass ? 'mdi-eye-off' : 'mdi-eye'" @click:append-inner="showPass = !showPass" />
            </v-col>
            <v-col cols="12" sm="6"><v-text-field v-model="editForm.phone" label="Telefone" /></v-col>
            <v-col cols="12" sm="6">
              <v-select v-model="editForm.role" :items="[{ title: 'Administrador', value: 'admin' }, { title: 'Atendente', value: 'agent' }]" label="Perfil" />
            </v-col>
            <v-col cols="12" sm="6" class="d-flex align-center">
              <v-switch v-model="editForm.is_restricted" label="Usuário restrito" color="warning" hide-details density="compact" />
            </v-col>
          </v-row>
          <div v-if="editForm.role === 'agent'" class="mt-3">
            <v-expansion-panels variant="accordion">
              <v-expansion-panel>
                <v-expansion-panel-title prepend-icon="mdi-menu" class="text-body-2 font-weight-bold">Permissões de Menu</v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="pt-2">
                    <div v-for="perm in permissionItems" :key="perm.key" class="d-flex align-center flex-wrap ga-3 py-1 perm-row">
                      <div class="text-body-2 font-weight-medium" style="min-width:110px">{{ perm.label }}</div>
                      <v-checkbox
                        v-for="action in actionItems" :key="action.key"
                        v-model="editForm.permissions[perm.key][action.key]"
                        :label="action.label" color="primary" hide-details density="compact"
                      />
                    </div>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
          <v-alert v-if="editForm.role === 'admin'" variant="tonal" color="primary" density="compact" prepend-icon="mdi-shield-check-outline" class="mt-3 text-caption">Administradores têm acesso completo a todos os menus.</v-alert>
          <v-alert v-if="editError" type="error" variant="tonal" density="compact" :text="editError" class="mt-3" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveOp">{{ editMode ? 'Salvar alterações' : 'Criar Usuário' }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: reset senha -->
    <v-dialog v-model="resetDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Redefinir Senha</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3" style="color:#9FB0BC">{{ resetTarget?.name || resetTarget?.email }}</p>
          <v-text-field v-model="newPassword" label="Nova senha (mín. 8)" :type="showPass ? 'text' : 'password'" :append-inner-icon="showPass ? 'mdi-eye-off' : 'mdi-eye'" @click:append-inner="showPass = !showPass" />
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
        <v-card-title class="text-h6 font-weight-bold">Excluir usuário?</v-card-title>
        <v-card-text>Tem certeza que deseja excluir <strong>{{ deleteTarget?.name || deleteTarget?.email }}</strong>? Irreversível.</v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" :loading="saving" @click="doDelete">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { operatorSchema, operatorResetPasswordSchema } from '@/schemas/operators'
import { validateForm } from '@/composables/useZodValidation'

const auth = useAuthStore()
const toast = useToast()
const isAdmin = computed(() => auth.user?.role === 'admin' || auth.user?.role === 'owner')

const tab = ref('list')
const loading = ref(true)
const loadingDash = ref(false)
const saving = ref(false)
const showPass = ref(false)
const search = ref('')
const operators = ref([])
const metrics = ref([])

const editDialog = ref(false)
const editMode = ref(false)
const editTarget = ref(null)
const editError = ref('')
// Cada área controla 4 ações independentes (ver/criar/editar/excluir) — ver
// middleware/auth.js requirePermission() no backend, mesma convenção.
const FULL_ACCESS = { view: true, create: true, edit: true, delete: true }
const NO_ACCESS = { view: false, create: false, edit: false, delete: false }
const AREA_KEYS = ['chat', 'kanban', 'contatos', 'leads', 'agenda', 'templates', 'broadcast']
function defaultPermissions() {
  return Object.fromEntries(AREA_KEYS.map((k) => [k, { ...FULL_ACCESS }]))
}
// Normaliza o que vem da API: formato antigo (booleano único por área) vira
// acesso total/nenhum; formato novo (objeto parcial) é completado com NO_ACCESS.
function normalizePermissions(raw) {
  return Object.fromEntries(AREA_KEYS.map((key) => {
    const val = raw?.[key]
    if (val === true) return [key, { ...FULL_ACCESS }]
    if (val && typeof val === 'object') return [key, { ...NO_ACCESS, ...val }]
    return [key, { ...NO_ACCESS }]
  }))
}
const editForm = reactive({ name: '', email: '', password: '', phone: '', role: 'agent', is_restricted: false, permissions: defaultPermissions() })
const permissionItems = [
  { key: 'chat', label: 'Chat SDR' }, { key: 'kanban', label: 'CRM Kanban' }, { key: 'contatos', label: 'Contatos' },
  { key: 'leads', label: 'Leads' }, { key: 'agenda', label: 'Agenda' }, { key: 'templates', label: 'Templates' }, { key: 'broadcast', label: 'Broadcast' },
]
const actionItems = [
  { key: 'view', label: 'Ver' }, { key: 'create', label: 'Criar' }, { key: 'edit', label: 'Editar' }, { key: 'delete', label: 'Excluir' },
]

const resetDialog = ref(false); const resetTarget = ref(null); const newPassword = ref('')
const deleteDialog = ref(false); const deleteTarget = ref(null)

const headers = [
  { title: '', key: 'name', width: '220' },
  { title: 'Email', key: 'email' }, { title: 'Telefone', key: 'phone' }, { title: 'Perfil', key: 'role' }, { title: 'Status', key: 'active' },
  { title: 'Último acesso', key: 'last_login_at' }, { title: '', key: 'actions', sortable: false, align: 'end' },
]

const AVATAR_COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#14B8A6','#F97316','#84CC16']
function avatarColor(op) { const s = op.name || op.email || '?'; return AVATAR_COLORS[s.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length] }
const filteredOps = computed(() => { if (!search.value) return operators.value; const q = search.value.toLowerCase(); return operators.value.filter((o) => (o.name || '').toLowerCase().includes(q) || o.email.toLowerCase().includes(q)) })
function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }

async function load() { loading.value = true; try { const { operators: ops } = await api.listOperators(); operators.value = ops } catch (e) { toast.error(e.message) } finally { loading.value = false } }
async function loadDashboard() { loadingDash.value = true; try { const { metrics: m } = await api.operatorsDashboard(); metrics.value = m } catch (e) { toast.error(e.message) } finally { loadingDash.value = false } }
function onDashTab() { if (!metrics.value.length) loadDashboard() }

function openCreate() { editMode.value = false; editTarget.value = null; editError.value = ''; showPass.value = false; Object.assign(editForm, { name: '', email: '', password: '', phone: '', role: 'agent', is_restricted: false, permissions: defaultPermissions() }); editDialog.value = true }
function openEdit(op) { editMode.value = true; editTarget.value = op; editError.value = ''; Object.assign(editForm, { name: op.name || '', email: op.email, phone: op.phone || '', role: op.role, is_restricted: op.is_restricted ?? false, permissions: normalizePermissions(op.permissions) }); editDialog.value = true }

async function saveOp() {
  editError.value = ''
  const check = validateForm(operatorSchema, { name: editForm.name, email: editForm.email, password: editMode.value ? undefined : (editForm.password || undefined) })
  if (!check.success) { editError.value = check.error; return }
  if (!editMode.value && !check.data.password) { editError.value = 'Senha obrigatória.'; return }
  saving.value = true
  try {
    const payload = { name: check.data.name, email: check.data.email, phone: editForm.phone || null, role: editForm.role, is_restricted: editForm.is_restricted, permissions: editForm.role === 'admin' ? defaultPermissions() : { ...editForm.permissions } }
    if (!editMode.value) payload.password = check.data.password
    if (editMode.value) { const { operator } = await api.updateOperator(editTarget.value.id, payload); const idx = operators.value.findIndex((o) => o.id === editTarget.value.id); if (idx >= 0) operators.value[idx] = { ...operators.value[idx], ...operator } }
    else { const { operator } = await api.createOperator(payload); operators.value.unshift(operator) }
    editDialog.value = false; toast.success(editMode.value ? 'Usuário atualizado.' : 'Usuário criado!')
  } catch (e) { editError.value = e.message } finally { saving.value = false }
}

async function toggleActive(op) { try { const { operator } = await api.updateOperator(op.id, { active: !op.active }); const idx = operators.value.findIndex((o) => o.id === op.id); if (idx >= 0) operators.value[idx] = { ...operators.value[idx], ...operator }; toast.success(op.active ? 'Usuário desativado.' : 'Usuário ativado.') } catch (e) { toast.error(e.message) } }
function openReset(op) { resetTarget.value = op; newPassword.value = ''; showPass.value = false; resetDialog.value = true }
async function doReset() { const check = validateForm(operatorResetPasswordSchema, { password: newPassword.value }); if (!check.success) { toast.warning(check.error); return }; saving.value = true; try { await api.resetOperatorPassword(resetTarget.value.id, check.data.password); resetDialog.value = false; toast.success('Senha redefinida.') } catch (e) { toast.error(e.message) } finally { saving.value = false } }
function openDelete(op) { deleteTarget.value = op; deleteDialog.value = true }
async function doDelete() { saving.value = true; try { await api.deleteOperator(deleteTarget.value.id); operators.value = operators.value.filter((o) => o.id !== deleteTarget.value.id); deleteDialog.value = false; toast.success('Usuário excluído.') } catch (e) { toast.error(e.message) } finally { saving.value = false } }

onMounted(load)
</script>
