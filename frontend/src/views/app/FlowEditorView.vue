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
      <v-btn size="small" variant="tonal" prepend-icon="mdi-cog-outline" @click="settingsDialog = true">Configurações</v-btn>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save-outline" :loading="saving" @click="save">Salvar</v-btn>
    </div>

    <!-- Lista de passos -->
    <div class="fe-body">
      <div class="fe-scroll">
        <div class="fe-list">

          <!-- Indicador de início -->
          <div class="fe-start">
            <v-icon icon="mdi-play-circle" size="15" color="#22C55E" />
            Início do fluxo
          </div>
          <div class="fe-arrow">↓</div>

          <!-- Passos -->
          <template v-for="(passo, idx) in passos" :key="passo.id">
            <div class="fe-card" :class="{ 'fe-card--open': openIdx === idx }">

              <!-- Cabeçalho do passo -->
              <div class="fe-card-head" @click="toggleOpen(idx)">
                <span class="fe-step-num">Passo {{ idx + 1 }}</span>
                <span class="fe-step-preview">{{ passoPreview(passo) }}</span>
                <v-spacer />
                <v-btn icon="mdi-delete-outline" variant="text" size="x-small" color="error"
                  :disabled="passos.length <= 1" @click.stop="deletePasso(idx)" />
                <v-icon :icon="openIdx === idx ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="18" style="color:#4b5563" />
              </div>

              <!-- Corpo expandido -->
              <div v-if="openIdx === idx" class="fe-card-body">

                <!-- Campo de mensagem -->
                <label class="fe-label">Mensagem do bot</label>
                <v-textarea
                  v-model="passo.mensagem"
                  variant="outlined"
                  density="compact"
                  rows="3"
                  auto-grow
                  hide-details
                  placeholder="Ex: Olá! Como posso te ajudar? Digite 1 para Vendas ou 2 para Suporte."
                />

                <!-- Após enviar -->
                <label class="fe-label mt-4">Após enviar esta mensagem:</label>
                <div class="fe-radio-group">

                  <!-- Opção: avançar -->
                  <label class="fe-radio-opt" :class="{ active: passo.saida === 'avancar' }">
                    <input type="radio" v-model="passo.saida" value="avancar" />
                    <v-icon icon="mdi-arrow-right-circle-outline" size="18" color="#6366F1" />
                    <span>Avançar para o próximo passo automaticamente</span>
                  </label>

                  <!-- Opção: aguardar resposta -->
                  <label class="fe-radio-opt" :class="{ active: passo.saida === 'aguardar' }">
                    <input type="radio" v-model="passo.saida" value="aguardar" />
                    <v-icon icon="mdi-message-reply-outline" size="18" color="#3B82F6" />
                    <span>Aguardar resposta do usuário</span>
                  </label>

                  <!-- Respostas / variáveis -->
                  <div v-if="passo.saida === 'aguardar'" class="fe-respostas">
                    <div class="fe-respostas-header">Variáveis de resposta</div>

                    <div v-for="(r, ri) in passo.respostas" :key="ri" class="fe-resp-row">
                      <span class="fe-resp-label">Se responder</span>
                      <v-text-field
                        v-model="r.texto"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="Ex: 1"
                        style="max-width:100px"
                      />
                      <span class="fe-resp-label">→ ir para</span>
                      <v-select
                        v-model="r.destino"
                        :items="destinoOptions(passo.id)"
                        item-title="label"
                        item-value="id"
                        variant="outlined"
                        density="compact"
                        hide-details
                        style="min-width:180px"
                        placeholder="Selecionar..."
                      />
                      <v-btn icon="mdi-close" variant="text" size="x-small" color="error" @click="removeResposta(passo, ri)" />
                    </div>

                    <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addResposta(passo)">
                      Adicionar variável
                    </v-btn>

                    <div class="fe-resp-row mt-3">
                      <span class="fe-resp-label">Qualquer outra resposta → ir para</span>
                      <v-select
                        v-model="passo.padrao"
                        :items="destinoOptions(passo.id)"
                        item-title="label"
                        item-value="id"
                        variant="outlined"
                        density="compact"
                        hide-details
                        clearable
                        style="min-width:180px"
                        placeholder="Próximo passo"
                      />
                    </div>
                  </div>

                  <!-- Opção: transferir -->
                  <label class="fe-radio-opt" :class="{ active: passo.saida === 'transferir' }">
                    <input type="radio" v-model="passo.saida" value="transferir" />
                    <v-icon icon="mdi-account-arrow-right" size="18" color="#F97316" />
                    <span>Transferir para atendente humano</span>
                  </label>

                  <div v-if="passo.saida === 'transferir'" class="fe-sub">
                    <v-text-field
                      v-model="passo.msg_transferencia"
                      variant="outlined"
                      density="compact"
                      hide-details
                      placeholder="Mensagem antes de transferir (opcional)"
                    />
                  </div>

                  <!-- Opção: encerrar -->
                  <label class="fe-radio-opt" :class="{ active: passo.saida === 'encerrar' }">
                    <input type="radio" v-model="passo.saida" value="encerrar" />
                    <v-icon icon="mdi-stop-circle-outline" size="18" color="#EF4444" />
                    <span>Encerrar a conversa</span>
                  </label>

                </div>
              </div>
            </div>

            <!-- Botão adicionar entre passos -->
            <div class="fe-between">
              <div class="fe-line-v" />
              <button class="fe-add-btn" @click="addPasso(idx + 1)">
                <v-icon icon="mdi-plus" size="13" />
              </button>
              <div class="fe-line-v" />
            </div>
          </template>

          <!-- Botão adicionar quando lista vazia -->
          <div v-if="!passos.length" class="fe-empty">
            <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="addPasso(0)">
              Adicionar primeiro passo
            </v-btn>
          </div>

        </div>
      </div>
    </div>

    <!-- Dialog: configurações do fluxo -->
    <v-dialog v-model="settingsDialog" max-width="480" persistent>
      <v-card style="background:#141C2D">
        <v-card-title class="pt-5 px-5">Configurações do Fluxo</v-card-title>
        <v-card-text class="px-5">
          <v-text-field v-model="flowSettings.name" label="Nome" variant="outlined" density="compact" class="mb-3" hide-details />
          <v-select v-model="flowSettings.status"
            :items="[{title:'Ativo',value:'active'},{title:'Inativo',value:'inactive'}]"
            label="Status" variant="outlined" density="compact" class="mb-3" hide-details />
          <v-combobox v-model="flowSettings.trigger_keywords"
            label="Palavras-gatilho (ativam o fluxo)"
            hint="Digite e pressione Enter para adicionar"
            variant="outlined" density="compact" chips multiple clearable class="mb-3" />
          <v-text-field v-model.number="flowSettings.timeout_minutes" type="number" min="1"
            label="Timeout (min sem resposta)" variant="outlined" density="compact" class="mb-3" hide-details />
          <v-text-field v-model="flowSettings.fallback_text"
            label="Mensagem ao expirar o tempo" variant="outlined" density="compact" hide-details />
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

const route = useRoute()

// ─── Estado ──────────────────────────────────────────────────────────────────
const flow           = ref(null)
const passos         = ref([])
const openIdx        = ref(0)
const saving         = ref(false)
const settingsDialog = ref(false)
const flowSettings   = ref({})

// ─── Carregar fluxo ──────────────────────────────────────────────────────────
onMounted(async () => {
  const { data } = await http.get(`/flows/${route.params.id}`)
  flow.value = data.flow

  // Suporte ao novo formato (passo) e legado
  const nodes = data.flow.nodes || []
  if (nodes.length && nodes[0].tipo === 'passo') {
    passos.value = nodes
  } else {
    // Fluxo novo ou sem passos: começa com um passo em branco
    passos.value = nodes.length === 0 ? [novoPasso()] : migrarNodes(nodes)
  }

  flowSettings.value = {
    name:             data.flow.name,
    status:           data.flow.status,
    trigger_keywords: data.flow.trigger_keywords || [],
    timeout_minutes:  data.flow.timeout_minutes  || 30,
    fallback_text:    data.flow.fallback_text    || '',
  }
})

// ─── Criar passo vazio ───────────────────────────────────────────────────────
function novoPasso() {
  return {
    id:               `p_${Date.now()}`,
    tipo:             'passo',
    mensagem:         '',
    saida:            'avancar',   // avancar | aguardar | transferir | encerrar
    respostas:        [],          // [{texto, destino}]
    padrao:           '',          // destino padrão quando nenhuma resposta bate
    msg_transferencia: '',
  }
}

// Migra formato antigo (legado) para um passo simples
function migrarNodes(nodes) {
  return [novoPasso()]
}

// ─── Opções de destino para os selects ───────────────────────────────────────
// Retorna todos os outros passos + ações especiais
function destinoOptions(passoAtualId) {
  const steps = passos.value
    .filter(p => p.id !== passoAtualId)
    .map((p, i) => ({
      id:    p.id,
      label: `Passo ${passos.value.indexOf(p) + 1}${p.mensagem ? ' — ' + p.mensagem.slice(0, 35) : ''}`,
    }))

  return [
    ...steps,
    { id: '__transfer__', label: '↩ Transferir para atendente' },
    { id: '__end__',      label: '⭕ Encerrar conversa' },
  ]
}

// ─── Preview no cabeçalho fechado ───────────────────────────────────────────
function passoPreview(passo) {
  if (passo.mensagem) return passo.mensagem.slice(0, 50)
  return 'Clique para editar...'
}

// ─── Abrir / fechar passo ────────────────────────────────────────────────────
function toggleOpen(idx) {
  openIdx.value = openIdx.value === idx ? -1 : idx
}

// ─── Adicionar / remover passo ───────────────────────────────────────────────
function addPasso(atIndex) {
  const novo = novoPasso()
  const arr  = [...passos.value]
  arr.splice(atIndex, 0, novo)
  passos.value = arr
  openIdx.value = atIndex
}

function deletePasso(idx) {
  passos.value.splice(idx, 1)
  if (openIdx.value >= passos.value.length) openIdx.value = passos.value.length - 1
}

// ─── Adicionar / remover resposta ────────────────────────────────────────────
function addResposta(passo) {
  if (!passo.respostas) passo.respostas = []
  passo.respostas.push({ texto: '', destino: '' })
}

function removeResposta(passo, idx) {
  passo.respostas.splice(idx, 1)
}

// ─── Configurações ───────────────────────────────────────────────────────────
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
      nodes:            passos.value,
      edges:            [],
    })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
/* ── Shell ───────────────────────────────────── */
.fe-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #0d1117;
  color: #e2e8f0;
}

/* ── Toolbar ─────────────────────────────────── */
.fe-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #141c2d;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.fe-title { font-size: 14px; font-weight: 600; color: #e2e8f0; }

/* ── Body / scroll ───────────────────────────── */
.fe-body { flex: 1; overflow: hidden; display: flex; justify-content: center; }
.fe-scroll { width: 100%; max-width: 640px; overflow-y: auto; padding: 28px 16px 60px; }
.fe-list { display: flex; flex-direction: column; align-items: stretch; }

/* ── Início ──────────────────────────────────── */
.fe-start {
  display: flex; align-items: center; gap: 6px;
  align-self: center;
  background: rgba(34,197,94,0.1);
  border: 1px solid rgba(34,197,94,0.3);
  border-radius: 20px;
  padding: 4px 14px;
  font-size: 11px; font-weight: 600; color: #22C55E;
}
.fe-arrow {
  text-align: center; color: rgba(255,255,255,0.15);
  font-size: 16px; line-height: 1; padding: 4px 0;
}

/* ── Card do passo ───────────────────────────── */
.fe-card {
  background: #141c2d;
  border: 1.5px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.15s;
}
.fe-card--open { border-color: rgba(99,102,241,0.5); }

.fe-card-head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  user-select: none;
}
.fe-card-head:hover { background: rgba(255,255,255,0.02); }

.fe-step-num {
  font-size: 11px; font-weight: 700;
  color: #818CF8; white-space: nowrap;
}
.fe-step-preview {
  font-size: 12px; color: #6b7c93;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 1; min-width: 0;
}

.fe-card-body {
  padding: 4px 16px 18px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

/* ── Labels ──────────────────────────────────── */
.fe-label {
  display: block;
  font-size: 11px; font-weight: 600;
  color: #6b7c93; text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px; margin-top: 16px;
}
.fe-label:first-child { margin-top: 16px; }

/* ── Radio group ─────────────────────────────── */
.fe-radio-group { display: flex; flex-direction: column; gap: 2px; }

.fe-radio-opt {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px; color: #94a3b8;
  border: 1px solid transparent;
  transition: all 0.12s;
}
.fe-radio-opt input[type="radio"] { accent-color: #6366F1; cursor: pointer; }
.fe-radio-opt:hover { background: rgba(255,255,255,0.03); }
.fe-radio-opt.active {
  background: rgba(99,102,241,0.08);
  border-color: rgba(99,102,241,0.25);
  color: #c7d2fe;
}

/* ── Respostas / variáveis ───────────────────── */
.fe-respostas {
  margin: 6px 0 4px 28px;
  background: rgba(0,0,0,0.2);
  border-radius: 10px;
  padding: 14px;
  border: 1px solid rgba(255,255,255,0.06);
}
.fe-respostas-header {
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.6px;
  color: #4b5563; margin-bottom: 10px;
}

.fe-resp-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 8px;
}
.fe-resp-label { font-size: 12px; color: #6b7c93; white-space: nowrap; }

/* ── Sub-opções (transfer msg) ───────────────── */
.fe-sub {
  margin: 6px 0 4px 28px;
  padding: 10px 12px;
  background: rgba(0,0,0,0.15);
  border-radius: 8px;
}

/* ── Conector entre passos ───────────────────── */
.fe-between { display: flex; flex-direction: column; align-items: center; }
.fe-line-v  { width: 2px; height: 14px; background: rgba(255,255,255,0.08); }
.fe-add-btn {
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  color: #6b7c93;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
}
.fe-add-btn:hover {
  background: rgba(99,102,241,0.2);
  border-color: #6366F1; color: #818CF8;
}

/* ── Empty ───────────────────────────────────── */
.fe-empty { display: flex; justify-content: center; padding: 16px 0; }
</style>
