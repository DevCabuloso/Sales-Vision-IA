<template>
  <div class="editor-shell">
    <!-- Toolbar -->
    <div class="editor-toolbar">
      <v-btn icon="mdi-arrow-left" variant="text" size="small" @click="$router.push('/flows')" />
      <span class="editor-title">{{ flow?.name || 'Carregando…' }}</span>
      <v-chip :color="flow?.status === 'active' ? 'success' : 'default'" size="x-small" variant="tonal">
        {{ flow?.status === 'active' ? 'Ativo' : 'Inativo' }}
      </v-chip>
      <v-spacer />
      <v-btn size="small" variant="tonal" prepend-icon="mdi-cog-outline" @click="settingsDialog = true">Configurações</v-btn>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save-outline" :loading="saving" @click="save">Salvar</v-btn>
    </div>

    <div class="editor-body">
      <!-- Painel esquerdo: tipos de bloco -->
      <aside class="block-panel">
        <div class="block-section-title">MENSAGENS</div>
        <div v-for="t in BLOCK_TYPES.messages" :key="t.type"
          class="block-item" draggable="true" @dragstart="onDragStart($event, t.type)">
          <v-icon :icon="t.icon" size="15" :style="{ color: t.color }" />
          {{ t.label }}
        </div>

        <div class="block-section-title mt-3">ROTEAMENTO</div>
        <div v-for="t in BLOCK_TYPES.routing" :key="t.type"
          class="block-item" draggable="true" @dragstart="onDragStart($event, t.type)">
          <v-icon :icon="t.icon" size="15" :style="{ color: t.color }" />
          {{ t.label }}
        </div>

        <div class="block-section-title mt-3">INTEGRAÇÕES</div>
        <div v-for="t in BLOCK_TYPES.integrations" :key="t.type"
          class="block-item" draggable="true" @dragstart="onDragStart($event, t.type)">
          <v-icon :icon="t.icon" size="15" :style="{ color: t.color }" />
          {{ t.label }}
        </div>

        <div class="block-section-title mt-3">CRM</div>
        <div v-for="t in BLOCK_TYPES.crm" :key="t.type"
          class="block-item" draggable="true" @dragstart="onDragStart($event, t.type)">
          <v-icon :icon="t.icon" size="15" :style="{ color: t.color }" />
          {{ t.label }}
        </div>
      </aside>

      <!-- Canvas Vue Flow -->
      <div class="canvas-wrap" ref="canvasRef" @dragover.prevent @drop="onDrop">
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeTypes"
          fit-view-on-init
          :default-edge-options="{ type: 'smoothstep', animated: false }"
          @connect="onConnect"
          @node-click="onNodeClick"
          @pane-click="selectedNode = null"
        >
          <Background pattern-color="#1e293b" :gap="20" />
          <Controls position="bottom-right" />
        </VueFlow>
      </div>

      <!-- Painel direito: configuração do nó selecionado -->
      <transition name="slide-right">
        <aside v-if="selectedNode" class="config-panel">
          <div class="config-header">
            <span class="config-title">{{ selectedMeta?.label }}</span>
            <v-btn icon="mdi-close" variant="text" size="x-small" @click="selectedNode = null" />
          </div>
          <div class="config-body">

            <!-- message -->
            <template v-if="selectedNode.data.nodeType === 'message'">
              <label class="cfg-label">Texto da mensagem</label>
              <v-textarea v-model="selectedNode.data.text" variant="outlined" density="compact" rows="4"
                hint="Use {{variavel}} para inserir valores capturados" persistent-hint auto-grow />
            </template>

            <!-- delay -->
            <template v-else-if="selectedNode.data.nodeType === 'delay'">
              <label class="cfg-label">Aguardar (segundos)</label>
              <v-text-field v-model.number="selectedNode.data.seconds" type="number" min="1" max="300"
                variant="outlined" density="compact" />
            </template>

            <!-- variable -->
            <template v-else-if="selectedNode.data.nodeType === 'variable'">
              <label class="cfg-label">Pergunta ao usuário</label>
              <v-textarea v-model="selectedNode.data.prompt" variant="outlined" density="compact" rows="3" auto-grow />
              <label class="cfg-label mt-3">Nome da variável</label>
              <v-text-field v-model="selectedNode.data.variableName" variant="outlined" density="compact"
                prefix="{{" suffix="}}" hint="Ex: nome_cliente" persistent-hint />
            </template>

            <!-- condition -->
            <template v-else-if="selectedNode.data.nodeType === 'condition'">
              <label class="cfg-label">Variável a avaliar (opcional)</label>
              <v-text-field v-model="selectedNode.data.variableName" variant="outlined" density="compact"
                prefix="{{" suffix="}}" hint="Deixe vazio para avaliar a última resposta" persistent-hint />
              <p class="cfg-hint mt-3">Crie conexões com tipo <strong>Palavra-chave</strong> saindo deste nó para definir as ramificações.</p>
            </template>

            <!-- transfer -->
            <template v-else-if="selectedNode.data.nodeType === 'transfer'">
              <label class="cfg-label">Mensagem antes de transferir (opcional)</label>
              <v-textarea v-model="selectedNode.data.message" variant="outlined" density="compact" rows="3" auto-grow />
            </template>

            <!-- webhook -->
            <template v-else-if="selectedNode.data.nodeType === 'webhook'">
              <label class="cfg-label">URL</label>
              <v-text-field v-model="selectedNode.data.url" variant="outlined" density="compact" placeholder="https://…" />
              <label class="cfg-label mt-2">Método</label>
              <v-select v-model="selectedNode.data.method" :items="['POST','GET','PUT','PATCH']"
                variant="outlined" density="compact" />
              <label class="cfg-label mt-2">Body (JSON, opcional)</label>
              <v-textarea v-model="selectedNode.data.body" variant="outlined" density="compact" rows="3"
                placeholder='{"key": "{{variavel}}"}' auto-grow />
              <label class="cfg-label mt-2">Salvar resposta em variável (opcional)</label>
              <v-text-field v-model="selectedNode.data.saveVariable" variant="outlined" density="compact"
                prefix="{{" suffix="}}" />
            </template>

            <!-- kanban -->
            <template v-else-if="selectedNode.data.nodeType === 'kanban'">
              <label class="cfg-label">Mover lead para estágio</label>
              <v-text-field v-model="selectedNode.data.stage" variant="outlined" density="compact"
                placeholder="Ex: Qualificado, Reunião Agendada…" />
            </template>

            <!-- start / end -->
            <template v-else>
              <p class="cfg-hint">Este bloco não possui configurações adicionais.</p>
            </template>

            <!-- Botão deletar (exceto start) -->
            <v-btn v-if="selectedNode.data.nodeType !== 'start'"
              class="mt-4" color="error" variant="tonal" size="small" block
              prepend-icon="mdi-delete-outline" @click="deleteSelected">
              Remover bloco
            </v-btn>
          </div>
        </aside>
      </transition>
    </div>

    <!-- Dialog: tipo de aresta -->
    <v-dialog v-model="edgeDialog" max-width="360" persistent>
      <v-card class="dialog-card">
        <v-card-title class="pt-5 px-5">Tipo de conexão</v-card-title>
        <v-card-text>
          <v-radio-group v-model="pendingEdge.edgeType" density="compact">
            <v-radio label="⚡ Automático — avança imediatamente" value="auto" />
            <v-radio label="Qualquer resposta — avança na próxima mensagem" value="default" />
            <v-radio label="Palavra-chave — avança se o usuário digitar…" value="keyword" />
          </v-radio-group>
          <v-text-field v-if="pendingEdge.edgeType === 'keyword'"
            v-model="pendingEdge.keywords"
            label="Palavras-chave (separadas por vírgula)"
            variant="outlined" density="compact"
            placeholder="1, sim, quero, contratar" />
        </v-card-text>
        <v-card-actions class="pb-4 px-5">
          <v-spacer />
          <v-btn variant="text" @click="edgeDialog = false">Cancelar</v-btn>
          <v-btn color="primary" @click="confirmEdge">Adicionar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: configurações do fluxo -->
    <v-dialog v-model="settingsDialog" max-width="480" persistent>
      <v-card class="dialog-card">
        <v-card-title class="pt-5 px-5">Configurações do Fluxo</v-card-title>
        <v-card-text>
          <v-text-field v-model="flowSettings.name" label="Nome" variant="outlined" density="compact" />
          <v-select v-model="flowSettings.status" :items="[{title:'Ativo',value:'active'},{title:'Inativo',value:'inactive'}]"
            label="Status" variant="outlined" density="compact" class="mt-2" />
          <v-combobox v-model="flowSettings.trigger_keywords" label="Palavras-gatilho"
            hint="Digite e pressione Enter" variant="outlined" density="compact"
            chips multiple clearable class="mt-2" />
          <v-text-field v-model.number="flowSettings.timeout_minutes" type="number" min="1"
            label="Timeout (minutos sem resposta)" variant="outlined" density="compact" class="mt-2" />
          <v-text-field v-model="flowSettings.fallback_text" label="Mensagem de fallback (sem rota)"
            variant="outlined" density="compact" class="mt-2" />
        </v-card-text>
        <v-card-actions class="pb-4 px-5">
          <v-spacer />
          <v-btn variant="text" @click="settingsDialog = false">Cancelar</v-btn>
          <v-btn color="primary" @click="applySettings">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, markRaw } from 'vue'
import { useRoute }   from 'vue-router'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls }   from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import FlowNode from '@/components/flow/FlowNode.vue'
import { http } from '@/services/api'

const route = useRoute()

// ─── Estado ────────────────────────────────────────────────────────────────
const flow          = ref(null)
const nodes         = ref([])
const edges         = ref([])
const selectedNode  = ref(null)
const saving        = ref(false)
const edgeDialog    = ref(false)
const settingsDialog = ref(false)
const pendingEdge   = ref({ source: null, target: null, edgeType: 'auto', keywords: '' })
const flowSettings  = ref({})
const dragType      = ref(null)
const canvasRef     = ref(null)

const nodeTypes = { flowNode: markRaw(FlowNode) }

// ─── Metadados de tipos de bloco ────────────────────────────────────────────
const BLOCK_TYPES = {
  messages:     [
    { type: 'message',   label: 'Mensagem',   icon: 'mdi-message-text-outline', color: '#6366F1' },
    { type: 'delay',     label: 'Aguardar',   icon: 'mdi-clock-outline',        color: '#F59E0B' },
  ],
  routing: [
    { type: 'condition', label: 'Condição',   icon: 'mdi-source-branch',        color: '#EC4899' },
    { type: 'transfer',  label: 'Transferir', icon: 'mdi-account-arrow-right',  color: '#F97316' },
    { type: 'end',       label: 'Fim',        icon: 'mdi-stop-circle-outline',  color: '#EF4444' },
  ],
  integrations: [
    { type: 'webhook',   label: 'Webhook',    icon: 'mdi-webhook',              color: '#8B5CF6' },
  ],
  crm: [
    { type: 'variable',  label: 'Capturar',   icon: 'mdi-text-box-outline',     color: '#3B82F6' },
    { type: 'kanban',    label: 'Kanban',     icon: 'mdi-view-column-outline',  color: '#14B8A6' },
  ],
}

const ALL_TYPES = Object.values(BLOCK_TYPES).flat()

const selectedMeta = computed(() =>
  selectedNode.value ? ALL_TYPES.find(t => t.type === selectedNode.value.data?.nodeType) : null
)

// ─── Carregar fluxo ─────────────────────────────────────────────────────────
onMounted(async () => {
  const { data } = await http.get(`/flows/${route.params.id}`)
  flow.value = data.flow
  nodes.value = (data.flow.nodes || []).map(n => ({ ...n, type: 'flowNode' }))
  edges.value = data.flow.edges || []
  flowSettings.value = {
    name:             data.flow.name,
    status:           data.flow.status,
    trigger_keywords: data.flow.trigger_keywords || [],
    timeout_minutes:  data.flow.timeout_minutes || 30,
    fallback_text:    data.flow.fallback_text || '',
  }
})

// ─── Drag & Drop ────────────────────────────────────────────────────────────
function onDragStart(e, type) {
  dragType.value = type
  e.dataTransfer.effectAllowed = 'move'
}

function onDrop(e) {
  if (!dragType.value) return
  const rect = canvasRef.value?.getBoundingClientRect() || { left: 0, top: 0 }
  const id = `node-${Date.now()}`
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'flowNode',
      position: { x: e.clientX - rect.left - 90, y: e.clientY - rect.top - 20 },
      data: { nodeType: dragType.value },
    },
  ]
  dragType.value = null
}

// ─── Conexões ───────────────────────────────────────────────────────────────
function onConnect(params) {
  pendingEdge.value = { ...params, edgeType: 'auto', keywords: '' }
  edgeDialog.value  = true
}

function confirmEdge() {
  const { source, target, edgeType, keywords } = pendingEdge.value
  const label = edgeType === 'auto' ? '⚡' : edgeType === 'keyword' ? keywords : ''
  edges.value.push({
    id:     `e-${source}-${target}-${Date.now()}`,
    source, target,
    type:   'smoothstep',
    label,
    style:  { stroke: edgeType === 'auto' ? '#F59E0B' : edgeType === 'keyword' ? '#6366F1' : '#6b7c93' },
    data:   { edgeType, keywords },
  })
  edgeDialog.value = false
}

// ─── Selecionar nó ──────────────────────────────────────────────────────────
function onNodeClick(e) {
  // Busca o nó no array reativo para que v-model no painel funcione
  const found = nodes.value.find(n => n.id === e.node.id)
  selectedNode.value = found || null
}

function deleteSelected() {
  nodes.value = nodes.value.filter(n => n.id !== selectedNode.value.id)
  edges.value = edges.value.filter(e => e.source !== selectedNode.value.id && e.target !== selectedNode.value.id)
  selectedNode.value = null
}

// ─── Configurações ──────────────────────────────────────────────────────────
function applySettings() {
  Object.assign(flow.value, flowSettings.value)
  settingsDialog.value = false
}

// ─── Salvar ─────────────────────────────────────────────────────────────────
async function save() {
  saving.value = true
  try {
    await http.patch(`/flows/${route.params.id}`, {
      name:             flow.value.name,
      status:           flow.value.status,
      trigger_keywords: flow.value.trigger_keywords,
      timeout_minutes:  flow.value.timeout_minutes,
      fallback_text:    flow.value.fallback_text,
      nodes:            nodes.value,
      edges:            edges.value,
    })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.editor-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #0f1623;
}

/* Toolbar */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  background: #141c2d;
  flex-shrink: 0;
  z-index: 10;
}
.editor-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

/* Body */
.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Painel esquerdo */
.block-panel {
  width: 160px;
  flex-shrink: 0;
  background: #141c2d;
  border-right: 1px solid rgba(255,255,255,0.07);
  overflow-y: auto;
  padding: 12px 8px;
}
.block-section-title {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: #4b5563;
  padding: 0 4px;
  margin-bottom: 4px;
}
.block-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 8px;
  border-radius: 7px;
  font-size: 12px;
  color: #94a3b8;
  cursor: grab;
  transition: background 0.12s, color 0.12s;
  user-select: none;
}
.block-item:hover {
  background: rgba(255,255,255,0.05);
  color: #e2e8f0;
}
.block-item:active { cursor: grabbing; }

/* Canvas */
.canvas-wrap {
  flex: 1;
  position: relative;
}

/* Painel direito */
.config-panel {
  width: 280px;
  flex-shrink: 0;
  background: #141c2d;
  border-left: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.config-title {
  font-size: 13px;
  font-weight: 700;
  color: #e2e8f0;
}
.config-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 14px;
}
.cfg-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6b7c93;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.cfg-hint {
  font-size: 12px;
  color: #6b7c93;
  line-height: 1.5;
}

/* Transição painel direito */
.slide-right-enter-active,
.slide-right-leave-active { transition: all 0.2s ease; }
.slide-right-enter-from,
.slide-right-leave-to     { transform: translateX(100%); opacity: 0; }

.dialog-card { background: #141C2D !important; }
</style>
