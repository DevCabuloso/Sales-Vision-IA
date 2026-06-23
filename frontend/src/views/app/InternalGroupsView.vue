<template>
  <div class="ig-layout">

    <!-- ══ SIDEBAR ══ -->
    <aside class="ig-sidebar">

      <!-- Header -->
      <div class="ig-sidebar-header">
        <div class="d-flex align-center justify-space-between pa-3 pb-2">
          <span class="ig-sidebar-title">Grupos Internos</span>
          <button v-if="isAdmin" class="ig-new-btn" @click="openCreate">
            <v-icon icon="mdi-plus" size="16" />
            Novo
          </button>
        </div>
        <div class="px-3 pb-3">
          <v-text-field
            v-model="search"
            placeholder="Buscar grupo..."
            variant="outlined"
            density="compact"
            hide-details
            prepend-inner-icon="mdi-magnify"
          />
        </div>
      </div>

      <!-- Lista -->
      <div class="ig-group-list">
        <div
          v-for="g in filteredGroups"
          :key="g.id"
          class="ig-group-item"
          :class="{ active: activeGroup?.id === g.id }"
          @click="selectGroup(g)"
        >
          <div class="ig-avatar" :style="{ background: avatarColor(g.name) }">
            {{ initials(g.name) }}
          </div>
          <div class="ig-group-body">
            <div class="ig-group-row1">
              <span class="ig-group-name">{{ g.name }}</span>
            </div>
            <div class="ig-group-sub">
              <v-icon icon="mdi-account-multiple-outline" size="11" style="opacity:.5" />
              {{ memberCount(g) }} membros
            </div>
          </div>
        </div>

        <div v-if="!filteredGroups.length" class="ig-empty-list">
          <v-icon icon="mdi-account-group-outline" size="36" style="opacity:.3" />
          <p>Nenhum grupo encontrado</p>
        </div>
      </div>
    </aside>

    <!-- ══ CHAT AREA ══ -->
    <div class="ig-chat-area">

      <!-- Vazio -->
      <div v-if="!activeGroup" class="ig-chat-empty">
        <v-icon icon="mdi-account-group-outline" size="52" style="opacity:.2" />
        <p style="color:#6B7C88;font-size:14px;margin-top:10px">Selecione ou crie um grupo</p>
        <button v-if="isAdmin" class="ig-create-btn" @click="openCreate">
          <v-icon icon="mdi-plus" size="15" /> Criar grupo
        </button>
      </div>

      <template v-else>

        <!-- Header -->
        <div class="ig-chat-header">
          <div class="d-flex align-center gap-3">
            <div class="ig-avatar" :style="{ background: avatarColor(activeGroup.name) }">
              {{ initials(activeGroup.name) }}
            </div>
            <div>
              <div style="font-size:14px;font-weight:700;color:#E2E8F0">{{ activeGroup.name }}</div>
              <div style="font-size:11px;color:#6B7C88;margin-top:1px">{{ memberNames(activeGroup) }}</div>
            </div>
          </div>
          <div class="ig-header-actions">
            <button class="ig-qa-btn" :class="{ active: showMembers }" @click="showMembers = !showMembers">
              <v-icon :icon="showMembers ? 'mdi-account-group' : 'mdi-account-group-outline'" size="15" />
              Membros
            </button>
            <div class="ig-qa-divider" />
            <button v-if="isAdmin" class="ig-qa-btn" @click="openEdit(activeGroup)">
              <v-icon icon="mdi-pencil-outline" size="15" />
              Editar
            </button>
            <button v-if="isAdmin" class="ig-qa-btn danger" @click="confirmDelete(activeGroup)">
              <v-icon icon="mdi-delete-outline" size="15" />
              Excluir
            </button>
          </div>
        </div>

        <!-- Corpo: mensagens + painel membros -->
        <div class="ig-body">

        <!-- Mensagens -->
        <div ref="msgContainer" class="ig-messages">
          <div v-if="loadingMsgs" class="d-flex align-center justify-center" style="flex:1;padding:40px">
            <v-progress-circular indeterminate size="28" color="primary" />
          </div>
          <template v-else>
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="ig-msg-wrapper"
              :class="msg.sender_id === auth.user?.id ? 'mine' : 'theirs'"
            >
              <div v-if="msg.sender_id !== auth.user?.id" class="ig-msg-avatar" :style="{ background: avatarColor(msg.sender?.name || '') }">
                {{ initials(msg.sender?.name) }}
              </div>
              <div class="ig-msg-bubble" :class="msg.sender_id === auth.user?.id ? 'mine' : 'theirs'">
                <div v-if="msg.sender_id !== auth.user?.id" class="ig-msg-sender">{{ msg.sender?.name || 'Desconhecido' }}</div>
                <div class="ig-msg-text">{{ msg.text }}</div>
                <div class="ig-msg-time">{{ formatTime(msg.created_at) }}</div>
              </div>
            </div>
          </template>
        </div>

        <!-- Painel de membros -->
        <transition name="slide-panel">
          <div v-if="showMembers" class="ig-members-panel">
            <div class="ig-mp-header">
              <span class="ig-mp-title">Membros</span>
              <span class="ig-mp-count">{{ activeGroup?.members?.length ?? 0 }}</span>
            </div>

            <!-- Lista de membros -->
            <div class="ig-mp-list">
              <div v-for="m in activeGroup?.members ?? []" :key="m.user_id" class="ig-mp-item">
                <div class="ig-mp-avatar" :style="{ background: avatarColor(m.users?.name || '') }">
                  {{ initials(m.users?.name) }}
                </div>
                <div class="ig-mp-info">
                  <div class="ig-mp-name">{{ m.users?.name || 'Desconhecido' }}</div>
                  <div class="ig-mp-email">{{ m.users?.email || '' }}</div>
                </div>
                <button
                  v-if="m.user_id !== activeGroup?.created_by"
                  class="ig-mp-remove"
                  :disabled="removingMember === m.user_id"
                  @click="removeMember(m.user_id)"
                >
                  <v-icon :icon="removingMember === m.user_id ? 'mdi-loading' : 'mdi-close'" size="14" />
                </button>
                <v-icon v-else icon="mdi-crown-outline" size="14" color="warning" class="ml-auto mr-1" />
              </div>
            </div>

            <!-- Adicionar membro -->
            <div class="ig-mp-add">
              <div class="ig-mp-add-label">Adicionar membro</div>
              <v-select
                v-model="addMemberSelected"
                :items="nonMembers"
                item-title="name"
                item-value="id"
                placeholder="Selecionar usuário..."
                variant="outlined"
                density="compact"
                hide-details
                clearable
                class="mb-2"
              />
              <button
                class="ig-mp-add-btn"
                :disabled="!addMemberSelected || addingMember"
                @click="addMember"
              >
                <v-icon icon="mdi-account-plus-outline" size="15" />
                {{ addingMember ? 'Adicionando...' : 'Adicionar' }}
              </button>
            </div>
          </div>
        </transition>

        </div><!-- /ig-body -->

        <!-- Input -->
        <div class="ig-input-bar">
          <v-textarea
            v-model="draft"
            placeholder="Mensagem interna..."
            variant="outlined"
            density="compact"
            hide-details
            rows="1"
            auto-grow
            max-rows="4"
            class="ig-input"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <button class="ig-send-btn" :disabled="!draft.trim() || sending" @click="sendMessage">
            <v-icon icon="mdi-send" size="18" />
          </button>
        </div>

      </template>
    </div>

    <!-- ══ Dialog: Criar ══ -->
    <v-dialog v-model="createDialog" max-width="460">
      <v-card class="pa-2" border
        style="background:rgb(var(--v-theme-surface));border-radius:16px;border:1px solid rgba(255,255,255,0.08)!important;box-shadow:0 8px 32px rgba(0,0,0,0.5)"
      >
        <v-card-title class="text-h6 font-weight-bold pt-3 px-4">Novo Grupo Interno</v-card-title>
        <v-card-text class="px-4">
          <v-text-field v-model="form.name" label="Nome do grupo" variant="outlined" density="compact" class="mb-3" @keydown.enter="submitCreate" />
          <v-select
            v-model="form.member_ids"
            :items="availableUsers"
            item-title="name"
            item-value="id"
            label="Membros"
            variant="outlined"
            density="compact"
            multiple
            chips
            closable-chips
          />
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" :text="formError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="createDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="submitCreate">Criar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ══ Dialog: Editar ══ -->
    <v-dialog v-model="editDialog" max-width="460">
      <v-card class="pa-2" border
        style="background:rgb(var(--v-theme-surface));border-radius:16px;border:1px solid rgba(255,255,255,0.08)!important;box-shadow:0 8px 32px rgba(0,0,0,0.5)"
      >
        <v-card-title class="text-h6 font-weight-bold pt-3 px-4">Editar Grupo</v-card-title>
        <v-card-text class="px-4">
          <v-text-field v-model="editForm.name" label="Nome do grupo" variant="outlined" density="compact" class="mb-3" />
          <v-select
            v-model="editForm.member_ids"
            :items="availableUsers"
            item-title="name"
            item-value="id"
            label="Membros"
            variant="outlined"
            density="compact"
            multiple
            chips
            closable-chips
          />
          <v-alert v-if="editError" type="error" variant="tonal" density="compact" :text="editError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="submitEdit">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ══ Dialog: Excluir ══ -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card class="pa-2" border
        style="background:rgb(var(--v-theme-surface));border-radius:16px;border:1px solid rgba(255,255,255,0.08)!important;box-shadow:0 8px 32px rgba(0,0,0,0.5)"
      >
        <v-card-title class="text-h6 font-weight-bold pt-3 px-4">Excluir grupo</v-card-title>
        <v-card-text class="px-4">Tem certeza que deseja excluir <strong>{{ deleteTarget?.name }}</strong>?</v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" :loading="deleting" @click="doDelete">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const auth    = useAuthStore()
const isAdmin = computed(() => auth.user?.role === 'admin' || auth.user?.role === 'owner')

const AVATAR_COLORS = ['#6366F1','#8B5CF6','#EC4899','#14B8A6','#F59E0B','#10B981','#3B82F6','#EF4444']
function avatarColor(name) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length; return AVATAR_COLORS[Math.abs(h)] }

const groups        = ref([])
const search        = ref('')
const activeGroup   = ref(null)
const messages      = ref([])
const loadingMsgs   = ref(false)
const draft         = ref('')
const sending       = ref(false)
const saving        = ref(false)
const deleting      = ref(false)
const availableUsers   = ref([])
const msgContainer     = ref(null)
const showMembers      = ref(false)
const addMemberSelected = ref(null)
const addingMember     = ref(false)
const removingMember   = ref(null)

const nonMembers = computed(() => {
  const memberIds = new Set((activeGroup.value?.members ?? []).map((m) => m.user_id))
  return availableUsers.value.filter((u) => !memberIds.has(u.id))
})

const snack = reactive({ show: false, text: '', color: 'success' })
function toast(text, color = 'success') { snack.text = text; snack.color = color; snack.show = true }

const filteredGroups = computed(() =>
  search.value ? groups.value.filter((g) => g.name.toLowerCase().includes(search.value.toLowerCase())) : groups.value
)

async function loadGroups() {
  try {
    const { groups: list } = await api.listInternalGroups()
    groups.value = list
    if (activeGroup.value) {
      activeGroup.value = list.find((g) => g.id === activeGroup.value.id) || activeGroup.value
    }
  } catch (e) { toast(e.message, 'error') }
}

async function selectGroup(g) {
  activeGroup.value = g
  messages.value = []
  loadingMsgs.value = true
  try {
    const { messages: msgs } = await api.listInternalMessages(g.id)
    messages.value = msgs
    scrollToBottom()
  } catch (e) { toast(e.message, 'error') }
  finally { loadingMsgs.value = false }
}

async function sendMessage() {
  if (!draft.value.trim() || sending.value) return
  const text = draft.value.trim()
  draft.value = ''
  sending.value = true
  try {
    const { message } = await api.sendInternalMessage(activeGroup.value.id, text)
    messages.value.push(message)
    scrollToBottom()
  } catch (e) { toast(e.message, 'error'); draft.value = text }
  finally { sending.value = false }
}

async function pollMessages() {
  if (!activeGroup.value) return
  const lastTs = messages.value.length ? messages.value[messages.value.length - 1].created_at : null
  try {
    const params = lastTs ? { after: lastTs } : { limit: 60 }
    const { messages: fresh } = await api.listInternalMessages(activeGroup.value.id, params)
    if (!lastTs) { messages.value = fresh }
    else if (fresh.length) {
      const ids = new Set(messages.value.map((m) => m.id))
      const newOnes = fresh.filter((m) => !ids.has(m.id))
      if (newOnes.length) { messages.value.push(...newOnes); scrollToBottom() }
    }
  } catch { /* silencioso */ }
}

function scrollToBottom() {
  nextTick(() => { if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight })
}

async function loadUsers() {
  try {
    const data = await api.listOperators()
    availableUsers.value = data.operators || data || []
  } catch { /* ignora */ }
}

async function addMember() {
  if (!addMemberSelected.value || !activeGroup.value) return
  addingMember.value = true
  try {
    const currentIds = (activeGroup.value.members ?? []).map((m) => m.user_id)
    await api.updateInternalGroup(activeGroup.value.id, {
      member_ids: [...currentIds, addMemberSelected.value].filter((id) => id !== activeGroup.value.created_by),
    })
    addMemberSelected.value = null
    await loadGroups()
  } catch (e) { toast(e.message, 'error') } finally { addingMember.value = false }
}

async function removeMember(userId) {
  if (!activeGroup.value) return
  removingMember.value = userId
  try {
    const currentIds = (activeGroup.value.members ?? [])
      .map((m) => m.user_id)
      .filter((id) => id !== userId && id !== activeGroup.value.created_by)
    await api.updateInternalGroup(activeGroup.value.id, { member_ids: currentIds })
    await loadGroups()
  } catch (e) { toast(e.message, 'error') } finally { removingMember.value = null }
}

// ── criar ──
const createDialog = ref(false)
const form = reactive({ name: '', member_ids: [] })
const formError = ref('')

function openCreate() { form.name = ''; form.member_ids = []; formError.value = ''; loadUsers(); createDialog.value = true }

async function submitCreate() {
  formError.value = ''
  if (!form.name.trim()) { formError.value = 'Nome obrigatório.'; return }
  saving.value = true
  try {
    const { group } = await api.createInternalGroup({ name: form.name.trim(), member_ids: form.member_ids })
    groups.value.unshift(group)
    createDialog.value = false
    toast('Grupo criado!')
    selectGroup(group)
  } catch (e) { formError.value = e.message } finally { saving.value = false }
}

// ── editar ──
const editDialog = ref(false)
const editTarget = ref(null)
const editForm   = reactive({ name: '', member_ids: [] })
const editError  = ref('')

function openEdit(g) {
  editTarget.value = g
  editForm.name = g.name
  editForm.member_ids = (g.members || []).map((m) => m.user_id).filter((id) => id !== g.created_by)
  editError.value = ''
  loadUsers()
  editDialog.value = true
}

async function submitEdit() {
  editError.value = ''
  if (!editForm.name.trim()) { editError.value = 'Nome obrigatório.'; return }
  saving.value = true
  try {
    await api.updateInternalGroup(editTarget.value.id, { name: editForm.name.trim(), member_ids: editForm.member_ids })
    await loadGroups()
    editDialog.value = false
    toast('Grupo atualizado.')
  } catch (e) { editError.value = e.message } finally { saving.value = false }
}

// ── excluir ──
const deleteDialog = ref(false)
const deleteTarget = ref(null)
function confirmDelete(g) { deleteTarget.value = g; deleteDialog.value = true }

async function doDelete() {
  deleting.value = true
  try {
    await api.deleteInternalGroup(deleteTarget.value.id)
    groups.value = groups.value.filter((g) => g.id !== deleteTarget.value.id)
    if (activeGroup.value?.id === deleteTarget.value.id) { activeGroup.value = null; messages.value = [] }
    deleteDialog.value = false
    toast('Grupo excluído.')
  } catch (e) { toast(e.message, 'error') } finally { deleting.value = false }
}

// ── helpers ──
function memberCount(g) { return g.members?.length ?? 0 }
function memberNames(g) { return (g.members || []).map((m) => m.users?.name || '?').join(', ') || 'Sem membros' }
function initials(name) { return (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() }
function formatTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

let pollTimer = null
let groupsTimer = null

onMounted(async () => {
  await loadGroups()
  await loadUsers()
  pollTimer   = setInterval(pollMessages, 3000)
  groupsTimer = setInterval(loadGroups,  8000)
})
onUnmounted(() => {
  if (pollTimer)   clearInterval(pollTimer)
  if (groupsTimer) clearInterval(groupsTimer)
})
</script>

<style scoped>
.ig-layout {
  display: flex;
  height: calc(100vh - 80px);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
}

/* ── Sidebar ── */
.ig-sidebar {
  width: 300px;
  min-width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: rgba(255,255,255,0.02);
  border-right: 1px solid rgba(255,255,255,0.07);
}

.ig-sidebar-header {
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.ig-sidebar-title {
  font-size: 14px;
  font-weight: 700;
  color: #E2E8F0;
}

.ig-new-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 8px;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: white;
  transition: opacity .15s;
}
.ig-new-btn:hover { opacity: .85; }

.ig-group-list {
  flex: 1;
  overflow-y: auto;
}

.ig-group-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background .15s;
}
.ig-group-item:hover { background: rgba(255,255,255,0.035); }
.ig-group-item.active { background: rgba(99,102,241,0.1); border-left: 3px solid #6366F1; padding-left: 9px; }

.ig-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.ig-group-body { flex: 1; min-width: 0; }
.ig-group-row1 { display: flex; align-items: center; margin-bottom: 2px; }
.ig-group-name {
  font-size: 13px;
  font-weight: 600;
  color: #E2E8F0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.ig-group-sub {
  font-size: 11px;
  color: #6B7C88;
  display: flex;
  align-items: center;
  gap: 3px;
}

.ig-empty-list {
  text-align: center;
  padding: 48px 16px;
  color: #6B7C88;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

/* ── Chat area ── */
.ig-chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(0,0,0,0.08);
  min-width: 0;
}

.ig-chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.ig-create-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  padding: 7px 18px;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: white;
}

/* Header */
.ig-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

/* Messages */
.ig-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ig-msg-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.ig-msg-wrapper.mine  { flex-direction: row-reverse; }

.ig-msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.ig-msg-bubble {
  max-width: 70%;
  padding: 9px 13px;
  border-radius: 14px;
  word-break: break-word;
}
.ig-msg-bubble.theirs {
  background: rgba(255,255,255,0.08);
  border-radius: 4px 14px 14px 14px;
}
.ig-msg-bubble.mine {
  background: rgba(99,102,241,0.25);
  border-radius: 14px 4px 14px 14px;
}

.ig-msg-sender {
  font-size: 10px;
  font-weight: 700;
  color: #818CF8;
  margin-bottom: 3px;
}

.ig-msg-text {
  font-size: 13px;
  color: #E2E8F0;
  line-height: 1.55;
  white-space: pre-wrap;
}

.ig-msg-time {
  font-size: 10px;
  color: #6B7C88;
  margin-top: 4px;
  text-align: right;
}

/* Botões de ação do header */
.ig-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ig-qa-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #9FB0BC;
  background: none;
  border: none;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.ig-qa-btn:hover  { color: #E2E8F0; background: rgba(255,255,255,0.06); }
.ig-qa-btn.active { color: #818CF8; background: rgba(99,102,241,0.12); }
.ig-qa-btn.danger:hover { color: #F87171; background: rgba(239,68,68,0.1); }

.ig-qa-divider {
  width: 1px;
  height: 18px;
  background: rgba(255,255,255,0.08);
  margin: 0 3px;
  flex-shrink: 0;
}

/* Body (mensagens + painel) */
.ig-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Painel de membros */
.ig-members-panel {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: rgba(255,255,255,0.02);
  border-left: 1px solid rgba(255,255,255,0.07);
  overflow: hidden;
}

.ig-mp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.ig-mp-title { font-size: 12px; font-weight: 700; color: #E2E8F0; text-transform: uppercase; letter-spacing: .5px; }
.ig-mp-count {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px;
  background: rgba(99,102,241,0.2); color: #818CF8;
}

.ig-mp-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.ig-mp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  transition: background .12s;
}
.ig-mp-item:hover { background: rgba(255,255,255,0.03); }

.ig-mp-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: white;
}

.ig-mp-info { flex: 1; min-width: 0; }
.ig-mp-name  { font-size: 12px; font-weight: 600; color: #E2E8F0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ig-mp-email { font-size: 10px; color: #6B7C88; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.ig-mp-remove {
  width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
  background: none; border: none; cursor: pointer;
  color: #6B7C88; display: flex; align-items: center; justify-content: center;
  transition: all .12s;
}
.ig-mp-remove:hover:not(:disabled) { background: rgba(239,68,68,0.15); color: #EF4444; }
.ig-mp-remove:disabled { opacity: .4; cursor: default; }

.ig-mp-add {
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid rgba(255,255,255,0.07);
}
.ig-mp-add-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #6B7C88; margin-bottom: 8px; }

.ig-mp-add-btn {
  width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 5px;
  padding: 7px; border-radius: 8px;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  border: none; cursor: pointer;
  font-size: 12px; font-weight: 600; color: white;
  transition: opacity .15s;
}
.ig-mp-add-btn:hover:not(:disabled) { opacity: .85; }
.ig-mp-add-btn:disabled { opacity: .35; cursor: default; }

/* Transição do painel */
.slide-panel-enter-active,
.slide-panel-leave-active { transition: width .2s ease, opacity .2s ease; overflow: hidden; }
.slide-panel-enter-from,
.slide-panel-leave-to { width: 0 !important; opacity: 0; }

/* Input */
.ig-input-bar {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 12px 10px;
  border-top: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.02);
}

.ig-input { flex: 1; }

.ig-send-btn {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  border: none;
  cursor: pointer;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity .15s;
  margin-bottom: 2px;
}
.ig-send-btn:hover:not(:disabled) { opacity: .85; }
.ig-send-btn:disabled { opacity: .35; cursor: default; }
</style>
