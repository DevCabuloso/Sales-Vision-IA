<template>
  <div class="fe-shell">

    <!-- Editor de nós/conexões: arrastar, conectar e dar zoom não funciona
         bem em touch (mesmo apps grandes tipo n8n recomendam desktop) —
         em telas pequenas mostra um aviso em vez de um canvas quebrado. -->
    <div v-if="isMobile" class="fe-mobile-notice">
      <v-icon icon="mdi-monitor-dashboard" size="48" style="opacity:.35" class="mb-4" />
      <h2 class="text-h6 font-weight-bold mb-2">Melhor em uma tela maior</h2>
      <p class="text-body-2 mb-6" style="color:#9FB0BC">
        O editor de fluxos usa arrastar e soltar para conectar nós — funciona melhor num computador ou tablet.
        Acesse por lá pra editar "{{ flow?.name || 'este fluxo' }}".
      </p>
      <v-btn color="primary" prepend-icon="mdi-arrow-left" @click="$router.push('/flows')">Voltar para Fluxos</v-btn>
    </div>

    <template v-else>

    <!-- Toolbar -->
    <div class="fe-toolbar">
      <v-btn icon="mdi-arrow-left" variant="text" size="small" @click="$router.push('/flows')" />
      <span class="fe-title">{{ flow?.name || 'Carregando…' }}</span>
      <v-chip :color="flow?.status === 'active' ? 'success' : 'default'" size="x-small" variant="tonal">
        {{ flow?.status === 'active' ? 'Ativo' : 'Inativo' }}
      </v-chip>
      <v-spacer />
      <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addNode">Novo Nó</v-btn>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-auto-fix" @click="autoLayout">Organizar</v-btn>
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
        :min-zoom="0.2"
        :max-zoom="2"
        :default-edge-options="defaultEdgeOpts"
        :delete-key-code="null"
        class="fe-canvas"
        @connect="onConnect"
        @node-click="onNodeClick"
        @pane-click="onPaneClick"
        @nodes-change="onNodesChange"
      >
        <template #node-passo="{ id, data, selected }">
          <div class="passo-wrap nodrag-container">
            <Handle type="target" :position="Position.Top" id="hin" />

            <div class="passo-box" :class="[data.passo.saida, { sel: selected }]">

              <!-- Cabeçalho -->
              <div class="passo-head">
                <span class="passo-lbl">{{ nodeIndex(id) === 0 ? '▶ INÍCIO' : 'NÓ ' + (nodeIndex(id) + 1) }}</span>
                <div class="passo-btns nodrag">
                  <button class="nb edit nodrag" @click.stop="selectNode(id)" title="Editar">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="nb del nodrag" @click.stop="deleteNode(id)" title="Deletar">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              <!-- Mensagem -->
              <div class="passo-msg">{{ data.passo.mensagem || '(sem mensagem)' }}</div>

              <!-- Opções de resposta -->
              <div v-if="data.passo.saida === 'aguardar'" class="passo-opts nodrag">
                <div class="opts-chips">
                  <div
                    v-for="(r, ri) in (data.passo.respostas || [])"
                    :key="ri"
                    class="opt-chip"
                  >
                    <span class="opt-txt">{{ r.texto }}</span>
                    <button class="opt-x nodrag" @click.stop="removeOption(id, ri, data)">×</button>
                  </div>

                  <!-- Input inline para nova opção -->
                  <div v-if="addingOpt[id]" class="opt-chip opt-input-chip">
                    <input
                      :ref="el => setInputRef(id, el)"
                      class="opt-input nodrag"
                      v-model="newOptText[id]"
                      placeholder="ex: 1"
                      @keyup.enter.stop="commitOpt(id, data)"
                      @keyup.escape.stop="cancelOpt(id)"
                      @blur="blurOpt(id, data)"
                    />
                  </div>

                  <button
                    v-if="!addingOpt[id]"
                    class="opt-add nodrag"
                    @click.stop="startOpt(id)"
                  >+ opção</button>
                </div>
              </div>

              <!-- Rodapé -->
              <div class="passo-foot">
                <span class="passo-tag" :class="data.passo.saida">{{ saidaLabel(data.passo.saida) }}</span>
              </div>
            </div>

            <Handle type="source" :position="Position.Bottom" id="hout" />
          </div>
        </template>
      </VueFlow>

      <!-- Painel lateral de edição -->
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

          <template v-if="selectedNode.data.passo.saida === 'aguardar'">
            <label class="lbl mt3">Opções / rotas de resposta</label>
            <p class="hint">Crie opções pelo nó ou aqui. Depois arraste o ponto inferior para conectar ao nó destino.</p>

            <div class="elist">
              <div v-for="e in nodeOutEdges(selectedNode.id)" :key="e.id" class="erow">
                <span class="echip">{{ e.label }}</span>
                <span class="edest">→ Nó {{ nodeIndex(e.target) + 1 }}</span>
                <v-btn icon="mdi-close" size="x-small" variant="text" color="error" @click="removeEdge(e.id)" />
              </div>
              <div v-if="!nodeOutEdges(selectedNode.id).length" class="elist-empty">
                Nenhuma rota ainda — arraste o ponto inferior do nó
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

          <template v-if="selectedNode.data.passo.saida === 'transferir'">
            <label class="lbl mt3">Mensagem antes de transferir</label>
            <v-text-field
              v-model="selectedNode.data.passo.msg_transferencia"
              variant="outlined" density="compact"
              hide-details placeholder="Opcional"
            />
            <label class="lbl mt3">Transferir para a fila</label>
            <v-select
              v-model="selectedNode.data.passo.queue_id"
              :items="queues" item-title="name" item-value="id"
              variant="outlined" density="compact" hide-details clearable
              placeholder="Sem fila específica"
            />
          </template>
        </div>
      </transition>
    </div>

    <!-- Dialog: nova conexão -->
    <v-dialog v-model="connectDialog" max-width="380" persistent>
      <v-card style="background:#141C2D">
        <v-card-title class="pt-4 px-5" style="font-size:15px">Nova Conexão</v-card-title>
        <v-card-text class="px-5 pb-1">
          <p style="font-size:12px;color:#94a3b8;margin-bottom:12px">
            Qual resposta ativa esta rota?<br>
            Ex: <strong>1</strong>, <strong>2</strong>, <strong>sim</strong>, <strong>vendas</strong>
          </p>

          <!-- Quick-pick das opções já criadas no nó -->
          <div v-if="pendingOpts.length" style="margin-bottom:12px">
            <p style="font-size:11px;color:#4b5563;margin-bottom:6px">Opções do nó:</p>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              <button
                v-for="o in pendingOpts" :key="o"
                class="qopt" :class="{ active: connectText === o }"
                @click="connectText = o"
              >{{ o }}</button>
            </div>
          </div>

          <v-text-field
            v-model="connectText"
            variant="outlined" density="compact"
            label="Ou digite a resposta (vazio = padrão)"
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

    </template>

  </div>
</template>

<script setup>
import '@vue-flow/core/dist/style.css'
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { VueFlow, Handle, Position, MarkerType, useVueFlow } from '@vue-flow/core'
import { http } from '@/services/api'
import { useIsMobile } from '@/composables/useIsMobile'

const route = useRoute()
const { isMobile } = useIsMobile()
const { fitView } = useVueFlow({ id: 'chatflow' })

// ── State ─────────────────────────────────────────────────────────────────────
const flow           = ref(null)
const vfNodes        = ref([])
const vfEdges        = ref([])
const selectedNode   = ref(null)
const saving         = ref(false)
const settingsDialog = ref(false)
const flowCfg        = ref({})
const queues          = ref([])

const connectDialog = ref(false)
const connectText   = ref('')
const pending       = ref(null)

// Estado de adicionar opção inline por nó
const addingOpt  = ref({})   // { [nodeId]: bool }
const newOptText = ref({})   // { [nodeId]: string }
const inputRefs  = ref({})   // { [nodeId]: HTMLInputElement }

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
}

// Opções do nó de origem ao abrir o connect dialog
const pendingOpts = computed(() => {
  if (!pending.value) return []
  const src = vfNodes.value.find(n => n.id === pending.value.source)
  return (src?.data?.passo?.respostas || []).map(r => r.texto).filter(Boolean)
})

// ── Load ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  http.get('/queues').then(({ data }) => { queues.value = data.queues }).catch(() => {})

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
  return { id: id || `p_${Date.now()}`, tipo: 'passo', mensagem: '', saida: 'aguardar', respostas: [], padrao: '', msg_transferencia: '' }
}
function toNode(passo, i) {
  return {
    id: passo.id, type: 'passo',
    position: passo._pos || { x: 80 + i * 240, y: 120 },
    data: { passo: { ...passo, respostas: [...(passo.respostas || [])] } },
    selectable: true, draggable: true,
  }
}
function mkEdge(source, target, respText) {
  const isDef = !respText
  return {
    id:    `e-${source}-${respText || 'def'}-${target}`,
    source, target,
    label: respText || '...',
    type:  'smoothstep', animated: false, selectable: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: isDef ? '#6b7280' : '#6366F1' },
    style: { stroke: isDef ? '#6b7280' : '#6366F1', strokeWidth: 2 },
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
function nodeIndex(id) { return vfNodes.value.findIndex(n => n.id === id) }
function nodeOutEdges(nid) { return vfEdges.value.filter(e => e.source === nid) }
function saidaLabel(s) {
  return { aguardar: 'Aguarda', avancar: 'Avança', transferir: 'Transfere', encerrar: 'Encerra' }[s] || s
}

// ── Canvas events ─────────────────────────────────────────────────────────────
function onNodeClick(event, node) {
  const id = node?.id
  selectedNode.value = id ? (vfNodes.value.find(n => n.id === id) || null) : null
}
function onPaneClick() { selectedNode.value = null }
function onNodesChange(changes) {
  for (const c of changes) {
    if (c.type === 'remove' && c.id === selectedNode.value?.id) selectedNode.value = null
  }
}

// Selecionar nó via botão editar
function selectNode(id) {
  selectedNode.value = vfNodes.value.find(n => n.id === id) || null
}

// ── Opções inline no nó ───────────────────────────────────────────────────────
function setInputRef(id, el) {
  if (el) inputRefs.value[id] = el
}

function startOpt(id) {
  addingOpt.value = { ...addingOpt.value, [id]: true }
  newOptText.value = { ...newOptText.value, [id]: '' }
  nextTick(() => inputRefs.value[id]?.focus())
}

function commitOpt(id, data) {
  const txt = (newOptText.value[id] || '').trim()
  if (txt) {
    if (!data.passo.respostas) data.passo.respostas = []
    data.passo.respostas.push({ texto: txt, destino: '' })
    // Força update no nó reativo
    const node = vfNodes.value.find(n => n.id === id)
    if (node) node.data.passo.respostas = [...data.passo.respostas]
  }
  addingOpt.value = { ...addingOpt.value, [id]: false }
}

function cancelOpt(id) {
  addingOpt.value = { ...addingOpt.value, [id]: false }
}

let _blurTimer = null
function blurOpt(id, data) {
  _blurTimer = setTimeout(() => commitOpt(id, data), 120)
}

function removeOption(id, ri, data) {
  const node = vfNodes.value.find(n => n.id === id)
  if (!node) return
  node.data.passo.respostas = node.data.passo.respostas.filter((_, i) => i !== ri)
}

// ── Connect ───────────────────────────────────────────────────────────────────
function onConnect(params) {
  if (params.source === params.target) return
  pending.value     = params
  connectText.value = ''
  connectDialog.value = true
}
function confirmConnect() {
  if (!pending.value) return
  const { source, target } = pending.value
  const txt = connectText.value.trim()
  vfEdges.value = vfEdges.value.filter(e => !(e.source === source && (e.data?.respText || '') === txt))
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

// ── Auto Layout ───────────────────────────────────────────────────────────────
function autoLayout() {
  const W = 200, H = 180, HG = 90, VG = 100
  const children = {}, hasParent = new Set()
  for (const n of vfNodes.value) children[n.id] = []
  for (const e of vfEdges.value) {
    children[e.source]?.push(e.target)
    hasParent.add(e.target)
  }
  let roots = vfNodes.value.filter(n => !hasParent.has(n.id))
  if (!roots.length && vfNodes.value.length) roots = [vfNodes.value[0]]

  const visited = new Set(), levels = []
  const queue = roots.map(n => ({ id: n.id, level: 0 }))
  while (queue.length) {
    const { id, level } = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)
    if (!levels[level]) levels[level] = []
    levels[level].push(id)
    for (const cid of (children[id] || [])) {
      if (!visited.has(cid)) queue.push({ id: cid, level: level + 1 })
    }
  }
  const orphans = vfNodes.value.filter(n => !visited.has(n.id)).map(n => n.id)
  if (orphans.length) levels.push(orphans)

  const pos = {}
  for (let lv = 0; lv < levels.length; lv++) {
    const ids = levels[lv]
    const totalW = ids.length * W + (ids.length - 1) * HG
    const startX = -totalW / 2 + W / 2
    for (let i = 0; i < ids.length; i++) {
      pos[ids[i]] = { x: startX + i * (W + HG), y: lv * (H + VG) + 60 }
    }
  }
  vfNodes.value = vfNodes.value.map(n => ({ ...n, position: pos[n.id] ?? n.position }))
  setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
}

// ── Add / Delete node ─────────────────────────────────────────────────────────
function addNode() {
  const id = `p_${Date.now()}`
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

      // Opções criadas no nó mas sem fio ainda ficam com destino ''
      const edgeTexts = new Set(p.respostas.map(r => r.texto))
      for (const r of (node.data.passo.respostas || [])) {
        if (!edgeTexts.has(r.texto)) p.respostas.push({ texto: r.texto, destino: r.destino || '' })
      }

      const defEdge = outEdges.find(e => !e.data?.respText)
      if (defEdge) p.padrao = defEdge.target

      if (outEdges.length > 0 && !['transferir', 'encerrar'].includes(p.saida)) p.saida = 'aguardar'
      return p
    })
    await http.patch(`/flows/${route.params.id}`, {
      name: flow.value.name, status: flow.value.status,
      trigger_keywords: flow.value.trigger_keywords,
      timeout_minutes: flow.value.timeout_minutes,
      fallback_text: flow.value.fallback_text,
      nodes, edges: [],
    })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.fe-shell {
  display: flex; flex-direction: column;
  height: 100%; overflow: hidden;
  background: #080e1a; color: #e2e8f0;
}

.fe-mobile-notice {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 32px 24px;
}

/* Toolbar */
.fe-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; background: #0f1929;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0; z-index: 10;
}
.fe-title { font-size: 14px; font-weight: 600; }

/* Canvas */
.fe-canvas-area { flex: 1; display: flex; overflow: hidden; }
.fe-canvas { flex: 1; }

:deep(.vue-flow) { background: #080e1a; }
:deep(.vue-flow__pane) {
  background-image: radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px);
  background-size: 28px 28px;
}
:deep(.vue-flow__handle) {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2.5px solid #6366F1; background: #080e1a;
  transition: background 0.15s, transform 0.15s; cursor: crosshair;
}
:deep(.vue-flow__handle:hover),
:deep(.vue-flow__handle.connecting) { background: #6366F1; transform: scale(1.5); }
:deep(.vue-flow__handle-target) { border-color: #22C55E; }
:deep(.vue-flow__edge-path) { stroke-width: 2; }
:deep(.vue-flow__edge.selected .vue-flow__edge-path) { stroke: #818CF8 !important; stroke-width: 3; }
:deep(.vue-flow__edge-text) { font-size: 12px; font-weight: 700; }

/* ── Nó ───────────────────────────────────────── */
.passo-wrap {
  position: relative;
  width: 200px;
}

.passo-box {
  width: 200px;
  min-height: 140px;
  border-radius: 14px;
  border: 2px solid rgba(255,255,255,0.1);
  background: #0f1929;
  display: flex; flex-direction: column;
  padding: 10px 12px 10px;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  user-select: none;
}
.passo-box.sel { box-shadow: 0 0 0 3px rgba(99,102,241,0.35); border-color: #6366F1 !important; }
.passo-box.aguardar  { border-color: rgba(99,102,241,0.5); }
.passo-box.avancar   { border-color: rgba(59,130,246,0.5); }
.passo-box.transferir { border-color: rgba(249,115,22,0.5); }
.passo-box.encerrar  { border-color: rgba(239,68,68,0.5); }

/* Cabeçalho do nó */
.passo-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 7px;
}
.passo-lbl {
  font-size: 9px; font-weight: 800; color: #6366F1;
  text-transform: uppercase; letter-spacing: 0.7px;
}
.passo-btns { display: flex; gap: 4px; }
.nb {
  width: 20px; height: 20px; border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.12s;
  color: #6b7c93; padding: 0;
}
.nb:hover { background: rgba(255,255,255,0.08); }
.nb.edit:hover { color: #818CF8; border-color: rgba(99,102,241,0.4); }
.nb.del:hover  { color: #F87171; border-color: rgba(239,68,68,0.4); background: rgba(239,68,68,0.08); }

/* Texto da mensagem */
.passo-msg {
  font-size: 11px; color: #94a3b8; line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  margin-bottom: 8px;
  flex: 1;
}

/* Opções de resposta */
.passo-opts { margin-bottom: 8px; }
.opts-chips {
  display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
}
.opt-chip {
  display: flex; align-items: center; gap: 3px;
  background: rgba(99,102,241,0.15);
  border: 1px solid rgba(99,102,241,0.3);
  border-radius: 20px;
  padding: 2px 6px 2px 8px;
  font-size: 10px; color: #818CF8; font-weight: 700;
}
.opt-txt { line-height: 1; }
.opt-x {
  width: 14px; height: 14px; border-radius: 50%;
  border: none; background: rgba(239,68,68,0.15);
  color: #F87171; font-size: 11px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; padding: 0; margin: 0;
  transition: background 0.12s;
}
.opt-x:hover { background: rgba(239,68,68,0.35); }

.opt-input-chip {
  background: rgba(99,102,241,0.08);
  border-color: rgba(99,102,241,0.5);
  padding: 2px 8px;
}
.opt-input {
  border: none; outline: none; background: transparent;
  color: #c7d2fe; font-size: 10px; font-weight: 700;
  width: 55px; line-height: 1;
}
.opt-input::placeholder { color: rgba(99,102,241,0.4); }

.opt-add {
  border: 1px dashed rgba(99,102,241,0.3);
  border-radius: 20px;
  padding: 2px 8px;
  font-size: 10px; color: rgba(99,102,241,0.6);
  font-weight: 600; cursor: pointer;
  background: transparent;
  transition: all 0.12s;
}
.opt-add:hover {
  background: rgba(99,102,241,0.1);
  color: #818CF8; border-color: rgba(99,102,241,0.5);
}

/* Rodapé */
.passo-foot { display: flex; justify-content: center; }
.passo-tag {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.4px; padding: 2px 10px; border-radius: 20px;
}
.passo-tag.aguardar  { background: rgba(99,102,241,0.12); color: #818CF8; }
.passo-tag.avancar   { background: rgba(59,130,246,0.12); color: #60A5FA; }
.passo-tag.transferir { background: rgba(249,115,22,0.12); color: #FB923C; }
.passo-tag.encerrar  { background: rgba(239,68,68,0.12); color: #F87171; }

/* ── Painel lateral ────────────────────────────── */
.fe-panel {
  width: 288px; flex-shrink: 0;
  background: #0f1929;
  border-left: 1px solid rgba(255,255,255,0.07);
  padding: 16px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px;
}
.fe-ph {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; font-weight: 700; color: #818CF8;
  margin-bottom: 12px; padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.slide-in-enter-active, .slide-in-leave-active { transition: width 0.2s, opacity 0.2s; }
.slide-in-enter-from, .slide-in-leave-to { width: 0; opacity: 0; padding: 0; overflow: hidden; }

/* ── Formulário painel ─────────────────────────── */
.lbl {
  display: block; font-size: 10px; font-weight: 700; color: #4b5563;
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;
}
.lbl.mt3 { margin-top: 14px; }
.rg { display: flex; flex-direction: column; gap: 2px; }
.ro {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 7px; cursor: pointer;
  font-size: 12px; color: #94a3b8;
  border: 1px solid transparent; transition: all 0.12s;
}
.ro input[type="radio"] { accent-color: #6366F1; }
.ro:hover { background: rgba(255,255,255,0.03); }
.ro.on { background: rgba(99,102,241,0.08); border-color: rgba(99,102,241,0.25); color: #c7d2fe; }
.hint { font-size: 11px; color: #374151; line-height: 1.5; margin-bottom: 8px; }
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
  padding: 2px 8px; border-radius: 12px; min-width: 28px; text-align: center;
}
.edest { flex: 1; font-size: 11px; color: #4b5563; }

/* ── Quick-pick no dialog ──────────────────────── */
.qopt {
  background: rgba(99,102,241,0.1);
  border: 1px solid rgba(99,102,241,0.3);
  border-radius: 20px; padding: 3px 12px;
  color: #818CF8; font-size: 12px; font-weight: 700;
  cursor: pointer; transition: all 0.12s;
}
.qopt:hover, .qopt.active {
  background: rgba(99,102,241,0.25);
  border-color: #6366F1; color: #c7d2fe;
}
</style>
