<template>
  <div class="admin-page">
    <div class="page-header mb-5">
      <div>
        <h1 class="page-title">Suporte</h1>
        <p class="page-sub">{{ tickets.length }} chamado{{ tickets.length !== 1 ? 's' : '' }} {{ statusFilterLabel }}</p>
      </div>
      <div class="d-flex align-center ga-2">
        <v-btn-toggle v-model="statusFilter" mandatory density="compact" color="primary" variant="outlined">
          <v-btn value="open" size="small">Aguardando</v-btn>
          <v-btn value="in_progress" size="small">Em atendimento</v-btn>
          <v-btn value="closed" size="small">Encerrados</v-btn>
          <v-btn value="" size="small">Todos</v-btn>
        </v-btn-toggle>
        <v-btn icon variant="text" size="small" :loading="loading" @click="load"><v-icon icon="mdi-refresh" /></v-btn>
      </div>
    </div>

    <div v-if="loading" class="text-center py-8">
      <v-progress-circular indeterminate color="primary" size="28" width="2" />
    </div>
    <div v-else-if="!groupedByTenant.length" class="text-body-2 text-center py-8" style="color:var(--text-faint)">
      Nenhum chamado por aqui.
    </div>
    <v-expansion-panels v-else multiple :model-value="groupedByTenant.map((_, i) => i)">
      <v-expansion-panel v-for="group in groupedByTenant" :key="group.tenant_id">
        <v-expansion-panel-title>
          <v-icon icon="mdi-domain" size="18" class="mr-2" />
          <span class="font-weight-bold">{{ group.tenant_name || 'Empresa desconhecida' }}</span>
          <v-chip size="x-small" class="ml-2" variant="tonal">{{ group.tickets.length }}</v-chip>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <button
            v-for="tk in group.tickets" :key="tk.id"
            class="support-ticket-item"
            @click="openTicket(tk)"
          >
            <div>
              <span class="support-ticket-cat">{{ categoryLabel(tk.category) }}</span>
              <div class="support-ticket-desc">{{ tk.user_name || tk.user_email }}{{ tk.description ? ' — ' + tk.description : '' }}</div>
            </div>
            <v-chip :color="statusColor(tk.status)" size="x-small" variant="flat">{{ statusLabel(tk.status) }}</v-chip>
          </button>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- ─── Dialog: chat do chamado ─── -->
    <v-dialog v-model="showChatDialog" max-width="560" scrollable>
      <v-card v-if="activeTicket" class="support-chat-card">
        <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2">
          <div>
            <div>{{ categoryLabel(activeTicket.category) }}</div>
            <div class="text-caption" style="color:var(--text-muted)">{{ activeTicket.tenant_name }} — {{ activeTicket.user_name || activeTicket.user_email }}</div>
          </div>
          <v-chip :color="statusColor(activeTicket.status)" size="x-small" variant="flat">{{ statusLabel(activeTicket.status) }}</v-chip>
        </v-card-title>
        <v-divider />
        <v-card-text class="support-chat-messages">
          <div v-if="!messages.length" class="text-body-2 text-center py-6" style="color:var(--text-faint)">
            Nenhuma mensagem ainda.
          </div>
          <div
            v-for="m in messages" :key="m.id"
            class="support-msg"
            :class="{ 'support-msg--owner': m.sender_type === 'owner' }"
          >
            <div class="support-msg-bubble">{{ m.text }}</div>
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3 flex-wrap ga-2">
          <template v-if="activeTicket.status === 'open'">
            <v-btn color="primary" variant="flat" prepend-icon="mdi-headset" :loading="starting" @click="startSupport">
              Iniciar suporte
            </v-btn>
          </template>
          <template v-else-if="activeTicket.status === 'in_progress'">
            <v-text-field
              v-model="newMessageText"
              placeholder="Digite sua resposta..."
              variant="outlined"
              density="compact"
              hide-details
              @keyup.enter="sendMessage"
            />
            <v-btn icon="mdi-send" color="primary" variant="flat" :loading="sending" @click="sendMessage" />
            <v-btn variant="text" color="error" size="small" :loading="closing" @click="closeSupport">Encerrar</v-btn>
          </template>
          <span v-else class="text-body-2" style="color:var(--text-faint)">Este chamado foi encerrado.</span>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">{{ snackbar.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api } from '@/services/api'

const categoryOptions = {
  tecnico: 'Problema técnico / erro na plataforma',
  duvida: 'Dúvida sobre como usar',
  whatsapp: 'Problema de conexão do WhatsApp',
  financeiro: 'Cobrança / financeiro',
  sugestao: 'Sugestão de melhoria',
  outro: 'Outro',
}
function categoryLabel(value) { return categoryOptions[value] || value }
function statusLabel(status) { return { open: 'Aguardando', in_progress: 'Em atendimento', closed: 'Encerrado' }[status] || status }
function statusColor(status) { return { open: 'warning', in_progress: 'info', closed: 'default' }[status] || 'default' }

const statusFilter = ref('open')
const statusFilterLabel = computed(() => statusFilter.value ? `(${statusLabel(statusFilter.value).toLowerCase()})` : '(todos)')

const tickets = ref([])
const loading = ref(false)
const snackbar = ref({ show: false, text: '', color: 'error' })
function notify(text, color = 'error') { snackbar.value = { show: true, text, color } }

async function load() {
  loading.value = true
  try {
    tickets.value = await api.adminListSupportTickets(statusFilter.value || undefined)
  } catch {
    notify('Não foi possível carregar os chamados.')
  } finally {
    loading.value = false
  }
}
watch(statusFilter, load)

const groupedByTenant = computed(() => {
  const map = new Map()
  for (const tk of tickets.value) {
    if (!map.has(tk.tenant_id)) map.set(tk.tenant_id, { tenant_id: tk.tenant_id, tenant_name: tk.tenant_name, tickets: [] })
    map.get(tk.tenant_id).tickets.push(tk)
  }
  return [...map.values()]
})

const showChatDialog = ref(false)
const activeTicket = ref(null)
const messages = ref([])
const newMessageText = ref('')
const starting = ref(false)
const sending = ref(false)
const closing = ref(false)
let pollInterval = null

async function loadMessages() {
  if (!activeTicket.value) return
  try {
    messages.value = await api.adminGetSupportMessages(activeTicket.value.id)
  } catch {
    // silencioso — próximo poll tenta de novo
  }
}

function openTicket(ticket) {
  activeTicket.value = ticket
  showChatDialog.value = true
  messages.value = []
  loadMessages()
  stopPolling()
  pollInterval = setInterval(loadMessages, 4000)
}

async function startSupport() {
  starting.value = true
  try {
    const updated = await api.adminStartSupportTicket(activeTicket.value.id)
    activeTicket.value = { ...activeTicket.value, ...updated }
    const inList = tickets.value.find((t) => t.id === updated.id)
    if (inList) Object.assign(inList, updated)
  } catch {
    notify('Não foi possível iniciar o atendimento.')
  } finally {
    starting.value = false
  }
}

async function sendMessage() {
  const text = newMessageText.value.trim()
  if (!text || !activeTicket.value) return
  sending.value = true
  try {
    const msg = await api.adminSendSupportMessage(activeTicket.value.id, text)
    messages.value.push(msg)
    newMessageText.value = ''
  } catch {
    notify('Não foi possível enviar a mensagem.')
  } finally {
    sending.value = false
  }
}

async function closeSupport() {
  closing.value = true
  try {
    const updated = await api.adminCloseSupportTicket(activeTicket.value.id)
    activeTicket.value = { ...activeTicket.value, ...updated }
    tickets.value = tickets.value.filter((t) => t.id !== updated.id || statusFilter.value === '')
  } catch {
    notify('Não foi possível encerrar o chamado.')
  } finally {
    closing.value = false
  }
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
}
watch(showChatDialog, (open) => { if (!open) stopPolling() })

onMounted(load)
onUnmounted(stopPolling)
</script>

<style scoped>
.support-ticket-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 12px; border-radius: 10px;
  background: var(--panel-bg); border: 1px solid var(--border-subtle);
  cursor: pointer; text-align: left; width: 100%; margin-bottom: 6px;
  transition: background 0.12s;
}
.support-ticket-item:hover { background: var(--panel-hover); }
.support-ticket-cat { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.support-ticket-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

.support-chat-messages { max-height: 360px; min-height: 160px; overflow-y: auto; padding: 16px !important; }
.support-msg { display: flex; margin-bottom: 8px; }
.support-msg--owner { justify-content: flex-end; }
.support-msg-bubble {
  max-width: 80%; padding: 8px 12px; border-radius: 12px;
  background: var(--panel-bg); font-size: 13px; color: var(--text-primary);
  white-space: pre-wrap; word-break: break-word;
}
.support-msg--owner .support-msg-bubble { background: rgba(99,102,241,0.18); }
</style>
