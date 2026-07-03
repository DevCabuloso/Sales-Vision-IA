<template>
  <div class="fe-shell">

    <!-- ── Toolbar ─────────────────────────────────────────── -->
    <div class="fe-toolbar">
      <v-btn icon="mdi-arrow-left" variant="text" size="small" @click="$router.push('/flows')" />
      <span class="fe-title">{{ flow?.name || 'Carregando…' }}</span>
      <v-chip
        :color="flow?.status === 'active' ? 'success' : 'default'"
        size="x-small" variant="tonal" class="ml-1"
      >{{ flow?.status === 'active' ? 'Ativo' : 'Inativo' }}</v-chip>
      <v-spacer />
      <v-btn size="small" variant="tonal" prepend-icon="mdi-cog-outline" @click="openSettings">Configurações</v-btn>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save-outline" :loading="saving" @click="save">Salvar</v-btn>
    </div>

    <!-- ── Body ───────────────────────────────────────────── -->
    <div class="fe-body">

      <!-- ── Lista de nós ── -->
      <div class="fe-list-wrap" @click.self="selectedNode = null">
        <div class="fe-list">

          <!-- Badge de início -->
          <div class="fe-start-badge">
            <v-icon icon="mdi-play-circle" size="16" color="#22C55E" />
            Início do fluxo
          </div>

          <!-- Conector inicial -->
          <div class="fe-connector">
            <div class="fe-line" />
            <button class="fe-add-btn" title="Adicionar passo" @click="openAdd(0)">
              <v-icon icon="mdi-plus" size="14" />
            </button>
            <div class="fe-line" />
          </div>

          <!-- Nós -->
          <template v-for="(node, i) in nodes" :key="node.id">
            <div
              class="fe-node-card"
              :class="{ 'fe-node-card--selected': selectedNode?.id === node.id }"
              :style="{ borderColor: selectedNode?.id === node.id ? nodeMeta(node.tipo).color : nodeMeta(node.tipo).color + '44' }"
              @click="selectNode(node)"
            >
              <!-- Ícone do tipo -->
              <div class="fe-node-icon" :style="{ background: nodeMeta(node.tipo).color + '22', color: nodeMeta(node.tipo).color }">
                <v-icon :icon="nodeMeta(node.tipo).icon" size="17" />
              </div>

              <!-- Conteúdo -->
              <div class="fe-node-body">
                <div class="fe-node-tipo">{{ nodeMeta(node.tipo).label }}</div>
                <div class="fe-node-preview">{{ getPreview(node) }}</div>

                <!-- Regras de condição inline -->
                <div v-if="node.tipo === 'condicao' && node.regras?.length" class="fe-rules">
                  <div v-for="(r, ri) in node.regras.slice(0,3)" :key="ri" class="fe-rule-chip">
                    <span class="fe-rule-op">{{ r.operador }}</span>
                    <span v-if="!['vazio','não vazio'].includes(r.operador)" class="fe-rule-val">"{{ r.valor }}"</span>
                    <v-icon icon="mdi-arrow-right" size="10" />
                    <span class="fe-rule-dest">{{ nodeLabel(r.destino) }}</span>
                  </div>
                  <div v-if="node.regras.length > 3" class="fe-rule-more">+{{ node.regras.length - 3 }} mais</div>
                  <div v-if="node.padrao" class="fe-rule-chip fe-rule-chip--default">
                    <span class="fe-rule-op">padrão</span>
                    <v-icon icon="mdi-arrow-right" size="10" />
                    <span class="fe-rule-dest">{{ nodeLabel(node.padrao) }}</span>
                  </div>
                </div>
              </div>

              <!-- Ações -->
              <div class="fe-node-actions" @click.stop>
                <v-btn icon="mdi-delete-outline" variant="text" size="x-small" color="error"
                  :disabled="nodes.length <= 1" @click="deleteNode(node.id)" />
              </div>
            </div>

            <!-- Conector entre nós -->
            <div class="fe-connector">
              <div class="fe-line" />
              <button class="fe-add-btn" @click="openAdd(i + 1)">
                <v-icon icon="mdi-plus" size="14" />
              </button>
              <div class="fe-line" />
            </div>
          </template>

          <!-- Estado vazio -->
          <div v-if="!nodes.length" class="fe-empty">
            <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="openAdd(0)">
              Adicionar primeiro passo
            </v-btn>
          </div>
        </div>
      </div>

      <!-- ── Painel de configuração ── -->
      <transition name="slide-panel">
        <div v-if="selectedNode" class="fe-config" @click.stop>
          <div class="fe-config-header">
            <div class="fe-config-icon" :style="{ background: nodeMeta(selectedNode.tipo).color + '22', color: nodeMeta(selectedNode.tipo).color }">
              <v-icon :icon="nodeMeta(selectedNode.tipo).icon" size="18" />
            </div>
            <span class="fe-config-title">{{ nodeMeta(selectedNode.tipo).label }}</span>
            <v-spacer />
            <v-btn icon="mdi-close" variant="text" size="x-small" @click="selectedNode = null" />
          </div>

          <div class="fe-config-body">

            <!-- ── mensagem ── -->
            <template v-if="selectedNode.tipo === 'mensagem'">
              <label class="cfg-label">Mensagem</label>
              <v-textarea v-model="selectedNode.conteudo" variant="outlined" density="compact"
                rows="5" auto-grow hide-details placeholder="Olá {{nome}}, como posso te ajudar?" />
              <p class="cfg-hint mt-2">Use <code><span v-pre>{{variavel}}</span></code> para inserir valores capturados.</p>
            </template>

            <!-- ── captura ── -->
            <template v-else-if="selectedNode.tipo === 'captura'">
              <label class="cfg-label">Pergunta ao usuário</label>
              <v-textarea v-model="selectedNode.pergunta" variant="outlined" density="compact"
                rows="3" auto-grow hide-details placeholder="Qual é o seu nome?" />
              <label class="cfg-label mt-3">Salvar resposta em variável</label>
              <v-text-field v-model="selectedNode.variavel" variant="outlined" density="compact"
                hide-details :prefix="OB" :suffix="CB" placeholder="nome" />
              <p class="cfg-hint mt-2">Reutilize com <code>{{ OB + (selectedNode.variavel || 'variavel') + CB }}</code>.</p>
            </template>

            <!-- ── condição ── -->
            <template v-else-if="selectedNode.tipo === 'condicao'">
              <label class="cfg-label">Variável a avaliar (opcional)</label>
              <v-text-field v-model="selectedNode.variavel" variant="outlined" density="compact"
                hide-details :prefix="OB" :suffix="CB" placeholder="opcao"
                hint="Deixe vazio para avaliar a última resposta do usuário" persistent-hint />

              <label class="cfg-label mt-4">Regras</label>
              <div v-for="(regra, ri) in selectedNode.regras" :key="ri" class="regra-row">
                <v-select v-model="regra.operador" :items="OPERATORS"
                  variant="outlined" density="compact" hide-details label="Condição" style="flex:1.2" />
                <v-text-field
                  v-if="!['vazio','não vazio'].includes(regra.operador)"
                  v-model="regra.valor" variant="outlined" density="compact"
                  hide-details label="Valor" style="flex:1" />
                <v-select v-model="regra.destino" :items="nodeSelectOptions" item-title="label" item-value="id"
                  variant="outlined" density="compact" hide-details label="Ir para" style="flex:1.2" />
                <v-btn icon="mdi-close" variant="text" size="x-small" color="error" @click="removeRegra(ri)" />
              </div>
              <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" class="mt-2" @click="addRegra">
                Adicionar regra
              </v-btn>

              <label class="cfg-label mt-4">Padrão (nenhuma regra atendida)</label>
              <v-select v-model="selectedNode.padrao" :items="nodeSelectOptions" item-title="label" item-value="id"
                variant="outlined" density="compact" hide-details clearable placeholder="Nenhum (encerra)" />
            </template>

            <!-- ── webhook ── -->
            <template v-else-if="selectedNode.tipo === 'webhook'">
              <label class="cfg-label">URL</label>
              <v-text-field v-model="selectedNode.url" variant="outlined" density="compact"
                hide-details placeholder="https://api.exemplo.com/consultar" />

              <label class="cfg-label mt-3">Método</label>
              <v-select v-model="selectedNode.metodo" :items="['POST','GET','PUT','PATCH','DELETE']"
                variant="outlined" density="compact" hide-details />

              <label class="cfg-label mt-3">Body (JSON, opcional)</label>
              <v-textarea v-model="selectedNode.corpo" variant="outlined" density="compact"
                rows="3" auto-grow hide-details placeholder='{ "nome": "{{nome}}" }' />

              <label class="cfg-label mt-3">Salvar resposta em variável (opcional)</label>
              <v-text-field v-model="selectedNode.variavel" variant="outlined" density="compact"
                hide-details :prefix="OB" :suffix="CB" placeholder="resposta_api" />
            </template>

            <!-- ── ia ── -->
            <template v-else-if="selectedNode.tipo === 'ia'">
              <div class="cfg-info-box">
                <v-icon icon="mdi-robot-outline" size="22" color="#8B5CF6" />
                <p>O agente de IA será chamado com o histórico completo da conversa e responderá ao usuário. O fluxo continuará no próximo passo após a resposta.</p>
              </div>
            </template>

            <!-- ── transferência ── -->
            <template v-else-if="selectedNode.tipo === 'transferencia'">
              <label class="cfg-label">Mensagem antes de transferir (opcional)</label>
              <v-textarea v-model="selectedNode.mensagem" variant="outlined" density="compact"
                rows="3" auto-grow hide-details placeholder="Aguarde, estou te conectando com um atendente…" />
              <div class="cfg-info-box mt-3">
                <v-icon icon="mdi-information-outline" size="18" color="#6b7c93" />
                <p>A conversa será marcada como atendimento humano e o chatbot encerrará.</p>
              </div>
            </template>

            <!-- ── delay ── -->
            <template v-else-if="selectedNode.tipo === 'delay'">
              <label class="cfg-label">Tempo de espera (segundos)</label>
              <v-text-field
                :model-value="Math.round((selectedNode.tempo || 1000) / 1000)"
                @update:model-value="v => selectedNode.tempo = (Number(v) || 1) * 1000"
                type="number" min="1" max="300" variant="outlined" density="compact" hide-details />
              <p class="cfg-hint mt-2">O fluxo continuará automaticamente após o tempo definido.</p>
            </template>

            <!-- ── encerrar ── -->
            <template v-else-if="selectedNode.tipo === 'encerrar'">
              <div class="cfg-info-box">
                <v-icon icon="mdi-stop-circle-outline" size="22" color="#EF4444" />
                <p>A sessão do chatbot será encerrada. O usuário poderá iniciar um novo fluxo enviando outra mensagem.</p>
              </div>
            </template>

            <!-- Destino do próximo passo (todos exceto condição e encerrar) -->
            <template v-if="!['condicao','encerrar','transferencia'].includes(selectedNode.tipo)">
              <label class="cfg-label mt-4">Próximo passo (opcional)</label>
              <v-select v-model="selectedNode.proximo" :items="otherNodeOptions" item-title="label" item-value="id"
                variant="outlined" density="compact" hide-details clearable
                placeholder="Sequência automática" />
              <p class="cfg-hint mt-1">Se vazio, executa o próximo passo na lista.</p>
            </template>
          </div>
        </div>
      </transition>
    </div>

    <!-- ── Dialog: escolher tipo de nó ── -->
    <v-dialog v-model="addDialog" max-width="480">
      <v-card class="dialog-card">
        <v-card-title class="pt-5 px-5 pb-2">Adicionar passo</v-card-title>
        <v-card-text class="px-4 pb-4">
          <div class="add-grid">
            <button v-for="t in NODE_TYPES" :key="t.tipo" class="add-type-btn" @click="addNode(t.tipo)">
              <div class="add-type-icon" :style="{ background: t.color + '22', color: t.color }">
                <v-icon :icon="t.icon" size="20" />
              </div>
              <div class="add-type-label">{{ t.label }}</div>
              <div class="add-type-desc">{{ t.desc }}</div>
            </button>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- ── Dialog: configurações do fluxo ── -->
    <v-dialog v-model="settingsDialog" max-width="500" persistent>
      <v-card class="dialog-card">
        <v-card-title class="pt-5 px-5">Configurações do Fluxo</v-card-title>
        <v-card-text class="px-5">
          <v-text-field v-model="flowSettings.name" label="Nome" variant="outlined" density="compact" class="mb-3" hide-details />
          <v-select v-model="flowSettings.status"
            :items="[{title:'Ativo',value:'active'},{title:'Inativo',value:'inactive'}]"
            label="Status" variant="outlined" density="compact" class="mb-3" hide-details />
          <v-combobox v-model="flowSettings.trigger_keywords"
            label="Palavras-gatilho" hint="Digite e pressione Enter para adicionar"
            variant="outlined" density="compact" chips multiple clearable class="mb-3" />
          <v-text-field v-model.number="flowSettings.timeout_minutes" type="number" min="1"
            label="Timeout (min sem resposta)" variant="outlined" density="compact" class="mb-3" hide-details />
          <v-text-field v-model="flowSettings.fallback_text"
            label="Mensagem ao expirar / sem rota" variant="outlined" density="compact" hide-details />
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
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { http } from '@/services/api'

// Usadas no template para evitar que o parser Vue interprete {{ }} literal
const OB = '{{'
const CB = '}}'

const route = useRoute()

// ─── Estado ──────────────────────────────────────────────────────────────────
const flow          = ref(null)
const nodes         = ref([])
const selectedNode  = ref(null)
const saving        = ref(false)
const addDialog     = ref(false)
const addAtIndex    = ref(0)
const settingsDialog = ref(false)
const flowSettings  = ref({})

// ─── Metadados dos tipos de nó ───────────────────────────────────────────────
const NODE_TYPES = [
  { tipo: 'mensagem',      label: 'Mensagem',       icon: 'mdi-message-text-outline',   color: '#6366F1', desc: 'Enviar texto ao usuário' },
  { tipo: 'captura',       label: 'Capturar dado',  icon: 'mdi-form-textbox',           color: '#3B82F6', desc: 'Fazer pergunta e salvar resposta' },
  { tipo: 'condicao',      label: 'Condição',        icon: 'mdi-source-branch',          color: '#EC4899', desc: 'Ramificar baseado em variável ou resposta' },
  { tipo: 'ia',            label: 'IA',              icon: 'mdi-robot-outline',          color: '#8B5CF6', desc: 'Chamar agente de IA com histórico' },
  { tipo: 'webhook',       label: 'Webhook',         icon: 'mdi-api',                   color: '#F59E0B', desc: 'Consultar API externa' },
  { tipo: 'transferencia', label: 'Transferir',      icon: 'mdi-account-arrow-right',   color: '#F97316', desc: 'Passar para atendente humano' },
  { tipo: 'delay',         label: 'Aguardar',        icon: 'mdi-timer-outline',          color: '#10B981', desc: 'Pausa antes de continuar' },
  { tipo: 'encerrar',      label: 'Encerrar',        icon: 'mdi-stop-circle-outline',   color: '#EF4444', desc: 'Finalizar o fluxo' },
]

const TYPE_MAP = Object.fromEntries(NODE_TYPES.map(t => [t.tipo, t]))

const OPERATORS = ['igual', 'diferente', 'contém', 'não contém', 'maior', 'menor', 'regex', 'vazio', 'não vazio']

function nodeMeta(tipo) {
  return TYPE_MAP[tipo] || { label: tipo, icon: 'mdi-help-circle-outline', color: '#6b7c93' }
}

// ─── Preview inline dos nós ──────────────────────────────────────────────────
function getPreview(node) {
  switch (node.tipo) {
    case 'mensagem':      return (node.conteudo || '').slice(0, 60) || 'Sem texto'
    case 'captura':       return node.pergunta ? `"${node.pergunta.slice(0, 50)}"` : 'Pergunta não definida'
    case 'condicao':      return node.variavel ? `Avaliando {{${node.variavel}}}` : 'Avaliando última resposta'
    case 'ia':            return 'Resposta via IA'
    case 'webhook':       return node.url ? `${node.metodo || 'POST'} ${node.url.slice(0, 45)}` : 'URL não definida'
    case 'transferencia': return node.mensagem ? `"${node.mensagem.slice(0, 50)}"` : 'Transferir para humano'
    case 'delay':         return `Aguardar ${Math.round((node.tempo || 1000) / 1000)}s`
    case 'encerrar':      return 'Encerrar sessão'
    default:              return ''
  }
}

// ─── Opções de nós para selects de destino ───────────────────────────────────
const nodeSelectOptions = computed(() =>
  nodes.value.map((n, i) => ({
    id:    n.id,
    label: `${i + 1}. ${nodeMeta(n.tipo).label}${n.conteudo ? ' — ' + n.conteudo.slice(0, 30) : n.pergunta ? ' — ' + n.pergunta.slice(0, 30) : ''}`,
  }))
)

const otherNodeOptions = computed(() =>
  nodeSelectOptions.value.filter(o => o.id !== selectedNode.value?.id)
)

function nodeLabel(id) {
  const found = nodeSelectOptions.value.find(o => o.id === id)
  return found ? found.label.slice(0, 30) : id
}

// ─── Carregar ────────────────────────────────────────────────────────────────
onMounted(async () => {
  const { data } = await http.get(`/flows/${route.params.id}`)
  flow.value = data.flow
  nodes.value = data.flow.nodes || []
  flowSettings.value = {
    name:             data.flow.name,
    status:           data.flow.status,
    trigger_keywords: data.flow.trigger_keywords || [],
    timeout_minutes:  data.flow.timeout_minutes  || 30,
    fallback_text:    data.flow.fallback_text    || '',
  }
})

// ─── Selecionar nó ────────────────────────────────────────────────────────────
function selectNode(node) {
  selectedNode.value = node
}

// ─── Adicionar nó ────────────────────────────────────────────────────────────
function openAdd(atIndex) {
  addAtIndex.value = atIndex
  addDialog.value  = true
}

const NODE_TEMPLATES = {
  mensagem:      (id) => ({ id, tipo: 'mensagem',      conteudo: '' }),
  captura:       (id) => ({ id, tipo: 'captura',       pergunta: '', variavel: '' }),
  condicao:      (id) => ({ id, tipo: 'condicao',      variavel: '', regras: [], padrao: '' }),
  ia:            (id) => ({ id, tipo: 'ia' }),
  webhook:       (id) => ({ id, tipo: 'webhook',       url: '', metodo: 'POST', corpo: '', variavel: '' }),
  transferencia: (id) => ({ id, tipo: 'transferencia', mensagem: '' }),
  delay:         (id) => ({ id, tipo: 'delay',         tempo: 3000 }),
  encerrar:      (id) => ({ id, tipo: 'encerrar' }),
}

function addNode(tipo) {
  const id      = `n_${Date.now()}`
  const newNode = (NODE_TEMPLATES[tipo] || ((i) => ({ id: i, tipo })))(id)
  const arr     = [...nodes.value]
  arr.splice(addAtIndex.value, 0, newNode)
  nodes.value  = arr
  addDialog.value = false
  selectedNode.value = newNode
}

// ─── Deletar nó ──────────────────────────────────────────────────────────────
function deleteNode(nodeId) {
  nodes.value = nodes.value.filter(n => n.id !== nodeId)
  if (selectedNode.value?.id === nodeId) selectedNode.value = null
}

// ─── Regras de condição ───────────────────────────────────────────────────────
function addRegra() {
  if (!selectedNode.value.regras) selectedNode.value.regras = []
  selectedNode.value.regras.push({ operador: 'igual', valor: '', destino: '' })
}

function removeRegra(idx) {
  selectedNode.value.regras.splice(idx, 1)
}

// ─── Configurações ───────────────────────────────────────────────────────────
function openSettings() {
  flowSettings.value = {
    name:             flow.value.name,
    status:           flow.value.status,
    trigger_keywords: flow.value.trigger_keywords || [],
    timeout_minutes:  flow.value.timeout_minutes  || 30,
    fallback_text:    flow.value.fallback_text    || '',
  }
  settingsDialog.value = true
}

function applySettings() {
  Object.assign(flow.value, flowSettings.value)
  settingsDialog.value = false
}

// ─── Salvar ──────────────────────────────────────────────────────────────────
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
      edges:            [],
    })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
/* ── Shell ─────────────────────────────────────────── */
.fe-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #0d1117;
  color: #e2e8f0;
}

/* ── Toolbar ───────────────────────────────────────── */
.fe-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #141c2d;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
  z-index: 10;
}
.fe-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

/* ── Body ──────────────────────────────────────────── */
.fe-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Lista de nós ─────────────────────────────────── */
.fe-list-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 32px 24px;
  display: flex;
  justify-content: center;
}

.fe-list {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

/* Badge início */
.fe-start-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  align-self: center;
  background: rgba(34,197,94,0.1);
  border: 1px solid rgba(34,197,94,0.3);
  border-radius: 20px;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #22C55E;
}

/* Conector com botão "+" */
.fe-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.fe-line {
  width: 2px;
  height: 16px;
  background: rgba(255,255,255,0.1);
}
.fe-add-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  color: #6b7c93;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}
.fe-add-btn:hover {
  background: rgba(99,102,241,0.2);
  border-color: #6366F1;
  color: #818CF8;
}

/* Card do nó */
.fe-node-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 14px;
  background: #141c2d;
  border: 1.5px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.fe-node-card:hover {
  box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
}
.fe-node-card--selected {
  box-shadow: 0 0 0 3px rgba(99,102,241,0.2);
}

.fe-node-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.fe-node-body { flex: 1; min-width: 0; }
.fe-node-tipo {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #6b7c93;
  margin-bottom: 3px;
}
.fe-node-preview {
  font-size: 13px;
  color: #c8d6e5;
  line-height: 1.45;
  word-break: break-word;
}

/* Regras de condição dentro do card */
.fe-rules { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.fe-rule-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(255,255,255,0.05);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  width: fit-content;
}
.fe-rule-chip--default { opacity: 0.6; }
.fe-rule-op  { color: #EC4899; font-weight: 600; }
.fe-rule-val { color: #94a3b8; }
.fe-rule-dest { color: #818CF8; }
.fe-rule-more { font-size: 11px; color: #4b5563; }

.fe-node-actions { flex-shrink: 0; opacity: 0; transition: opacity 0.15s; }
.fe-node-card:hover .fe-node-actions { opacity: 1; }

/* Estado vazio */
.fe-empty {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

/* ── Painel de config ──────────────────────────────── */
.fe-config {
  width: 320px;
  flex-shrink: 0;
  background: #141c2d;
  border-left: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fe-config-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.fe-config-icon {
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
}
.fe-config-title { font-size: 13px; font-weight: 700; color: #e2e8f0; }

.fe-config-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* Labels e hints */
.cfg-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6b7c93;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}
.cfg-hint {
  font-size: 11px;
  color: #4b5563;
  line-height: 1.4;
}
.cfg-hint code {
  background: rgba(255,255,255,0.07);
  border-radius: 4px;
  padding: 1px 5px;
  color: #818CF8;
  font-size: 11px;
}
.cfg-info-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
  padding: 12px;
}
.cfg-info-box p {
  font-size: 12px;
  color: #6b7c93;
  line-height: 1.5;
  margin: 0;
}

/* Regras no painel */
.regra-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

/* ── Transição painel ──────────────────────────────── */
.slide-panel-enter-active,
.slide-panel-leave-active { transition: all 0.2s ease; }
.slide-panel-enter-from,
.slide-panel-leave-to     { transform: translateX(100%); opacity: 0; }

/* ── Dialog: add node ─────────────────────────────── */
.dialog-card { background: #141C2D !important; }

.add-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.add-type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 10px;
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.add-type-btn:hover {
  background: rgba(99,102,241,0.1);
  border-color: rgba(99,102,241,0.4);
}
.add-type-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}
.add-type-label {
  font-size: 12px; font-weight: 600; color: #e2e8f0;
}
.add-type-desc {
  font-size: 10px; color: #6b7c93; line-height: 1.3;
}
</style>
