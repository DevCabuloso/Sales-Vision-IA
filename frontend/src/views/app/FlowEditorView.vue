<template>
  <div class="fe-shell">

    <!-- Toolbar -->
    <div class="fe-toolbar">
      <v-btn icon="mdi-arrow-left" variant="text" size="small" @click="$router.push('/flows')" />
      <span class="fe-title">{{ flow?.name || 'Carregando…' }}</span>
      <v-chip :color="flow?.status === 'active' ? 'success' : 'default'" size="x-small" variant="tonal">
        {{ flow?.status === 'active' ? 'Ativo' : 'Inativo' }}
      </v-chip>
      <v-spacer />
      <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addNode">Novo Nó</v-btn>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-cog-outline" @click="settingsDialog = true">Config</v-btn>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save-outline" :loading="saving" @click="save">Salvar</v-btn>
    </div>

    <!-- Canvas + Painel -->
    <div class="fe-canvas-area">

      <VueFlow
        id="chatflow"
        v-model:nodes="vfNodes"
        v-model:edges="vfEdges"
        fit-view-on-init
        :min-zoom="0.25"
        :max-zoom="2"
        :default-edge-options="defaultEdgeOpts"
        :delete-key-code="null"
        class="fe-canvas"
        @connect="onConnect"
        @node-click="onNodeClick"
        @pane-click="onPaneClick"
        @nodes-change="onNodesChange"
      >
        <!-- Nó customizado -->
        <template #node-passo="{ id, data, selected }">
          <div class="passo-wrap">
            <Handle type="target" :position="Position.Top" id="hin" />

            <div class="passo-box" :class="[data.passo.saida, { sel: selected }]">
              <div class="passo-top">
                <span class="passo-lbl">{{ nodeIndex(id) === 0 ? '▶ INÍCIO' : 'NÓ ' + (nodeIndex(id) + 1) }}</span>
                <v-icon :icon="saidaIcon(data.passo.saida)" size="14" class="passo-ico" />
              </div>
              <div class="passo-txt">{{ data.passo.mensagem || '(sem mensagem)' }}</div>
              <div class="passo-bot">
                <span class="passo-tag" :class="data.passo.saida">{{ saidaLabel(data.passo.saida) }}</span>
              </div>
            </div>

            <Handle type="source" :position="Position.Bottom" id="hout" />
          </div>
        </template>
      </VueFlow>

      <!-- Painel lateral -->
      <transition name="slide-in">
        <div v-if="selectedNode" class="fe-panel">
          <div class="fe-ph">
            <span>{{ nodeIndex(selectedNode.id) === 0 ? 'Nó Inicial' : 'Nó ' + (nodeIndex(selectedNode.id) + 1) }}</span>
            <v-btn icon="mdi-delete-outline" size="x-small" color="error" variant="text" @click="deleteNode(selectedNode.id)" />
          </div>

          <label class="lbl">Mensagem do bot</label>
          <v-textarea
            v-model="selectedNode.data.passo.mensagem"
            variant="outlined" density="compact"
            rows="4" auto-grow hide-details
            placeholder="Ex: Olá! Digite 1 para Vendas ou 2 para Suporte."
          />

          <label class="lbl mt3">Após enviar:</label>
          <div class="rg">
            <label class="ro" :class="{ on: selectedNode.data.passo.saida === 'aguardar' }">
              <input type="radio" v-model="selectedNode.data.passo.saida" value="aguardar" />
              <span>Aguardar resposta</span>
            </label>
            <label class="ro" :class="{ on: selectedNode.data.passo.saida === 'avancar' }">
              <input type="radio" v-model="selectedNode.data.passo.saida" value="avancar" />
              <span>Avançar automaticamente</span>
            </label>
            <label class="ro" :class="{ on: selectedNode.data.passo.saida === 'transferir' }">
              <input type="radio" v-model="selectedNode.data.passo.saida" value="transferir" />
              <span>Transferir para atendente</span>
            </label>
            <label class="ro" :class="{ on: selectedNode.data.passo.saida === 'encerrar' }">
              <input type="radio" v-model="selectedNode.data.passo.saida" value="encerrar" />
              <span>Encerrar conversa</span>
            </label>
          </div>

          <!-- Conexões visuais (aguardar) -->
          <template v-if="selectedNode.data.passo.saida === 'aguardar'">
            <label class="lbl mt3">Rotas de resposta</label>
            <p class="hint">Arraste o ponto <strong>inferior</strong> do nó para outro nó para criar uma rota de resposta.</p>

            <div class="elist">
              <div v-for="e in nodeOutEdges(selectedNode.id)" :key="e.id" class="erow">
                <span class="echip">{{ e.label }}</span>
                <span class="edest">→ Nó {{ nodeIndex(e.target) + 1 }}</span>
                <v-btn icon="mdi-close" size="x-small" variant="text" color="error" @click="removeEdge(e.id)" />
              </div>
              <div v-if="!nodeOutEdges(selectedNode.id).length" class="elist-empty">
                Nenhuma rota ainda — arraste o ponto inferior
              </div>
            </div>

            <label class="lbl mt3">Resposta padrão (sem match)</label>
            <v-select
              v-model="selectedNode.data.passo.padrao"
              :items="specialItems"
              item-title="label"
              item-value="id"
              variant="outlined" density="compact"
              hide-details clearable
              placeholder="Próximo nó em sequência"
            />
          </template>

          <!-- Msg de transferência -->
          <template v-if="selectedNode.data.passo.saida === 'transferir'">
            <label class="lbl mt3">Mensagem antes de transferir</label>
            <v-text-field
              v-model="selectedNode.data.passo.msg_transferencia"
              variant="outlined" density="compact"
              hide-details placeholder="Opcional"
            />
          </template>
        </div>
      </transition>
    </div>

    <!-- Dialog: nova conexão -->
    <v-dialog v-model="connectDialog" max-width="360" persistent>
      <v-card style="background:#141C2D">
        <v-card-title class="pt-4 px-5" style="font-size:15px">Nova Conexão</v-card-title>
        <v-card-text class="px-5 pb-1">
          <p style="font-size:12px;color:#94a3b8;margin-bottom:12px">
            Qual texto o usuário deve digitar para seguir esta rota?<br>
            Ex: <strong>1</strong>, <strong>2</strong>, <strong>sim</strong>, <strong>vendas</strong>
          </p>
          <v-text-field
            v-model="connectText"
            variant="outlined" density="compact"
            label='Resposta (vazio = rota padrão)'
            hide-details autofocus
            @keyup.enter="confirmConnect"
          />
        </v-card-text>
        <v-card-actions class="pb-4 px-5">
          <v-spacer />
          <v-btn variant="text" @click="cancelConnect">Cancelar</v-btn>
          <v-btn color="primary" @click="confirmConnect">Conectar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: configurações -->
    <v-dialog v-model="settingsDialog" max-width="480" persistent>
      <v-card style="background:#141C2D">
        <v-card-title class="pt-5 px-5">Configurações do Fluxo</v-card-title>
        <v-card-text class="px-5">
          <v-text-field v-model="flowCfg.name" label="Nome" variant="outlined" density="compact" class="mb-3" hide-details />
          <v-select v-model="flowCfg.status"
            :items="[{title:'Ativo',value:'active'},{title:'Inativo',value:'inactive'}]"
            label="Status" variant="outlined" density="compact" class="mb-3" hide-details />
          <v-combobox v-model="flowCfg.trigger_keywords"
            label="Palavras-gatilho"
            hint="Digite e pressione Enter para adicionar"
            variant="outlined" density="compact" chips multiple clearable class="mb-3" />
          <v-text-field v-model.number="flowCfg.timeout_minutes" type="number" min="1"
            label="Timeout (min sem resposta)" variant="outlined" density="compact" class="mb-3" hide-details />
          <v-text-field v-model="flowCfg.fallback_text"
            label="Mensagem ao expirar" variant="outlined" density="compact" hide-details />
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
import '@vue-flow/core/dist/style.css'
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { VueFlow, Handle, Position, MarkerType } from '@vue-flow/core'
import { http } from '@/services/api'

const route = useRoute()

// ── State ─────────────────────────────────────────────────────────────────────
const flow          = ref(null)
const vfNodes       = ref([])
const vfEdges       = ref([])
const selectedNode  = ref(null)
const saving        = ref(false)
const settingsDialog = ref(false)
const flowCfg       = ref({})

const connectDialog = ref(false)
const connectText   = ref('')
const pending       = ref(null)   // { source, target }

const specialItems = [
  { id: '__transfer__', label: '↩ Transferir para atendente' },
  { id: '__end__',      label: '⭕ Encerrar conversa' },
]

const defaultEdgeOpts = {
  type:      'smoothstep',
  animated:  false,
  markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' },
  style:     { stroke: '#6366F1', strokeWidth: 2 },
  selectable: true,
  updatable:  true,
}

// ── Load ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  const { data } = await http.get(`/flows/${route.params.id}`)
  flow.value = data.flow

  const raw = data.flow.nodes || []
  const passos = raw.filter(n => n.tipo === 'passo').length
    ? raw.filter(n => n.tipo === 'passo')
    : [mkPasso()]

  vfNodes.value = passos.map((p, i) => toNode(p, i))
  vfEdges.value = edgesFrom(passos)

  flowCfg.value = {
    name:             data.flow.name,
    status:           data.flow.status,
    trigger_keywords: data.flow.trigger_keywords || [],
    timeout_minutes:  data.flow.timeout_minutes  || 30,
    fallback_text:    data.flow.fallback_text    || '',
  }
})

// ── Converters ────────────────────────────────────────────────────────────────
function mkPasso(id) {
  return {
    id:   id || `p_${Date.now()}`,
    tipo: 'passo',
    mensagem: '',
    saida: 'aguardar',
    respostas: [],
    padrao: '',
    msg_transferencia: '',
  }
}

function toNode(passo, i) {
  return {
    id:       passo.id,
    type:     'passo',
    position: passo._pos || { x: 80 + i * 220, y: 120 },
    data:     { passo: { ...passo } },
    selectable: true,
    draggable:  true,
  }
}

function mkEdge(source, target, respText) {
  const isDef = !respText
  return {
    id:        `e-${source}-${respText || 'def'}-${target}`,
    source,
    target,
    label:     respText || '...',
    type:      'smoothstep',
    animated:  false,
    selectable: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: isDef ? '#6b7280' : '#6366F1' },
    style:     { stroke: isDef ? '#6b7280' : '#6366F1', strokeWidth: 2 },
    labelStyle:     { fill: '#e2e8f0', fontSize: 12, fontWeight: 700 },
    labelBgStyle:   { fill: '#0f1929', fillOpacity: 0.95 },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 4,
    data: { respText },
  }
}

function edgesFrom(passos) {
  const out = []
  for (const p of passos) {
    for (const r of (p.respostas || [])) {
      if (!r.destino || r.destino === '__transfer__' || r.destino === '__end__') continue
      out.push(mkEdge(p.id, r.destino, r.texto))
    }
    if (p.padrao && p.padrao !== '__transfer__' && p.padrao !== '__end__') {
      out.push(mkEdge(p.id, p.padrao, ''))
    }
  }
  return out
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function nodeIndex(id) {
  return vfNodes.value.findIndex(n => n.id === id)
}
function nodeOutEdges(nid) {
  return vfEdges.value.filter(e => e.source === nid)
}
function saidaIcon(s) {
  return { aguardar: 'mdi-message-reply-outline', avancar: 'mdi-arrow-right-circle-outline', transferir: 'mdi-account-arrow-right-outline', encerrar: 'mdi-stop-circle-outline' }[s] || 'mdi-help-circle-outline'
}
function saidaLabel(s) {
  return { aguardar: 'Aguarda', avancar: 'Avança', transferir: 'Transfere', encerrar: 'Encerra' }[s] || s
}

// ── Canvas events ─────────────────────────────────────────────────────────────
function onNodeClick(event, node) {
  const id = node?.id
  selectedNode.value = id ? (vfNodes.value.find(n => n.id === id) || null) : null
}
function onPaneClick() {
  selectedNode.value = null
}
function onNodesChange(changes) {
  for (const c of changes) {
    if (c.type === 'remove' && c.id === selectedNode.value?.id) {
      selectedNode.value = null
    }
  }
}

// ── Connect ───────────────────────────────────────────────────────────────────
function onConnect(params) {
  if (params.source === params.target) return
  pending.value   = params
  connectText.value = ''
  connectDialog.value = true
}
function confirmConnect() {
  if (!pending.value) return
  const { source, target } = pending.value
  const txt = connectText.value.trim()
  // Evita duplicata com mesmo texto na mesma origem
  vfEdges.value = vfEdges.value.filter(e =>
    !(e.source === source && (e.data?.respText || '') === txt)
  )
  vfEdges.value.push(mkEdge(source, target, txt))
  connectDialog.value = false
  pending.value = null
}
function cancelConnect() {
  connectDialog.value = false
  pending.value = null
}
function removeEdge(eid) {
  vfEdges.value = vfEdges.value.filter(e => e.id !== eid)
}

// ── Add / Delete node ─────────────────────────────────────────────────────────
function addNode() {
  const id  = `p_${Date.now()}`
  vfNodes.value.push(toNode(mkPasso(id), vfNodes.value.length))
}
function deleteNode(nid) {
  vfNodes.value = vfNodes.value.filter(n => n.id !== nid)
  vfEdges.value = vfEdges.value.filter(e => e.source !== nid && e.target !== nid)
  if (selectedNode.value?.id === nid) selectedNode.value = null
}

// ── Settings ──────────────────────────────────────────────────────────────────
function applySettings() {
  Object.assign(flow.value, flowCfg.value)
  settingsDialog.value = false
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  saving.value = true
  try {
    const nodes = vfNodes.value.map(node => {
      const p = { ...node.data.passo }
      p._pos = { ...node.position }

      const outEdges = vfEdges.value.filter(e => e.source === node.id)
      p.respostas = outEdges
        .filter(e => e.data?.respText)
        .map(e => ({ texto: e.data.respText, destino: e.target }))

      const defEdge = outEdges.find(e => !e.data?.respText)
      if (defEdge) p.padrao = defEdge.target

      if (outEdges.length > 0 && !['transferir', 'encerrar'].includes(p.saida)) {
        p.saida = 'aguardar'
      }
      return p
    })

    await http.patch(`/flows/${route.params.id}`, {
      name:             flow.value.name,
      status:           flow.value.status,
      trigger_keywords: flow.value.trigger_keywords,
      timeout_minutes:  flow.value.timeout_minutes,
      fallback_text:    flow.value.fallback_text,
      nodes,
      edges: [],
    })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
/* ── Shell ─────────────────────────────────────── */
.fe-shell {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
  background: #080e1a; color: #e2e8f0;
}

/* ── Toolbar ───────────────────────────────────── */
.fe-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px;
  background: #0f1929;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0; z-index: 10;
}
.fe-title { font-size: 14px; font-weight: 600; }

/* ── Canvas Area ───────────────────────────────── */
.fe-canvas-area {
  flex: 1; display: flex; overflow: hidden;
}
.fe-canvas { flex: 1; }

/* Vue Flow overrides */
:deep(.vue-flow) { background: #080e1a; }

:deep(.vue-flow__pane) {
  background-image: radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px);
  background-size: 28px 28px;
}

:deep(.vue-flow__handle) {
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 2.5px solid #6366F1;
  background: #080e1a;
  transition: background 0.15s, transform 0.15s;
  cursor: crosshair;
}
:deep(.vue-flow__handle:hover),
:deep(.vue-flow__handle.connecting) {
  background: #6366F1;
  transform: scale(1.5);
}
:deep(.vue-flow__handle-target) { border-color: #22C55E; }

:deep(.vue-flow__edge-path) { stroke-width: 2; }
:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: #818CF8 !important;
  stroke-width: 3;
}
:deep(.vue-flow__edge-text) { font-size: 12px; font-weight: 700; }
:deep(.vue-flow__controls) { background: #0f1929; border: 1px solid rgba(255,255,255,0.08); }
:deep(.vue-flow__controls button) { background: #0f1929; color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.06); }
:deep(.vue-flow__controls button:hover) { background: rgba(99,102,241,0.15); }

/* ── Nó (passo-wrap é o wrapper do slot) ──────── */
.passo-wrap {
  position: relative;
  width: 160px; height: 160px;
}

.passo-box {
  width: 160px; height: 160px;
  border-radius: 16px;
  border: 2px solid rgba(255,255,255,0.1);
  background: #0f1929;
  display: flex; flex-direction: column;
  padding: 12px 14px;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  user-select: none;
}
.passo-box.sel {
  box-shadow: 0 0 0 3px rgba(99,102,241,0.35);
  border-color: #6366F1;
}
.passo-box.aguardar  { border-color: rgba(99,102,241,0.45); }
.passo-box.avancar   { border-color: rgba(59,130,246,0.45); }
.passo-box.transferir { border-color: rgba(249,115,22,0.45); }
.passo-box.encerrar  { border-color: rgba(239,68,68,0.45); }

.passo-top {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.passo-lbl {
  font-size: 9px; font-weight: 800;
  color: #6366F1; text-transform: uppercase; letter-spacing: 0.6px;
}
.passo-ico { opacity: 0.5; }

.passo-txt {
  flex: 1;
  font-size: 11px; color: #94a3b8; line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}

.passo-bot {
  margin-top: 8px; display: flex; justify-content: center;
}
.passo-tag {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.4px; padding: 2px 10px; border-radius: 20px;
}
.passo-tag.aguardar  { background: rgba(99,102,241,0.12); color: #818CF8; }
.passo-tag.avancar   { background: rgba(59,130,246,0.12); color: #60A5FA; }
.passo-tag.transferir { background: rgba(249,115,22,0.12); color: #FB923C; }
.passo-tag.encerrar  { background: rgba(239,68,68,0.12); color: #F87171; }

/* ── Side Panel ────────────────────────────────── */
.fe-panel {
  width: 288px; flex-shrink: 0;
  background: #0f1929;
  border-left: 1px solid rgba(255,255,255,0.07);
  padding: 16px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px;
}
.fe-ph {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; font-weight: 700; color: #818CF8;
  margin-bottom: 12px; padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}

.slide-in-enter-active, .slide-in-leave-active {
  transition: width 0.2s ease, opacity 0.2s;
}
.slide-in-enter-from, .slide-in-leave-to {
  width: 0; opacity: 0; padding: 0; overflow: hidden;
}

/* ── Utils ─────────────────────────────────────── */
.lbl {
  display: block;
  font-size: 10px; font-weight: 700; color: #4b5563;
  text-transform: uppercase; letter-spacing: 0.5px;
  margin-bottom: 6px;
}
.lbl.mt3 { margin-top: 14px; }

.rg { display: flex; flex-direction: column; gap: 2px; }
.ro {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 7px;
  cursor: pointer; font-size: 12px; color: #94a3b8;
  border: 1px solid transparent; transition: all 0.12s;
}
.ro input[type="radio"] { accent-color: #6366F1; }
.ro:hover { background: rgba(255,255,255,0.03); }
.ro.on {
  background: rgba(99,102,241,0.08);
  border-color: rgba(99,102,241,0.25);
  color: #c7d2fe;
}

.hint {
  font-size: 11px; color: #374151; line-height: 1.5; margin-bottom: 8px;
}
.elist { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.elist-empty {
  font-size: 11px; color: #1f2937; text-align: center;
  padding: 10px; border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;
}
.erow {
  display: flex; align-items: center; gap: 6px;
  background: rgba(0,0,0,0.25); border-radius: 7px; padding: 5px 8px;
}
.echip {
  background: rgba(99,102,241,0.2); color: #818CF8;
  font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: 12px;
  min-width: 28px; text-align: center;
}
.edest { flex: 1; font-size: 11px; color: #4b5563; }
</style>
