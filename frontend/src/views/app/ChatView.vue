<template>
  <div class="chat-layout">
    <!-- ———————— SIDEBAR ———————— -->
    <div class="chat-sidebar">
      <div class="sidebar-header px-3 pt-3 pb-2">
        <div class="d-flex align-center justify-space-between mb-3">
          <span class="text-subtitle-1 font-weight-bold">Atendimentos</span>
          <div class="d-flex ga-1">
            <v-btn icon size="small" variant="text" :loading="loading" @click="loadConvs">
              <v-icon icon="mdi-refresh" size="17" />
            </v-btn>
            <v-btn icon size="small" variant="text" @click="showFilters = !showFilters">
              <v-badge v-if="activeFiltersCount" :content="activeFiltersCount" color="primary" floating>
                <v-icon icon="mdi-filter-outline" size="17" />
              </v-badge>
              <v-icon v-else icon="mdi-filter-outline" size="17" />
            </v-btn>
            <v-btn icon size="small" variant="text" color="primary" @click="startDialog = true">
              <v-tooltip activator="parent" location="bottom">Iniciar conversa avulsa</v-tooltip>
              <v-icon icon="mdi-message-plus-outline" size="17" />
            </v-btn>
          </div>
        </div>

        <v-text-field
          v-model="search"
          placeholder="Buscar nome, número ou ticket..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          class="mb-2"
        />

        <div v-if="showFilters" class="filter-panel mb-2">
          <v-select v-model="filterStage" :items="stageOptions" label="Estágio Kanban" variant="outlined" density="compact" hide-details clearable class="mb-2" />
          <v-select v-model="filterOperator" :items="operatorOptions" item-title="label" item-value="id" label="Operador" variant="outlined" density="compact" hide-details clearable />
        </div>

        <div v-if="filterStage || filterOperator" class="d-flex flex-wrap ga-1 mb-2">
          <v-chip v-if="filterStage" size="x-small" closable color="primary" variant="tonal" @click:close="filterStage = null">{{ filterStage }}</v-chip>
          <v-chip v-if="filterOperator" size="x-small" closable color="primary" variant="tonal" @click:close="filterOperator = null">
            {{ operatorOptions.find(o => o.id === filterOperator)?.label }}
          </v-chip>
        </div>
      </div>

      <div class="sidebar-tabs">
        <button v-for="tab in tabs" :key="tab.key" class="tab-btn" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
          <v-icon :icon="tab.icon" size="13" class="mr-1" />
          {{ tab.label }}
          <span v-if="tabCount(tab.key)" class="tab-badge" :class="tab.key">{{ tabCount(tab.key) }}</span>
        </button>
      </div>

      <div class="sidebar-list">
        <div
          v-for="conv in filteredConvs" :key="conv.id"
          class="conv-item"
          :class="{ active: currentLead?.id === conv.id, unread: conv.unread }"
          @click="selectLead(conv)"
        >
          <div class="status-dot" :class="convStatusColor(conv)" />
          <div class="relative">
            <div class="conv-avatar" :style="{ background: avatarColor(conv) }">{{ (conv.name || conv.phone).slice(0, 2).toUpperCase() }}</div>
            <div v-if="conv.unread" class="unread-badge">{{ conv.unread > 9 ? '9+' : conv.unread }}</div>
          </div>
          <div class="conv-body">
            <div class="conv-row1">
              <span class="conv-name">{{ conv.name || conv.phone }}</span>
              <span class="conv-ticket">#{{ ticketNum(conv.id) }}</span>
              <span class="conv-time">{{ msgTimeAgo(conv.lastMessage?.created_at || conv.updated_at) }}</span>
            </div>
            <div class="conv-last">{{ conv.lastMessage?.text || 'Sem mensagens' }}</div>
            <div class="conv-row3">
              <v-chip v-if="conv.stage" size="x-small" variant="tonal" :color="stageColor(conv.stage)" class="conv-tag">{{ conv.stage }}</v-chip>
              <v-chip v-if="channelLabel(conv)" size="x-small" variant="tonal" color="success" class="conv-tag">
                <v-icon icon="mdi-whatsapp" size="10" class="mr-1" />{{ channelLabel(conv) }}
              </v-chip>
              <v-spacer />
              <v-btn v-if="conv.conversation_status === 'open'" size="x-small" color="error" variant="tonal" class="quick-btn" @click.stop="quickResolve(conv)">
                <v-icon icon="mdi-check" size="12" />
              </v-btn>
              <v-btn v-else-if="conv.conversation_status === 'pending'" size="x-small" color="primary" variant="tonal" class="quick-btn" @click.stop="quickAttend(conv)">
                <v-icon icon="mdi-play" size="12" />
              </v-btn>
            </div>
          </div>
        </div>

        <div v-if="!filteredConvs.length" class="text-center pa-8" style="color:#6B7C88;font-size:13px">
          <v-icon icon="mdi-chat-outline" size="40" style="color:#3A4A55" class="d-block mx-auto mb-2" />
          Nenhuma conversa encontrada
        </div>
      </div>
    </div>

    <!-- ———————— ÁREA DE CHAT ———————— -->
    <div class="chat-area">
      <div v-if="!currentLead" class="chat-empty">
        <v-icon icon="mdi-chat-processing-outline" size="72" style="color:#2A3A45;opacity:.6" />
        <p class="mt-4 text-body-2" style="color:#6B7C88">Selecione um atendimento</p>
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-message-plus-outline" class="mt-3" @click="startDialog = true">
          Iniciar conversa avulsa
        </v-btn>
      </div>

      <template v-else>
        <!-- ——— Header do chat ——— -->
        <div class="chat-header">
          <!-- Linha 1: info do contato + status -->
          <div class="d-flex align-center justify-space-between flex-wrap ga-2 w-100">
            <div class="d-flex align-center ga-3">
              <div class="header-avatar" :style="{ background: avatarColor(currentLead) }">
                {{ (currentLead.name || currentLead.phone).slice(0, 2).toUpperCase() }}
              </div>
              <div>
                <div class="d-flex align-center ga-2">
                  <span class="text-subtitle-2 font-weight-bold">{{ currentLead.name || currentLead.phone }}</span>
                  <span class="text-caption" style="color:#6B7C88">#{{ ticketNum(currentLead.id) }}</span>
                </div>
                <div class="d-flex align-center ga-1 mt-1">
                  <v-chip size="x-small" :color="stageColor(currentLead.stage)" variant="tonal">{{ currentLead.stage }}</v-chip>
                  <span class="text-caption" style="color:#6B7C88">{{ currentLead.phone }}</span>
                </div>
              </div>
            </div>

            <!-- Botões de status -->
            <div class="d-flex align-center ga-2 flex-wrap">
              <v-btn v-if="currentLead.conversation_status === 'pending'" color="primary" size="small" variant="tonal" prepend-icon="mdi-account-check" :loading="statusLoading" @click="attendLead">Atender</v-btn>
              <v-btn v-if="currentLead.conversation_status === 'open'" color="error" size="small" variant="tonal" prepend-icon="mdi-check-circle-outline" :loading="statusLoading" @click="resolveLead">Finalizar</v-btn>
              <v-btn v-if="currentLead.conversation_status === 'resolved'" color="warning" size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="statusLoading" @click="reopenLead">Reabrir</v-btn>
              <v-divider vertical class="mx-1" style="height:24px" />
              <v-tooltip :text="currentLead.human_takeover ? 'Devolver para IA' : 'Assumir atendimento'">
                <template #activator="{ props }">
                  <v-btn v-bind="props" :color="currentLead.human_takeover ? 'warning' : 'secondary'" size="small" variant="tonal" :prepend-icon="currentLead.human_takeover ? 'mdi-robot-off' : 'mdi-robot'" @click="toggleTransfer(!currentLead.human_takeover)">
                    {{ currentLead.human_takeover ? 'Humano' : 'IA' }}
                  </v-btn>
                </template>
              </v-tooltip>
            </div>
          </div>

          <!-- Linha 2: barra de acesso rápido -->
          <div class="quick-action-bar">
            <!-- Retornar à Fila -->
            <v-tooltip text="Retornar à Fila (Pendentes)" location="bottom">
              <template #activator="{ props }">
                <button v-bind="props" class="qa-btn" :disabled="currentLead.conversation_status !== 'open' || returningToQueue" @click="returnToQueue">
                  <v-progress-circular v-if="returningToQueue" size="14" width="2" indeterminate />
                  <v-icon v-else icon="mdi-arrow-left-circle-outline" size="17" />
                  <span>Retornar Fila</span>
                </button>
              </template>
            </v-tooltip>

            <div class="qa-divider" />

            <!-- Resolver -->
            <v-tooltip text="Resolver / Finalizar" location="bottom">
              <template #activator="{ props }">
                <button v-bind="props" class="qa-btn success" :disabled="currentLead.conversation_status === 'resolved' || statusLoading" @click="resolveLead">
                  <v-icon icon="mdi-check-circle-outline" size="17" />
                  <span>Resolver</span>
                </button>
              </template>
            </v-tooltip>

            <div class="qa-divider" />

            <!-- Transferir para Chatbot -->
            <v-tooltip :text="currentLead.human_takeover ? 'Devolver para Chatbot (IA)' : 'IA já ativa'" location="bottom">
              <template #activator="{ props }">
                <button v-bind="props" class="qa-btn" :class="{ active: !currentLead.human_takeover }" @click="toggleTransfer(!currentLead.human_takeover)">
                  <v-icon :icon="currentLead.human_takeover ? 'mdi-robot-outline' : 'mdi-robot'" size="17" />
                  <span>{{ currentLead.human_takeover ? 'Chatbot' : 'IA Ativa' }}</span>
                </button>
              </template>
            </v-tooltip>

            <div class="qa-divider" />

            <!-- Buscar nas mensagens -->
            <v-tooltip text="Buscar nas mensagens" location="bottom">
              <template #activator="{ props }">
                <button v-bind="props" class="qa-btn" :class="{ active: showMsgSearch }" @click="toggleMsgSearch">
                  <v-icon icon="mdi-magnify" size="17" />
                  <span>Buscar</span>
                  <v-chip v-if="msgSearchQuery && msgSearchResults > 0" size="x-small" color="primary" class="ml-1">{{ msgSearchResults }}</v-chip>
                </button>
              </template>
            </v-tooltip>

            <div class="qa-divider" />

            <!-- Ver detalhes do contato -->
            <v-tooltip text="Detalhes do contato" location="bottom">
              <template #activator="{ props }">
                <button v-bind="props" class="qa-btn" :class="{ active: showContactPanel }" @click="showContactPanel = !showContactPanel">
                  <v-icon icon="mdi-account-details-outline" size="17" />
                  <span>Contato</span>
                </button>
              </template>
            </v-tooltip>

          </div>

          <!-- Barra de busca de mensagens (expansível) -->
          <div v-if="showMsgSearch" class="msg-search-bar">
            <v-text-field
              v-model="msgSearchQuery"
              placeholder="Buscar no histórico..."
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              autofocus
              class="flex-1"
              @keydown.escape="closeMsgSearch"
            />
            <span class="text-caption ml-2 flex-shrink-0" style="color:#9FB0BC">
              {{ msgSearchQuery ? `${msgSearchResults} resultado(s)` : 'Digite para buscar' }}
            </span>
            <v-btn icon size="small" variant="text" @click="closeMsgSearch"><v-icon icon="mdi-close" size="16" /></v-btn>
          </div>
        </div>

        <!-- ——— Corpo: mensagens + painel de contato ——— -->
        <div class="chat-body">
          <!-- Mensagens -->
          <div ref="messagesEl" class="chat-messages" @scroll="onScroll">
            <div v-if="loadingMore" class="text-center py-3"><v-progress-circular size="20" indeterminate color="primary" /></div>

            <template v-for="msg in displayedMessages" :key="msg.id">
              <div
                class="msg-wrapper"
                :class="[msg.role, { 'msg-highlight': msgSearchQuery && msg.text?.toLowerCase().includes(msgSearchQuery.toLowerCase()) }]"
              >
                <div class="msg-bubble" :class="msg.role">
                  <div v-if="msg.role === 'agent' || msg.role === 'ai'" class="msg-role-badge">
                    {{ msg.role === 'ai' ? '⬦ IA' : '⬦ Agente' }}
                  </div>
                  <div class="msg-text">{{ msg.text }}</div>
                  <div class="msg-time">{{ formatTime(msg.created_at) }}</div>
                </div>
              </div>
            </template>

            <!-- Empty state de busca -->
            <div v-if="msgSearchQuery && msgSearchResults === 0" class="text-center py-8" style="color:#6B7C88;font-size:13px">
              Nenhuma mensagem encontrada para "{{ msgSearchQuery }}"
            </div>

            <div v-if="typing" class="msg-wrapper ai">
              <div class="msg-bubble ai typing-indicator"><span /><span /><span /></div>
            </div>
          </div>

          <!-- Painel de detalhes do contato -->
          <div v-if="showContactPanel" class="contact-panel">
            <div class="contact-panel-header">
              <span class="text-subtitle-2 font-weight-bold">Detalhes do Contato</span>
              <v-btn icon size="x-small" variant="text" @click="showContactPanel = false"><v-icon icon="mdi-close" size="16" /></v-btn>
            </div>

            <div class="contact-panel-body">
              <!-- Avatar + Nome -->
              <div class="text-center mb-4">
                <div class="contact-big-avatar mx-auto mb-2" :style="{ background: avatarColor(currentLead) }">
                  {{ (currentLead.name || currentLead.phone).slice(0, 2).toUpperCase() }}
                </div>
                <div class="text-body-2 font-weight-bold">{{ currentLead.name || '—' }}</div>
                <div class="text-caption" style="color:#9FB0BC">{{ currentLead.phone }}</div>
              </div>

              <!-- Infos -->
              <div class="contact-info-list">
                <div class="contact-info-row">
                  <v-icon icon="mdi-ticket-outline" size="15" style="color:#9FB0BC" />
                  <span>Ticket</span>
                  <span class="ml-auto font-mono" style="color:#9FB0BC">#{{ ticketNum(currentLead.id) }}</span>
                </div>
                <div class="contact-info-row">
                  <v-icon icon="mdi-view-column-outline" size="15" style="color:#9FB0BC" />
                  <span>Estágio</span>
                  <v-chip class="ml-auto" :color="stageColor(currentLead.stage)" variant="tonal" size="x-small">{{ currentLead.stage || '—' }}</v-chip>
                </div>
                <div v-if="currentLead.score != null" class="contact-info-row">
                  <v-icon icon="mdi-star-outline" size="15" style="color:#9FB0BC" />
                  <span>Score</span>
                  <v-chip class="ml-auto" :color="scoreColor(currentLead.score)" variant="tonal" size="x-small">{{ currentLead.score }}/100</v-chip>
                </div>
                <div class="contact-info-row">
                  <v-icon icon="mdi-robot-outline" size="15" style="color:#9FB0BC" />
                  <span>Modo</span>
                  <v-chip class="ml-auto" :color="currentLead.human_takeover ? 'warning' : 'success'" variant="tonal" size="x-small">
                    {{ currentLead.human_takeover ? 'Humano' : 'IA' }}
                  </v-chip>
                </div>
                <div class="contact-info-row">
                  <v-icon icon="mdi-chat-processing-outline" size="15" style="color:#9FB0BC" />
                  <span>Status</span>
                  <v-chip class="ml-auto" :color="statusColor(currentLead.conversation_status)" variant="tonal" size="x-small">
                    {{ statusLabel(currentLead.conversation_status) }}
                  </v-chip>
                </div>
                <div v-if="currentLead.intention" class="contact-info-row">
                  <v-icon icon="mdi-lightbulb-outline" size="15" style="color:#9FB0BC" />
                  <span>Intenção</span>
                </div>
                <div v-if="currentLead.intention" class="contact-intention">{{ currentLead.intention }}</div>
              </div>

              <!-- Etiquetas -->
              <div v-if="currentLead.tags?.length" class="mt-4">
                <div class="text-caption mb-2" style="color:#9FB0BC;font-weight:600;letter-spacing:.5px">ETIQUETAS</div>
                <div class="d-flex flex-wrap ga-1">
                  <span
                    v-for="tag in currentLead.tags" :key="tag"
                    class="contact-label-chip"
                    :style="{ background: labelColor(tag) + '22', borderColor: labelColor(tag) + '55', color: labelColor(tag) }"
                  >
                    <span class="contact-label-dot" :style="{ background: labelColor(tag) }" />
                    {{ tag }}
                  </span>
                </div>
              </div>

              <!-- Ações rápidas -->
              <div class="mt-4">
                <div class="text-caption mb-2" style="color:#9FB0BC;font-weight:600;letter-spacing:.5px">AÇÕES RÁPIDAS</div>
                <div class="d-flex flex-column ga-2">
                  <v-btn
                    size="small" variant="tonal" color="primary" block
                    prepend-icon="mdi-open-in-new"
                    :href="`/kanban`"
                    @click="showContactPanel = false"
                  >Ver no CRM</v-btn>
                  <v-btn
                    size="small" variant="tonal" block
                    prepend-icon="mdi-arrow-left-circle-outline"
                    :disabled="currentLead.conversation_status !== 'open' || returningToQueue"
                    @click="returnToQueue"
                  >Retornar à Fila</v-btn>
                  <v-btn
                    size="small" variant="tonal" color="success" block
                    :prepend-icon="currentLead.human_takeover ? 'mdi-robot-outline' : 'mdi-robot-off-outline'"
                    @click="toggleTransfer(!currentLead.human_takeover)"
                  >{{ currentLead.human_takeover ? 'Ativar Chatbot' : 'Desativar Chatbot' }}</v-btn>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ——— Input estilo WhatsApp ——— -->
        <div class="wa-bar">

          <!-- Assinatura banner -->
          <div v-if="useSignature && signature" class="wa-signature-banner">
            <v-icon icon="mdi-pen" size="12" style="opacity:.6" />
            <span>{{ signature }}</span>
          </div>

          <!-- Preview de arquivo -->
          <div v-if="attachedFile" class="wa-file-preview">
            <v-icon :icon="fileTypeIcon(attachedFile)" size="18" color="primary" />
            <span class="wa-file-name">{{ attachedFile.name }}</span>
            <span class="wa-file-size">{{ formatFileSize(attachedFile.size) }}</span>
            <button class="wa-file-remove" @click="attachedFile = null">
              <v-icon icon="mdi-close" size="14" />
            </button>
          </div>

          <!-- Emoji picker -->
          <div v-if="showEmojiPicker" class="emoji-picker" @click.stop>
            <div class="emoji-cats">
              <button v-for="(_, cat) in EMOJIS" :key="cat" class="emoji-cat-btn" :class="{ active: emojiCat === cat }" @click="emojiCat = cat">{{ cat }}</button>
            </div>
            <div class="emoji-grid">
              <button v-for="e in EMOJIS[emojiCat]" :key="e" class="emoji-btn" @click="insertEmoji(e)">{{ e }}</button>
            </div>
          </div>

          <!-- Linha principal -->
          <div class="wa-input-row">

            <!-- Input de arquivo oculto -->
            <input ref="fileInputRef" type="file" style="display:none" @change="onFileSelected" />

            <!-- Ações esquerda -->
            <div class="wa-left-actions">
              <button class="wa-icon-btn" :class="{ active: showEmojiPicker }" title="Emojis" @click.stop="showEmojiPicker = !showEmojiPicker">
                <v-icon icon="mdi-emoticon-outline" size="22" />
              </button>
              <button class="wa-icon-btn" title="Anexar arquivo" @click="fileInputRef.click()">
                <v-icon icon="mdi-paperclip" size="22" />
              </button>
              <button class="wa-icon-btn" :class="{ active: useSignature }" title="Assinatura" @click="useSignature = !useSignature">
                <v-icon icon="mdi-pen" size="19" />
              </button>
            </div>

            <!-- Textarea -->
            <textarea
              ref="inputEl"
              v-model="inputText"
              class="wa-textarea"
              placeholder="Digite uma mensagem..."
              rows="1"
              @keydown.enter.exact.prevent="sendOrFile"
              @input="autoResizeInput"
              @click="showEmojiPicker = false"
            />

            <!-- Gravar áudio -->
            <div v-if="audioRecording" class="wa-recording">
              <span class="rec-dot" />
              <span class="rec-time">{{ recordingTime }}</span>
              <button class="wa-icon-btn" title="Cancelar" @click="cancelRecording">
                <v-icon icon="mdi-delete-outline" size="20" color="error" />
              </button>
              <button class="wa-send-btn" title="Enviar áudio" @click="stopAndSendAudio">
                <v-icon icon="mdi-send" size="20" />
              </button>
            </div>

            <!-- Enviar ou Microfone -->
            <template v-else>
              <button v-if="canSend" class="wa-send-btn wa-send-btn--active" :disabled="sending" @click="sendOrFile">
                <v-icon v-if="!sending" icon="mdi-send" size="20" />
                <v-progress-circular v-else size="18" width="2" indeterminate color="white" />
              </button>
              <button v-else class="wa-send-btn wa-send-btn--mic" @click="startRecording">
                <v-icon icon="mdi-microphone" size="20" />
              </button>
            </template>
          </div>
        </div>
      </template>
    </div>

    <!-- Dialog: Iniciar conversa avulsa -->
    <v-dialog v-model="startDialog" max-width="440">
      <v-card class="pa-6">
        <div class="d-flex align-center ga-2 mb-1">
          <v-icon icon="mdi-message-plus-outline" color="primary" />
          <span class="text-h6 font-weight-bold">Iniciar Conversa Avulsa</span>
        </div>
        <div class="text-body-2 mb-4" style="color:#9FB0BC">Envie uma mensagem para qualquer número de WhatsApp.</div>
        <v-text-field v-model="startForm.phone" label="Número WhatsApp (com DDD)" placeholder="5511999999999" variant="outlined" density="compact" class="mb-3" prepend-inner-icon="mdi-whatsapp" />
        <v-text-field v-model="startForm.name" label="Nome do contato (opcional)" variant="outlined" density="compact" class="mb-3" prepend-inner-icon="mdi-account-outline" />
        <v-textarea v-model="startForm.message" label="Primeira mensagem (opcional)" variant="outlined" density="compact" rows="3" prepend-inner-icon="mdi-chat-outline" />
        <div class="d-flex ga-3 justify-end mt-5">
          <v-btn variant="text" @click="startDialog = false; resetStartForm()">Cancelar</v-btn>
          <v-btn color="primary" :loading="starting" :disabled="!startForm.phone" prepend-icon="mdi-send" @click="startConversation">Iniciar</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { api, http } from '@/services/api'
import { useMessageRealtime, useRealtime } from '@/composables/useRealtime'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth  = useAuthStore()

// ——— estado da sidebar ———
const search         = ref('')
const filterStage    = ref(null)
const filterOperator = ref(null)
const showFilters    = ref(false)
const convs          = ref([])
const operators      = ref([])
const loading        = ref(false)
const activeTab      = ref('open')

// ——— estado do chat ———
const messages       = ref([])
const currentLead    = ref(null)
const inputText      = ref('')
const sending        = ref(false)
const loadingMore    = ref(false)
const typing         = ref(false)
const statusLoading  = ref(false)
const messagesEl     = ref(null)
const oldestMsgId    = ref(null)
const openedAt       = reactive({})

// ——— novas funcionalidades ———
const showMsgSearch      = ref(false)
const msgSearchQuery     = ref('')
const showContactPanel   = ref(false)
const returningToQueue   = ref(false)
const availableLabels    = ref([])

// ——— input avançado ———
const inputEl        = ref(null)
const fileInputRef   = ref(null)
const attachedFile   = ref(null)
const showEmojiPicker= ref(false)
const useSignature   = ref(false)
const emojiCat       = ref('😊')
const audioRecording = ref(false)
const recordingTime  = ref('0:00')
let mediaRecorder    = null
let audioChunks      = []
let recTimer         = null

const signature = computed(() => {
  const u = auth.user
  if (!u) return ''
  return u.name || u.email?.split('@')[0] || ''
})
const canSend = computed(() => !!inputText.value.trim() || !!attachedFile.value)

const EMOJIS = {
  '😊': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😋','😎','🤩','🥳','😏','😒','😢','😭','😤','😠','🤬','😈','🤔','🤗','😴','🥺','🫡','😬','🫠'],
  '👋': ['👍','👎','👌','✌️','🤞','🤙','👈','👉','👆','👇','☝️','✊','👊','🙌','👐','🤝','🙏','💪','🖐','👋','🤚','🫶','🫵','🤌','💅'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💓','💗','💖','💘','💝','🔥','✨','💫','⭐','🌟','💥','🎉','🎊','🎁'],
  '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🦁','🐯','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦋','🌸','🌺','🍀','🌈','☀️','🌙'],
  '🍕': ['🍕','🍔','🍟','🌭','🌮','🌯','🥗','🍜','🍣','🍱','🥡','🍩','🍰','🎂','🧁','🍫','🍬','🍭','☕','🧋','🥤','🍺','🥂','🍾'],
  '⚽': ['⚽','🏀','🏈','⚾','🎾','🏸','🏒','⛳','🎯','🎱','🎮','🕹','🎲','🎭','🎨','🎬','🎤','🎧','🎵','🎶','🏆','🥇','🎖','🏅'],
  '🚗': ['🚗','✈️','🚀','🛸','🚂','🚢','🚁','🏍','🚲','⛵','🛺','🏎','🚌','🏠','🏢','🏰','🗼','🗽','🌉','🌃','🌆','🌇','🌌','🎆'],
  '💡': ['💡','🔑','🔒','💎','💰','💳','📱','💻','⌨️','🖥','📷','📺','⌚','📡','🔭','🔬','💊','🩺','📚','📖','✏️','📝','📌','📎'],
}

function insertEmoji(e) { inputText.value += e; inputEl.value?.focus() }

function autoResizeInput() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function onFileSelected(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  if (file.size > 64 * 1024 * 1024) { toast('Arquivo maior que 64 MB.', 'error'); return }
  attachedFile.value = file
  ev.target.value = ''
}

function fileTypeIcon(f) {
  if (!f) return 'mdi-file-outline'
  if (f.type.startsWith('image/')) return 'mdi-file-image-outline'
  if (f.type.startsWith('video/')) return 'mdi-file-video-outline'
  if (f.type.startsWith('audio/')) return 'mdi-file-music-outline'
  if (f.type.includes('pdf'))      return 'mdi-file-pdf-box'
  return 'mdi-file-outline'
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

async function sendOrFile() {
  if (attachedFile.value) return sendFile()
  sendMessage()
}

async function sendFile() {
  if (!attachedFile.value || !currentLead.value) return
  const file = attachedFile.value
  attachedFile.value = null
  sending.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    if (inputText.value.trim()) fd.append('caption', inputText.value.trim())
    const { data } = await http.post(`/chat/${currentLead.value.id}/media`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    messages.value.push(data.message)
    inputText.value = ''
    scrollToBottom()
  } catch (e) { toast(e.message, 'error') } finally { sending.value = false }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder = new MediaRecorder(stream)
    audioChunks = []
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data) }
    mediaRecorder.start()
    audioRecording.value = true
    let secs = 0
    recTimer = setInterval(() => {
      secs++
      recordingTime.value = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    }, 1000)
  } catch { toast('Microfone não disponível.', 'error') }
}

function cancelRecording() {
  mediaRecorder?.stop()
  mediaRecorder?.stream?.getTracks().forEach((t) => t.stop())
  clearInterval(recTimer)
  audioRecording.value = false
  recordingTime.value = '0:00'
  audioChunks = []
}

async function stopAndSendAudio() {
  if (!mediaRecorder) return
  mediaRecorder.onstop = async () => {
    clearInterval(recTimer)
    audioRecording.value = false
    recordingTime.value = '0:00'
    const blob = new Blob(audioChunks, { type: 'audio/webm' })
    audioChunks = []
    if (!currentLead.value) return
    sending.value = true
    try {
      const fd = new FormData()
      fd.append('file', blob, 'audio.webm')
      const { data } = await http.post(`/chat/${currentLead.value.id}/media`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      messages.value.push(data.message)
      scrollToBottom()
    } catch (e) { toast(e.message, 'error') } finally { sending.value = false }
  }
  mediaRecorder.stop()
  mediaRecorder.stream?.getTracks().forEach((t) => t.stop())
}

// ——— dialogs ———
const startDialog = ref(false)
const starting    = ref(false)
const snack       = reactive({ show: false, text: '', color: 'success' })
const startForm   = reactive({ phone: '', name: '', message: '' })

// ——— tabs ———
const tabs = [
  { key: 'open',     label: 'Abertos',   icon: 'mdi-chat-outline' },
  { key: 'pending',  label: 'Pendentes', icon: 'mdi-clock-outline' },
  { key: 'resolved', label: 'Fechados',  icon: 'mdi-check-circle-outline' },
]
const stageOptions = ['Novo Lead', 'Em Qualificação', 'Qualificado', 'Reunião Agendada', 'Vendido', 'Perdido']
const operatorOptions = computed(() => operators.value.map((o) => ({ id: o.id, label: o.name || o.email })))
const activeFiltersCount = computed(() => [filterStage.value, filterOperator.value].filter(Boolean).length)

function tabCount(key) { return convs.value.filter((c) => (c.conversation_status || 'pending') === key).length }

const filteredConvs = computed(() => {
  let list = convs.value.filter((c) => (c.conversation_status || 'pending') === activeTab.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q) || ticketNum(c.id).includes(q))
  }
  if (filterStage.value) list = list.filter((c) => c.stage === filterStage.value)
  if (filterOperator.value) list = list.filter((c) => c.assigned_to === filterOperator.value)
  return list
})

// ——— mensagens filtradas por busca ———
const displayedMessages = computed(() => {
  if (!msgSearchQuery.value) return messages.value
  const q = msgSearchQuery.value.toLowerCase()
  return messages.value.filter((m) => (m.text || '').toLowerCase().includes(q))
})
const msgSearchResults = computed(() => displayedMessages.value.length)

// ——— helpers visuais ———
const AVATAR_COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#14B8A6']
function avatarColor(conv) {
  const idx = (conv.phone || conv.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}
function ticketNum(id) { if (!id) return '0000'; return String(parseInt(id.replace(/-/g, '').slice(-6), 16) % 100000).padStart(4, '0') }
function channelLabel(conv) { return conv.lastMessage?.role === 'lead' ? 'Baileys' : null }
function convStatusColor(conv) { return { open: 'dot-open', pending: 'dot-pending', resolved: 'dot-resolved' }[conv.conversation_status] || 'dot-pending' }
function stageColor(s) { return { 'Novo Lead': 'secondary', 'Em Qualificação': 'info', 'Qualificado': 'success', 'Reunião Agendada': 'warning', 'Vendido': 'purple', 'Perdido': 'error' }[s] || 'primary' }
function scoreColor(s) { if (s >= 70) return 'success'; if (s >= 40) return 'warning'; return 'error' }
function statusColor(s) { return { open: 'success', pending: 'warning', resolved: 'secondary' }[s] || 'secondary' }
function statusLabel(s) { return { open: 'Aberto', pending: 'Pendente', resolved: 'Resolvido' }[s] || s }
function toast(text, color = 'success') { snack.text = text; snack.color = color; snack.show = true }
function msgTimeAgo(d) {
  if (!d) return ''; const diff = Date.now() - new Date(d).getTime(); const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'; if (min < 60) return `${min}min`; if (min < 1440) return `${Math.floor(min / 60)}h`; return `${Math.floor(min / 1440)}d`
}
function formatTime(d) { if (!d) return ''; return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }

// ——— novas funções de acesso rápido ———

function toggleMsgSearch() {
  showMsgSearch.value = !showMsgSearch.value
  if (!showMsgSearch.value) msgSearchQuery.value = ''
}
function closeMsgSearch() { showMsgSearch.value = false; msgSearchQuery.value = '' }

async function returnToQueue() {
  if (!currentLead.value || currentLead.value.conversation_status !== 'open') return
  returningToQueue.value = true
  try {
    await http.post(`/chat/${currentLead.value.id}/return-to-queue`)
    currentLead.value.conversation_status = 'pending'
    currentLead.value.human_takeover = false
    syncConv(currentLead.value.id, { conversation_status: 'pending', human_takeover: false })
    activeTab.value = 'pending'
    toast('Ticket retornado à fila de pendentes.')
  } catch (e) { toast(e.message, 'error') } finally { returningToQueue.value = false }
}

// ——— carregamento ———
async function loadConvs() {
  loading.value = true
  try {
    const { leads } = await http.get('/chat').then((r) => r.data)
    convs.value = leads
    if (route.params.id) {
      const found = leads.find((l) => l.id === route.params.id)
      if (found) selectLead(found)
    }
  } catch (e) { toast(e.message, 'error') } finally { loading.value = false }
}

async function loadOperators() { try { operators.value = await api.listChatOperators() } catch { /* */ } }
async function loadLabels() { try { availableLabels.value = (await http.get('/labels').then((r) => r.data)).labels || [] } catch { /* */ } }
function labelColor(name) { return availableLabels.value.find((l) => l.name === name)?.color || '#6366F1' }

async function selectLead(lead) {
  currentLead.value = lead
  messages.value = []
  oldestMsgId.value = null
  openedAt[lead.id] = Date.now()
  showContactPanel.value = false
  showMsgSearch.value = false
  msgSearchQuery.value = ''
  await loadMessages()
  scrollToBottom()
}

async function loadMessages(before) {
  if (!currentLead.value) return
  loadingMore.value = true
  try {
    const params = { limit: 50 }
    if (before) params.before = before
    const { messages: msgs } = await http.get(`/chat/${currentLead.value.id}/messages`, { params }).then((r) => r.data)
    if (before) { messages.value = [...msgs, ...messages.value] }
    else { messages.value = msgs; if (msgs.length) oldestMsgId.value = msgs[0].id }
  } catch (e) { toast(e.message, 'error') } finally { loadingMore.value = false }
}

async function onScroll() {
  if (!messagesEl.value || loadingMore.value) return
  if (messagesEl.value.scrollTop < 80 && oldestMsgId.value) {
    const prevH = messagesEl.value.scrollHeight
    await loadMessages(oldestMsgId.value)
    nextTick(() => { if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight - prevH })
  }
}

function scrollToBottom() {
  nextTick(() => { if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight })
}

// ——— enviar mensagem ———
async function sendMessage() {
  if (!inputText.value.trim() || !currentLead.value) return
  let text = inputText.value.trim()
  if (useSignature.value && signature.value) text = `*${signature.value}*\n${text}`
  inputText.value = ''
  if (inputEl.value) { inputEl.value.style.height = 'auto' }
  showEmojiPicker.value = false
  sending.value = true
  try {
    const { message } = await http.post(`/chat/${currentLead.value.id}/messages`, { text }).then((r) => r.data)
    messages.value.push(message)
    scrollToBottom()
  } catch (e) { toast(e.message, 'error'); inputText.value = text } finally { sending.value = false }
}

function syncConv(id, patch) {
  const idx = convs.value.findIndex((c) => c.id === id)
  if (idx !== -1) convs.value[idx] = { ...convs.value[idx], ...patch }
}

// ——— ações de status ———
async function attendLead() {
  statusLoading.value = true
  try {
    await api.attendChat(currentLead.value.id)
    currentLead.value.conversation_status = 'open'
    currentLead.value.human_takeover = true
    syncConv(currentLead.value.id, { conversation_status: 'open', human_takeover: true })
    await loadMessages(); scrollToBottom()
    activeTab.value = 'open'
    toast('Atendimento iniciado.')
  } catch (e) { toast(e.message, 'error') } finally { statusLoading.value = false }
}

async function resolveLead() {
  if (currentLead.value.conversation_status === 'resolved') return
  statusLoading.value = true
  try {
    await api.resolveChat(currentLead.value.id)
    currentLead.value.conversation_status = 'resolved'
    syncConv(currentLead.value.id, { conversation_status: 'resolved' })
    await loadMessages(); scrollToBottom()
    activeTab.value = 'resolved'
    toast('Atendimento finalizado.')
  } catch (e) { toast(e.message, 'error') } finally { statusLoading.value = false }
}

async function reopenLead() {
  statusLoading.value = true
  try {
    await api.reopenChat(currentLead.value.id)
    currentLead.value.conversation_status = 'open'
    currentLead.value.human_takeover = true
    syncConv(currentLead.value.id, { conversation_status: 'open', human_takeover: true })
    activeTab.value = 'open'
    toast('Conversa reaberta.')
  } catch (e) { toast(e.message, 'error') } finally { statusLoading.value = false }
}

async function quickResolve(conv) {
  try {
    await api.resolveChat(conv.id)
    syncConv(conv.id, { conversation_status: 'resolved' })
    if (currentLead.value?.id === conv.id) currentLead.value.conversation_status = 'resolved'
    toast('Finalizado.')
  } catch (e) { toast(e.message, 'error') }
}

async function quickAttend(conv) {
  try {
    await api.attendChat(conv.id)
    syncConv(conv.id, { conversation_status: 'open', human_takeover: true })
    if (currentLead.value?.id === conv.id) { currentLead.value.conversation_status = 'open'; currentLead.value.human_takeover = true }
    activeTab.value = 'open'
    toast('Atendimento iniciado.')
  } catch (e) { toast(e.message, 'error') }
}

async function toggleTransfer(value) {
  try {
    await http.post(`/chat/${currentLead.value.id}/transfer`, { human_takeover: value })
    currentLead.value.human_takeover = value
    syncConv(currentLead.value.id, { human_takeover: value })
    await loadMessages(); scrollToBottom()
    toast(value ? 'Você assumiu o atendimento.' : 'IA retomou o atendimento.')
  } catch (e) { toast(e.message, 'error') }
}

// ——— iniciar conversa ———
async function startConversation() {
  if (!startForm.phone) return
  starting.value = true
  try {
    const { lead } = await api.startChat({ phone: startForm.phone, name: startForm.name || undefined, message: startForm.message || undefined })
    startDialog.value = false; resetStartForm()
    await loadConvs()
    const found = convs.value.find((c) => c.id === lead.id)
    if (found) { activeTab.value = 'open'; selectLead(found) }
    toast('Conversa iniciada!')
  } catch (e) { toast(e.message, 'error') } finally { starting.value = false }
}

function resetStartForm() { startForm.phone = ''; startForm.name = ''; startForm.message = '' }

// ——— realtime: novas mensagens ———
const { onMessage } = useMessageRealtime()
onMessage((msg) => {
  if (msg.lead_id === currentLead.value?.id) {
    // já está na conversa aberta — só acrescenta
    messages.value.push(msg)
    scrollToBottom()
    syncConv(msg.lead_id, { lastMessage: msg })
  } else {
    // outra conversa recebeu mensagem — atualiza sidebar
    loadConvs()
  }
})

// ——— realtime: mudanças de leads (status, estágio, etc.) ———
useRealtime('leads', auth.user?.tenantId, () => loadConvs())

function closeEmojiOnOutside() { showEmojiPicker.value = false }

onMounted(() => {
  loadConvs()
  loadOperators()
  loadLabels()
  document.addEventListener('click', closeEmojiOnOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', closeEmojiOnOutside)
})
</script>

<style scoped>
.chat-layout {
  display: flex;
  height: calc(100vh - 80px);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
}

/* ———— SIDEBAR ———— */
.chat-sidebar {
  width: 330px; min-width: 280px;
  background: rgba(255,255,255,0.02);
  border-right: 1px solid rgba(255,255,255,0.07);
  display: flex; flex-direction: column;
}
.sidebar-header { border-bottom: 1px solid rgba(255,255,255,0.06); }
.filter-panel { background: rgba(255,255,255,0.03); border-radius: 10px; padding: 10px; }
.sidebar-tabs { display: flex; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
.tab-btn {
  flex: 1; padding: 9px 2px;
  font-size: 11px; font-weight: 600; color: #6B7C88;
  background: none; border: none; cursor: pointer; transition: all 0.15s;
  display: flex; align-items: center; justify-content: center; gap: 3px; position: relative;
}
.tab-btn:hover { color: #9FB0BC; background: rgba(255,255,255,0.02); }
.tab-btn.active { color: #E2E8F0; }
.tab-btn.active::after { content:''; position:absolute; bottom:0; left:8%; right:8%; height:2px; background:#6366F1; border-radius:2px 2px 0 0; }
.tab-badge { font-size:9px; font-weight:700; padding:1px 5px; border-radius:10px; min-width:16px; text-align:center; color:white; }
.tab-badge.open { background:#10B981; }
.tab-badge.pending { background:#F59E0B; }
.tab-badge.resolved { background:#6B7C88; }
.sidebar-list { flex:1; overflow-y:auto; }

/* ———— CONV ITEM ———— */
.conv-item {
  display:flex; align-items:flex-start; gap:9px; padding:10px 12px 8px;
  cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.04); transition:background 0.15s; position:relative;
}
.conv-item:hover { background:rgba(255,255,255,0.035); }
.conv-item.active { background:rgba(99,102,241,0.1); border-left:3px solid #6366F1; padding-left:9px; }
.conv-item.unread { background:rgba(245,158,11,0.05); }
.status-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-top:14px; }
.dot-open    { background:#10B981; box-shadow:0 0 5px #10B981; }
.dot-pending { background:#F59E0B; }
.dot-resolved{ background:#4B5563; }
.relative { position:relative; flex-shrink:0; }
.conv-avatar { width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:white; }
.unread-badge { position:absolute; top:-3px; right:-3px; background:#F59E0B; color:white; font-size:9px; font-weight:700; border-radius:10px; padding:1px 4px; min-width:16px; text-align:center; }
.conv-body { flex:1; min-width:0; }
.conv-row1 { display:flex; align-items:center; gap:4px; margin-bottom:2px; }
.conv-name { font-size:13px; font-weight:600; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.conv-ticket,.conv-time { font-size:10px; color:#6B7C88; flex-shrink:0; }
.conv-last { font-size:11px; color:#6B7C88; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:5px; }
.conv-row3 { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.conv-tag { font-size:9px!important; height:16px!important; }
.quick-btn { height:20px!important; min-width:24px!important; padding:0!important; }

/* ———— CHAT AREA ———— */
.chat-area { flex:1; display:flex; flex-direction:column; background:rgba(0,0,0,0.08); min-width:0; }
.chat-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; }

/* ———— HEADER ———— */
.chat-header {
  display:flex; flex-direction:column; gap:8px;
  padding:10px 16px 0;
  border-bottom:1px solid rgba(255,255,255,0.08);
  background:rgba(255,255,255,0.02);
}
.header-avatar { width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:white; }
.w-100 { width:100%; }

/* ———— BARRA DE ACESSO RÁPIDO ———— */
.quick-action-bar {
  display: flex;
  align-items: center;
  gap: 0;
  overflow-x: auto;
  padding-bottom: 8px;
  scrollbar-width: none;
}
.quick-action-bar::-webkit-scrollbar { display: none; }

.qa-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: 8px;
  font-size: 11px; font-weight: 600; color: #9FB0BC;
  background: none; border: none; cursor: pointer;
  transition: all 0.15s; white-space: nowrap; flex-shrink: 0;
}
.qa-btn:hover:not(:disabled) { color: #E2E8F0; background: rgba(255,255,255,0.05); }
.qa-btn.active { color: #818CF8; background: rgba(99,102,241,0.12); }
.qa-btn.success { color: #34D399; }
.qa-btn.success:hover:not(:disabled) { background: rgba(16,185,129,0.1); }
.qa-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.qa-divider { width: 1px; height: 18px; background: rgba(255,255,255,0.08); margin: 0 2px; flex-shrink: 0; }

/* ———— BUSCA DE MENSAGENS ———— */
.msg-search-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 0 10px;
  border-top: 1px solid rgba(255,255,255,0.05);
}

/* ———— CORPO (mensagens + painel) ———— */
.chat-body { flex:1; display:flex; overflow:hidden; position:relative; }

/* ———— MENSAGENS ———— */
.chat-messages { flex:1; overflow-y:auto; padding:20px 16px; display:flex; flex-direction:column; gap:8px; }
.msg-wrapper { display:flex; }
.msg-wrapper.lead { justify-content:flex-start; }
.msg-wrapper.ai, .msg-wrapper.agent { justify-content:flex-end; }
.msg-bubble { max-width:72%; padding:10px 14px; border-radius:14px; }
.msg-bubble.lead { background:rgba(255,255,255,0.08); border-radius:4px 14px 14px 14px; }
.msg-bubble.ai { background:rgba(99,102,241,0.22); border-radius:14px 4px 14px 14px; }
.msg-bubble.agent { background:rgba(16,185,129,0.22); border-radius:14px 4px 14px 14px; }
.msg-role-badge { font-size:10px; color:#9FB0BC; margin-bottom:3px; }
.msg-text { font-size:13px; line-height:1.55; white-space:pre-wrap; word-break:break-word; }
.msg-time { font-size:10px; color:#6B7C88; margin-top:4px; text-align:right; }
.msg-highlight .msg-bubble { outline: 2px solid rgba(99,102,241,0.5); outline-offset: 2px; }

.typing-indicator { display:flex; gap:4px; padding:12px 16px; align-items:center; }
.typing-indicator span { width:7px; height:7px; border-radius:50%; background:#818CF8; animation:bounce 1.2s infinite ease-in-out; }
.typing-indicator span:nth-child(2) { animation-delay:.15s; }
.typing-indicator span:nth-child(3) { animation-delay:.3s; }
@keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

/* ———— PAINEL DE CONTATO ———— */
.contact-panel {
  width: 260px; flex-shrink: 0;
  background: rgba(255,255,255,0.02);
  border-left: 1px solid rgba(255,255,255,0.07);
  display: flex; flex-direction: column;
  overflow-y: auto;
}
.contact-panel-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px; border-bottom:1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.contact-panel-body { padding:16px; }
.contact-big-avatar {
  width:60px; height:60px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:20px; font-weight:700; color:white;
}
.contact-info-list { display:flex; flex-direction:column; gap:0; }
.contact-info-row {
  display:flex; align-items:center; gap:8px;
  padding:8px 0; font-size:12px; color:#9FB0BC;
  border-bottom:1px solid rgba(255,255,255,0.05);
}
.contact-intention { font-size:11px; color:#9FB0BC; padding:4px 0 8px; line-height:1.5; }
.contact-label-chip {
  display:inline-flex; align-items:center; gap:5px;
  font-size:11px; font-weight:600;
  padding:3px 9px; border-radius:20px;
  border:1px solid;
}
.contact-label-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }

/* ———— INPUT WHATSAPP ———— */
.wa-bar {
  flex-shrink: 0;
  padding: 8px 12px 10px;
  border-top: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.02);
  position: relative;
}

.wa-signature-banner {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: #6366F1; padding: 3px 8px 5px;
}

.wa-file-preview {
  display: flex; align-items: center; gap: 8px;
  background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2);
  border-radius: 10px; padding: 6px 10px; margin-bottom: 6px;
}
.wa-file-name { flex: 1; font-size: 12px; color: #C8D6E0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-file-size { font-size: 11px; color: #6B7C88; flex-shrink: 0; }
.wa-file-remove { background: none; border: none; cursor: pointer; color: #6B7C88; display: flex; transition: color .15s; }
.wa-file-remove:hover { color: #EF4444; }

.wa-input-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.wa-left-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; padding-bottom: 4px; }

.wa-icon-btn {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: #6B7C88; transition: all .15s; flex-shrink: 0;
}
.wa-icon-btn:hover { background: rgba(255,255,255,0.06); color: #C8D6E0; }
.wa-icon-btn.active { color: #818CF8; background: rgba(99,102,241,0.12); }

.wa-textarea {
  flex: 1;
  min-height: 40px; max-height: 120px;
  padding: 10px 14px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 22px;
  color: #F1F5F9; font-size: 14px; font-family: inherit;
  resize: none; outline: none; line-height: 1.45;
  transition: border-color .15s;
  overflow-y: auto;
}
.wa-textarea::placeholder { color: #3A4A55; }
.wa-textarea:focus { border-color: rgba(99,102,241,0.4); }

.wa-send-btn {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: none; cursor: pointer; transition: all .2s;
  background: rgba(255,255,255,0.07); color: #6B7C88;
}
.wa-send-btn--active {
  background: linear-gradient(135deg, #6366F1, #8B5CF6) !important;
  color: white !important;
  box-shadow: 0 3px 12px rgba(99,102,241,0.4);
}
.wa-send-btn--active:hover { transform: scale(1.08); box-shadow: 0 4px 16px rgba(99,102,241,0.5); }
.wa-send-btn--mic { background: rgba(255,255,255,0.06) !important; color: #9FB0BC !important; }
.wa-send-btn--mic:hover { background: rgba(16,185,129,0.12) !important; color: #34D399 !important; }
.wa-send-btn:disabled { opacity: .5; cursor: not-allowed; transform: none !important; }

/* Gravação de áudio */
.wa-recording {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0; padding-bottom: 2px;
}
.rec-dot {
  width: 9px; height: 9px; border-radius: 50%; background: #EF4444;
  animation: pulse-rec .8s ease-in-out infinite;
}
@keyframes pulse-rec { 0%,100%{opacity:1} 50%{opacity:.3} }
.rec-time { font-size: 13px; font-weight: 700; color: #F87171; min-width: 36px; }

/* Emoji picker */
.emoji-picker {
  position: absolute; bottom: calc(100% + 6px); left: 8px;
  width: 320px;
  background: #1A2030; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px; padding: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  z-index: 100;
}
.emoji-cats { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
.emoji-cat-btn {
  font-size: 18px; padding: 4px 6px; border-radius: 8px;
  background: none; border: none; cursor: pointer; transition: background .1s; line-height: 1;
}
.emoji-cat-btn:hover, .emoji-cat-btn.active { background: rgba(255,255,255,0.1); }
.emoji-grid {
  display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px;
  max-height: 200px; overflow-y: auto; scrollbar-width: thin;
}
.emoji-btn {
  font-size: 20px; padding: 5px; border-radius: 6px;
  background: none; border: none; cursor: pointer;
  transition: background .1s; text-align: center; line-height: 1;
}
.emoji-btn:hover { background: rgba(255,255,255,0.1); }
</style>
