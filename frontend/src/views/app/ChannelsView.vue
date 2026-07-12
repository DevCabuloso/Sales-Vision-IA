<template>
  <div>
    <!-- Header -->
    <div class="ch-header">
      <div>
        <h1 class="ch-title">Canais</h1>
        <p class="ch-sub">Conecte números de WhatsApp à sua operação.</p>
      </div>
      <div class="d-flex align-center gap-2">
        <!-- Ordenação -->
        <v-select
          v-model="sortBy"
          :items="sortOptions"
          variant="outlined"
          density="compact"
          hide-details
          style="min-width:160px"
        />
        <button class="ch-new-btn" @click="openNew">
          <v-icon icon="mdi-plus" size="18" />
          Novo Canal
        </button>
      </div>
    </div>

    <!-- Loading / Erro -->
    <div v-if="loading" class="py-12 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
    </div>

    <div v-else-if="loadError" class="ch-empty">
      <v-icon icon="mdi-alert-circle-outline" size="56" color="error" class="ch-empty-icon" />
      <div class="ch-empty-title">Erro ao carregar canais</div>
      <p class="ch-empty-sub">{{ loadError }}</p>
      <button class="ch-btn ch-btn-connect" @click="load">
        <v-icon icon="mdi-refresh" size="15" />
        Tentar novamente
      </button>
    </div>

    <template v-else>

    <!-- Grid de cards -->
    <div v-if="channels.length" class="ch-grid">
      <div v-for="ch in sortedChannels" :key="ch.id" class="ch-card" :class="{ 'ch-card--default': ch.is_default }">

        <!-- Topo: avatar + nome + menu -->
        <div class="ch-card-top">
          <div class="ch-wa-icon">
            <v-icon icon="mdi-whatsapp" size="26" color="white" />
          </div>
          <div class="ch-card-name-wrap">
            <div class="ch-card-name">
              {{ ch.name }}
              <span v-if="ch.is_default" class="ch-default-badge">Padrão</span>
            </div>
            <div class="ch-card-slug">#{{ ch.id.slice(0,4) }} · {{ ch.instance_name || ch.name.toLowerCase() }}</div>
          </div>

          <!-- Menu três pontos -->
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <button v-bind="props" class="ch-menu-btn">
                <v-icon icon="mdi-dots-vertical" size="18" />
              </button>
            </template>
            <v-list density="compact" min-width="210" class="glass">
              <v-list-item prepend-icon="mdi-cog-outline"      title="Configurar"              @click="openSettings(ch)" />
              <v-list-item prepend-icon="mdi-pencil-outline"   title="Renomear"               @click="openRename(ch)" />
              <v-list-item prepend-icon="mdi-star-outline"     title="Definir como padrão"    @click="setDefault(ch)" :disabled="ch.is_default" />
              <v-list-item prepend-icon="mdi-refresh"          title="Verificar status"        @click="refreshStatus(ch)" />
              <v-list-item prepend-icon="mdi-webhook"          title="Revalidar Webhook"       @click="revalidateWebhook(ch)" />
              <v-divider class="my-1" />
              <v-list-item prepend-icon="mdi-archive-check-outline" title="Fechar tickets abertos"   @click="openCloseTickets(ch, 'open')" class="text-warning" />
              <v-list-item prepend-icon="mdi-archive-outline"       title="Fechar tickets pendentes" @click="openCloseTickets(ch, 'pending')" class="text-warning" />
              <v-list-item prepend-icon="mdi-archive-cancel-outline" title="Fechar todos os tickets" @click="openCloseTickets(ch, 'all')" class="text-warning" />
              <v-divider class="my-1" />
              <v-list-item prepend-icon="mdi-delete-outline"   title="Excluir canal"           @click="confirmDelete(ch)" class="text-error" />
            </v-list>
          </v-menu>
        </div>

        <!-- Status -->
        <div class="ch-status-row">
          <v-icon icon="mdi-wifi" size="20" :color="ch.status === 'connected' ? '#10B981' : '#6B7C88'" />
          <span class="ch-status-badge" :class="ch.status === 'connected' ? 'badge-connected' : 'badge-disconnected'">
            <span class="badge-dot" />
            {{ ch.status === 'connected' ? 'CONNECTED' : 'DISCONNECTED' }}
          </span>
          <v-progress-circular v-if="refreshing[ch.id]" indeterminate size="14" width="2" color="primary" class="ml-2" />
        </div>

        <!-- Número -->
        <div v-if="ch.phone" class="ch-info-row">
          <v-icon icon="mdi-phone-outline" size="15" class="ch-info-icon" />
          <span class="ch-info-text">{{ ch.phone }}</span>
        </div>

        <!-- Atualizado -->
        <div class="ch-updated">
          Atualizado: {{ formatDate(ch.updated_at || ch.created_at) }}
        </div>

        <!-- Ação principal -->
        <div class="ch-card-actions">
          <button
            v-if="ch.status === 'connected'"
            class="ch-btn ch-btn-disconnect"
            :disabled="!!disconnecting[ch.id]"
            @click="disconnect(ch)"
          >
            <v-icon icon="mdi-link-off" size="15" />
            {{ disconnecting[ch.id] ? 'Desconectando…' : 'Desconectar' }}
          </button>
          <button v-else class="ch-btn ch-btn-connect" @click="openQR(ch)">
            <v-icon icon="mdi-qrcode-scan" size="15" />
            Conectar via QR
          </button>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="ch-empty">
      <v-icon icon="mdi-whatsapp" size="56" color="success" class="ch-empty-icon" />
      <div class="ch-empty-title">Nenhum canal conectado</div>
      <p class="ch-empty-sub">Crie um canal e escaneie o QR Code para conectar seu WhatsApp.</p>
      <button class="ch-btn ch-btn-connect" @click="openNew">
        <v-icon icon="mdi-plus" size="15" />
        Criar primeiro canal
      </button>
    </div>

    </template>

    <!-- ══ Dialogs ══ -->

    <!-- Novo canal -->
    <v-dialog v-model="newDialog" max-width="400">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Novo Canal</v-card-title>
        <v-card-text>
          <v-text-field v-model="newName" label="Ex: Vendas, Suporte, SDR..." @keydown.enter="createChannel" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="newDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="creating" @click="createChannel">Criar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Renomear -->
    <v-dialog v-model="renameDialog" max-width="400">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Renomear Canal</v-card-title>
        <v-card-text>
          <v-text-field v-model="renameName" label="Novo nome" @keydown.enter="doRename" />
          <v-alert v-if="renameError" type="error" variant="tonal" density="compact" :text="renameError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="renameDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="doRename">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Fechar tickets -->
    <v-dialog v-model="closeTicketsDialog" max-width="420">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Fechar tickets</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-2" style="color:#9FB0BC">
            Isso irá encerrar
            <strong>
              {{ closeTicketsStatus === 'open' ? 'todos os tickets abertos'
                : closeTicketsStatus === 'pending' ? 'todos os tickets pendentes'
                : 'todos os tickets abertos e pendentes' }}
            </strong>
            do tenant. Esta ação não pode ser desfeita.
          </p>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="closeTicketsDialog = false">Cancelar</v-btn>
          <v-btn color="warning" :loading="saving" @click="doCloseTickets">Confirmar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- QR Code -->
    <v-dialog v-model="qrDialog" max-width="360">
      <v-card class="glass pa-6 text-center" border>
        <div class="text-h6 font-weight-bold mb-1">{{ activeChannel?.name }}</div>
        <div class="text-body-2 mb-5" style="color:#9FB0BC">Escaneie o QR Code com o WhatsApp</div>

        <div v-if="qrLoading" class="py-8 d-flex justify-center">
          <v-progress-circular indeterminate color="primary" size="48" />
        </div>
        <div v-else-if="qrBase64">
          <img :src="qrBase64" alt="QR Code" class="rounded-xl mx-auto d-block mb-3" style="width:220px;height:220px;background:white;padding:8px" />
          <div class="d-flex align-center justify-center ga-3 mb-1">
            <v-progress-linear :model-value="(countdown / QR_TTL) * 100" color="primary" rounded height="6" style="max-width:160px" bg-color="rgba(255,255,255,0.06)" />
            <span class="text-body-2 font-weight-bold" :style="countdown <= 10 ? 'color:#EF4444' : 'color:#9FB0BC'">{{ countdown }}s</span>
          </div>
          <div class="text-caption mb-3" style="color:#9FB0BC">QR atualiza automaticamente</div>
        </div>
        <div v-else class="py-6">
          <v-icon icon="mdi-alert-circle-outline" color="warning" size="48" class="mb-3" />
          <p class="text-body-2 mb-3" style="color:#9FB0BC">Não foi possível gerar o QR Code.</p>
          <v-btn variant="text" size="small" @click="fetchQR">Tentar novamente</v-btn>
        </div>

        <v-alert v-if="justConnected" type="success" variant="tonal" density="compact" text="WhatsApp conectado com sucesso!" class="mb-3 text-left" />
        <v-btn variant="text" block @click="closeQR">Fechar</v-btn>
      </v-card>
    </v-dialog>

    <!-- Excluir -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Excluir canal</v-card-title>
        <v-card-text>Tem certeza que deseja excluir <strong>{{ deleteTarget?.name }}</strong>? O número será desconectado permanentemente.</v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" :loading="deleting" @click="deleteChannel">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Configurar Canal -->
    <v-dialog v-model="settingsDialog" max-width="540" scrollable>
      <v-card class="glass" border>
        <v-card-title class="text-h6 font-weight-bold pa-4 pb-2">
          <v-icon icon="mdi-cog-outline" class="mr-2" size="20" />
          Configurar — {{ settingsTarget?.name }}
        </v-card-title>

        <v-divider />

        <v-card-text class="pa-4" style="max-height:70vh">

          <!-- Nome -->
          <div class="cfg-section-title">Geral</div>
          <v-text-field
            v-model="cfg.name"
            label="Nome do canal"
            variant="outlined"
            density="compact"
            class="mb-4"
          />

          <!-- Despedida -->
          <div class="cfg-section-title">Mensagem de Despedida</div>
          <v-textarea
            v-model="cfg.goodbye_message"
            label="Mensagem enviada ao finalizar o atendimento"
            variant="outlined"
            density="compact"
            rows="2"
            auto-grow
            placeholder="Foi um prazer atendê-lo! Qualquer dúvida, estamos à disposição."
            class="mb-4"
          />

          <!-- Atribuição -->
          <div class="cfg-section-title">Atribuição Automática</div>
          <p class="text-caption mb-3" style="color:var(--text-muted)">
            Novos leads neste canal serão automaticamente atribuídos ao usuário ou fila selecionada.
          </p>
          <v-radio-group v-model="cfg.assignType" inline hide-details class="mb-3">
            <v-radio label="Nenhuma" value="none" color="primary" />
            <v-radio label="Usuário" value="user" color="primary" />
            <v-radio label="Fila" value="queue" color="primary" />
          </v-radio-group>

          <v-expand-transition>
            <v-select
              v-if="cfg.assignType === 'user'"
              v-model="cfg.assigned_user_id"
              :items="settingsUsers"
              item-title="name"
              item-value="id"
              label="Selecionar usuário"
              variant="outlined"
              density="compact"
              clearable
              class="mb-4"
            />
          </v-expand-transition>
          <v-expand-transition>
            <v-select
              v-if="cfg.assignType === 'queue'"
              v-model="cfg.assigned_queue_id"
              :items="settingsQueues"
              item-title="name"
              item-value="id"
              label="Selecionar fila"
              variant="outlined"
              density="compact"
              clearable
              class="mb-4"
            />
          </v-expand-transition>

          <!-- Chatbot -->
          <div class="cfg-section-title">Chatbot</div>
          <p class="text-caption mb-3" style="color:var(--text-muted)">
            Selecione qual fluxo de chatbot será ativado automaticamente neste canal quando não houver palavra-gatilho configurada.
          </p>
          <v-select
            v-model="cfg.flow_id"
            :items="settingsFlows"
            item-title="name"
            item-value="id"
            label="Fluxo de chatbot (opcional)"
            variant="outlined"
            density="compact"
            clearable
            class="mb-4"
            :hint="cfg.flow_id ? 'Qualquer mensagem neste canal ativará o fluxo selecionado.' : 'Nenhum chatbot ativo para este canal.'"
            persistent-hint
          >
            <template #item="{ item, props }">
              <v-list-item v-bind="props">
                <template #append>
                  <v-chip :color="item.raw.status === 'active' ? 'success' : 'default'" size="x-small" variant="tonal">
                    {{ item.raw.status === 'active' ? 'Ativo' : 'Inativo' }}
                  </v-chip>
                </template>
              </v-list-item>
            </template>
          </v-select>

          <v-alert v-if="settingsError" type="error" variant="tonal" density="compact" :text="settingsError" class="mt-1" />
        </v-card-text>

        <v-divider />
        <v-card-actions class="px-4 py-3">
          <v-spacer />
          <v-btn variant="text" @click="settingsDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="savingSettings" @click="saveSettings">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3500">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { api, http } from '@/services/api'
import { channelNameSchema, channelSettingsSchema } from '@/schemas/channels'
import { validateForm } from '@/composables/useZodValidation'

const QR_TTL = 45

// ── estado principal ──
const channels    = ref([])
const loading     = ref(true)
const loadError   = ref('')
const refreshing  = reactive({})
const disconnecting = reactive({})
const saving      = ref(false)
const deleting    = ref(false)
const creating    = ref(false)

const snack = reactive({ show: false, text: '', color: 'success' })
function toast(text, color = 'success') { snack.text = text; snack.color = color; snack.show = true }

// ── ordenação ──
const sortBy = ref('default')
const sortOptions = [
  { title: 'Padrão primeiro',  value: 'default' },
  { title: 'A – Z',            value: 'az' },
  { title: 'Z – A',            value: 'za' },
  { title: 'Conectados',       value: 'connected' },
  { title: 'Desconectados',    value: 'disconnected' },
]
const sortedChannels = computed(() => {
  const list = [...channels.value]
  if (sortBy.value === 'az')           return list.sort((a, b) => a.name.localeCompare(b.name))
  if (sortBy.value === 'za')           return list.sort((a, b) => b.name.localeCompare(a.name))
  if (sortBy.value === 'connected')    return list.sort((a) => a.status === 'connected' ? -1 : 1)
  if (sortBy.value === 'disconnected') return list.sort((a) => a.status !== 'connected' ? -1 : 1)
  return list.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
})

// ── novo canal ──
const newDialog = ref(false)
const newName   = ref('')
function openNew() { newName.value = ''; newDialog.value = true }
async function createChannel() {
  const check = validateForm(channelNameSchema, { name: newName.value })
  if (!check.success) return
  creating.value = true
  try {
    const ch = await api.createChannel(check.data.name)
    channels.value.unshift(ch)
    newDialog.value = false
    toast('Canal criado! Agora conecte o WhatsApp.')
    openQR(ch)
  } catch (e) { toast(e.message, 'error') } finally { creating.value = false }
}

// ── renomear ──
const renameDialog  = ref(false)
const renameTarget  = ref(null)
const renameName    = ref('')
const renameError   = ref('')
function openRename(ch) { renameTarget.value = ch; renameName.value = ch.name; renameError.value = ''; renameDialog.value = true }
async function doRename() {
  renameError.value = ''
  const check = validateForm(channelNameSchema, { name: renameName.value })
  if (!check.success) { renameError.value = check.error; return }
  saving.value = true
  try {
    const updated = await api.renameChannel(renameTarget.value.id, check.data.name)
    const idx = channels.value.findIndex((c) => c.id === renameTarget.value.id)
    if (idx !== -1) channels.value[idx] = { ...channels.value[idx], ...updated }
    renameDialog.value = false
    toast('Canal renomeado.')
  } catch (e) { renameError.value = e.message } finally { saving.value = false }
}

// ── definir padrão ──
async function setDefault(ch) {
  try {
    await api.setDefaultChannel(ch.id)
    channels.value = channels.value.map((c) => ({ ...c, is_default: c.id === ch.id }))
    toast(`"${ch.name}" definido como canal padrão.`)
  } catch (e) { toast(e.message, 'error') }
}

// ── fechar tickets ──
const closeTicketsDialog = ref(false)
const closeTicketsTarget = ref(null)
const closeTicketsStatus = ref('open')
function openCloseTickets(ch, status) { closeTicketsTarget.value = ch; closeTicketsStatus.value = status; closeTicketsDialog.value = true }
async function doCloseTickets() {
  saving.value = true
  try {
    const { closed } = await api.closeChannelTickets(closeTicketsTarget.value.id, closeTicketsStatus.value)
    closeTicketsDialog.value = false
    toast(`${closed ?? 0} ticket(s) encerrado(s).`)
  } catch (e) { toast(e.message, 'error') } finally { saving.value = false }
}

// ── revalidar webhook ──
async function revalidateWebhook(ch) {
  try {
    const data = await api.revalidateChannelWebhook(ch.id)
    toast(`Webhook revalidado: ${data.webhookUrl}`)
  } catch (e) { toast(e.message, 'error') }
}

// ── status / desconectar ──
async function refreshStatus(ch, silent = false) {
  refreshing[ch.id] = true
  try {
    const data = await api.getChannelStatus(ch.id)
    const idx = channels.value.findIndex((c) => c.id === ch.id)
    if (idx !== -1) channels.value[idx] = { ...channels.value[idx], status: data.status, phone: data.phone || channels.value[idx].phone }
    if (!silent && data.status === 'connected') toast('Canal conectado!')
    if (!silent && data.status !== 'connected') toast('Canal ainda não conectado.', 'warning')
  } catch (e) { if (!silent) toast(e.message, 'error') }
  finally { refreshing[ch.id] = false }
}

async function disconnect(ch) {
  disconnecting[ch.id] = true
  try {
    await api.disconnectChannel(ch.id)
    const idx = channels.value.findIndex((c) => c.id === ch.id)
    if (idx !== -1) channels.value[idx] = { ...channels.value[idx], status: 'disconnected', phone: null }
    toast('Canal desconectado.')
  } catch (e) { toast(e.message, 'error') }
  finally { disconnecting[ch.id] = false }
}

// ── QR Code ──
const qrDialog     = ref(false)
const qrLoading    = ref(false)
const qrBase64     = ref(null)
const countdown    = ref(QR_TTL)
const justConnected = ref(false)
const activeChannel = ref(null)
let qrTimer = null; let pollTimer = null; let countTimer = null

function openQR(ch) { activeChannel.value = ch; justConnected.value = false; qrBase64.value = null; qrDialog.value = true; fetchQR(); startPoll() }
async function fetchQR() {
  if (!activeChannel.value) return
  qrLoading.value = true; qrBase64.value = null; clearInterval(countTimer)
  try {
    const data = await api.getChannelQR(activeChannel.value.id)
    qrBase64.value = data.qr; countdown.value = QR_TTL; startCountdown()
  } catch { qrBase64.value = null } finally { qrLoading.value = false }
  clearTimeout(qrTimer); qrTimer = setTimeout(fetchQR, QR_TTL * 1000)
}
function startCountdown() { clearInterval(countTimer); countTimer = setInterval(() => { countdown.value--; if (countdown.value <= 0) clearInterval(countTimer) }, 1000) }
function startPoll() {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    if (!activeChannel.value) return
    try {
      const data = await api.getChannelStatus(activeChannel.value.id)
      if (data.status === 'connected') {
        justConnected.value = true
        clearInterval(pollTimer); clearTimeout(qrTimer); clearInterval(countTimer); qrBase64.value = null
        const idx = channels.value.findIndex((c) => c.id === activeChannel.value.id)
        if (idx !== -1) channels.value[idx] = { ...channels.value[idx], status: 'connected', phone: data.phone }
        setTimeout(() => { qrDialog.value = false }, 2500)
      }
    } catch { /* */ }
  }, 3000)
}
function closeQR() { clearTimeout(qrTimer); clearInterval(pollTimer); clearInterval(countTimer); qrDialog.value = false; activeChannel.value = null; qrBase64.value = null; load() }

// ── excluir ──
const deleteDialog = ref(false)
const deleteTarget = ref(null)
function confirmDelete(ch) { deleteTarget.value = ch; deleteDialog.value = true }
async function deleteChannel() {
  deleting.value = true
  try {
    await api.deleteChannel(deleteTarget.value.id)
    channels.value = channels.value.filter((c) => c.id !== deleteTarget.value.id)
    deleteDialog.value = false; toast('Canal removido.')
  } catch (e) { toast(e.message, 'error') } finally { deleting.value = false }
}

// ── configurar ──
const settingsDialog  = ref(false)
const settingsTarget  = ref(null)
const savingSettings  = ref(false)
const settingsError   = ref('')
const settingsUsers   = ref([])
const settingsQueues  = ref([])
const settingsFlows   = ref([])
const cfg = reactive({
  name: '',
  goodbye_message: '',
  assignType: 'none',
  assigned_user_id: null,
  assigned_queue_id: null,
  flow_id: null,
})

async function openSettings(ch) {
  settingsTarget.value  = ch
  settingsError.value   = ''
  cfg.name              = ch.name || ''
  cfg.goodbye_message   = ch.goodbye_message || ''
  cfg.assigned_user_id  = ch.assigned_user_id || null
  cfg.assigned_queue_id = ch.assigned_queue_id || null
  cfg.assignType = ch.assigned_queue_id ? 'queue' : ch.assigned_user_id ? 'user' : 'none'
  cfg.flow_id    = null
  settingsDialog.value  = true

  try {
    const [ops, queuesData, flowsData] = await Promise.all([
      api.listOperators(),
      api.listQueues(),
      http.get('/flows').then(r => r.data.flows || []),
    ])
    settingsUsers.value  = ops.operators || ops || []
    settingsQueues.value = queuesData.queues || queuesData || []
    settingsFlows.value  = flowsData

    // Pré-seleciona o fluxo já vinculado a este canal (sem keywords = chatbot padrão)
    const linked = flowsData.find(f => f.channel_id === ch.id && !f.trigger_keywords?.length)
    cfg.flow_id = linked?.id || null
  } catch { /* ignora */ }
}

async function saveSettings() {
  settingsError.value = ''
  const check = validateForm(channelSettingsSchema, {
    name: cfg.name,
    goodbye_message: cfg.goodbye_message,
    assigned_user_id: cfg.assignType === 'user' ? cfg.assigned_user_id : null,
    assigned_queue_id: cfg.assignType === 'queue' ? cfg.assigned_queue_id : null,
  })
  if (!check.success) { settingsError.value = check.error; return }
  savingSettings.value = true
  try {
    const channelId = settingsTarget.value.id

    // Salva configurações do canal
    const payload = check.data
    const { channel } = await api.updateChannelSettings(channelId, payload)
    const idx = channels.value.findIndex((c) => c.id === channelId)
    if (idx !== -1) channels.value[idx] = { ...channels.value[idx], ...channel }

    // Gerencia vínculo de fluxo
    const previousLinked = settingsFlows.value.find(
      f => f.channel_id === channelId && !f.trigger_keywords?.length
    )

    if (cfg.flow_id) {
      // Vincula o fluxo selecionado a este canal
      await http.patch(`/flows/${cfg.flow_id}`, { channel_id: channelId })
      // Remove vínculo do fluxo anterior (se for diferente)
      if (previousLinked && previousLinked.id !== cfg.flow_id) {
        await http.patch(`/flows/${previousLinked.id}`, { channel_id: null })
      }
    } else if (previousLinked) {
      // Usuário limpou a seleção — desvincula o fluxo anterior
      await http.patch(`/flows/${previousLinked.id}`, { channel_id: null })
    }

    settingsDialog.value = false
    toast('Configurações salvas.')
  } catch (e) { settingsError.value = e.message } finally { savingSettings.value = false }
}

// ── formatos ──
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── init ──
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    channels.value = await api.listChannels()
  } catch (e) {
    loadError.value = e.message
    toast(e.message, 'error')
  } finally {
    loading.value = false
  }
}
onMounted(load)
onUnmounted(() => { clearTimeout(qrTimer); clearInterval(pollTimer); clearInterval(countTimer) })
</script>

<style scoped>
.ch-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 24px; gap: 12px; flex-wrap: wrap;
}
.ch-title { font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0 0 4px; }
.ch-sub   { font-size: 13px; color: var(--text-muted); margin: 0; }

.ch-new-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 18px; border-radius: 10px;
  background: linear-gradient(135deg,#6366F1,#8B5CF6);
  border: none; cursor: pointer;
  font-size: 13px; font-weight: 600; color: white;
  white-space: nowrap; transition: opacity .15s;
}
.ch-new-btn:hover { opacity: .88; }

.cfg-section-title {
  font-size: 11px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 10px; margin-top: 4px;
  display: flex; align-items: center; gap: 8px;
}

/* Grid */
.ch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

/* Card */
.ch-card {
  background: var(--panel-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 18px 18px 16px;
  display: flex; flex-direction: column; gap: 12px;
  transition: border-color .15s;
}
.ch-card:hover { border-color: var(--border-medium); }
.ch-card--default { border-color: rgba(99,102,241,0.3); }

/* Topo */
.ch-card-top { display: flex; align-items: flex-start; gap: 12px; }

.ch-wa-icon {
  width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
  background: #25D366;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 14px rgba(37,211,102,0.28);
}

.ch-card-name-wrap { flex: 1; min-width: 0; }
.ch-card-name {
  font-size: 15px; font-weight: 700; color: var(--text-primary);
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
}
.ch-default-badge {
  font-size: 9px; font-weight: 700; letter-spacing: .5px;
  padding: 2px 7px; border-radius: 20px;
  background: rgba(99,102,241,0.15); color: #818CF8;
  text-transform: uppercase;
}
.ch-card-slug { font-size: 11px; color: var(--text-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ch-menu-btn {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); transition: background .12s;
}
.ch-menu-btn:hover { background: var(--panel-hover); }

/* Status */
.ch-status-row { display: flex; align-items: center; gap: 8px; }
.ch-status-badge {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 700; letter-spacing: .5px;
  padding: 3px 10px; border-radius: 20px;
}
.badge-connected    { background: rgba(16,185,129,0.12); color: #10B981; }
.badge-disconnected { background: rgba(100,116,139,0.12); color: #64748B; }
.badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.badge-connected .badge-dot { box-shadow: 0 0 5px #10B981; }

/* Info */
.ch-info-row { display: flex; align-items: center; gap: 8px; }
.ch-info-icon { color: var(--text-faint); flex-shrink: 0; }
.ch-info-text { font-size: 13px; color: var(--text-secondary); }

.ch-updated { font-size: 11px; color: var(--text-faint); padding-top: 4px; border-top: 1px solid var(--border-subtle); }

/* Botões */
.ch-card-actions { margin-top: 2px; }
.ch-btn {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; padding: 10px 16px; border-radius: 10px;
  border: none; cursor: pointer; font-size: 13px; font-weight: 600;
  transition: opacity .15s, filter .15s;
}
.ch-btn:disabled { opacity: .5; cursor: not-allowed; }
.ch-btn:not(:disabled):hover { filter: brightness(1.08); }

.ch-btn-disconnect {
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.18);
  color: #F87171;
}
.ch-btn-connect {
  background: linear-gradient(135deg,#6366F1,#8B5CF6);
  color: white;
}

/* Empty */
.ch-empty {
  display: flex; flex-direction: column; align-items: center;
  padding: 64px 24px; text-align: center;
  background: var(--panel-bg); border: 1px solid var(--border-subtle); border-radius: 16px;
}
.ch-empty-icon  { opacity: .2; margin-bottom: 16px; }
.ch-empty-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.ch-empty-sub   { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; max-width: 340px; }

.gap-2 { gap: 8px; }
</style>
