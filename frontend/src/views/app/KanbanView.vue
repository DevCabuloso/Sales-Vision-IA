<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-5 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">CRM Kanban</h1>
        <p class="text-body-2" style="color:#9FB0BC">{{ totalLeads }} leads · arraste para mudar de estágio</p>
      </div>
      <div class="d-flex align-center ga-2">
        <v-text-field v-model="search" placeholder="Buscar lead..." prepend-inner-icon="mdi-magnify" density="compact" hide-details style="max-width:220px" />
        <v-btn icon variant="text" @click="load"><v-icon icon="mdi-refresh" /></v-btn>
      </div>
    </div>

    <div v-if="loading" class="py-12 text-center"><v-progress-circular indeterminate color="primary" size="48" /></div>

    <div v-else class="kanban-board">
      <div
        v-for="col in columns" :key="col.stage"
        class="kanban-col"
        @dragover.prevent
        @drop="onDrop($event, col.stage)"
      >
        <div class="kanban-header" :style="`border-top:3px solid ${col.color}`">
          <div class="d-flex align-center ga-2">
            <v-icon :icon="col.icon" size="18" :color="col.color" />
            <span class="text-body-2 font-weight-bold">{{ col.stage }}</span>
            <v-chip class="ml-auto" size="x-small" :style="`background:${col.color}22;color:${col.color}`">
              {{ filteredByStage(col.stage).length }}
            </v-chip>
          </div>
        </div>

        <div class="kanban-cards">
          <div
            v-for="lead in filteredByStage(col.stage)" :key="lead.id"
            class="kanban-card"
            draggable="true"
            @dragstart="onDragStart($event, lead)"
            @click="openDetail(lead)"
          >
            <div class="d-flex align-center justify-space-between mb-2">
              <div class="lead-avatar">{{ (lead.name || lead.phone).slice(0, 2).toUpperCase() }}</div>
              <v-chip v-if="lead.score > 0" :color="scoreColor(lead.score)" variant="tonal" size="x-small">{{ lead.score }}pts</v-chip>
            </div>
            <div class="text-body-2 font-weight-medium mb-1">{{ lead.name || lead.phone }}</div>
            <div v-if="lead.name" class="text-caption" style="color:#9FB0BC">{{ lead.phone }}</div>
            <div v-if="lead.intention" class="intention-tag">{{ lead.intention }}</div>
            <div class="text-caption mt-2" style="color:#9FB0BC">{{ timeAgo(lead.updated_at) }}</div>
          </div>

          <div v-if="!filteredByStage(col.stage).length" class="kanban-empty">
            <v-icon icon="mdi-drag-horizontal-variant" size="32" style="opacity:.15" />
          </div>
        </div>
      </div>
    </div>

    <!-- Modal detalhe -->
    <v-dialog v-if="selected" v-model="detailDialog" max-width="460">
      <v-card class="glass pa-6" border>
        <div class="d-flex align-center justify-space-between mb-4">
          <span class="text-h6 font-weight-bold">{{ selected.name || selected.phone }}</span>
          <v-chip variant="tonal" size="small" :style="`background:${stageColor(selected.stage)}22;color:${stageColor(selected.stage)}`">{{ selected.stage }}</v-chip>
        </div>

        <div class="d-flex flex-column ga-2 mb-4">
          <div v-if="selected.phone" class="d-flex align-center ga-2 text-body-2" style="color:#9FB0BC">
            <v-icon icon="mdi-phone-outline" size="16" />{{ selected.phone }}
          </div>
          <div v-if="selected.score" class="d-flex align-center ga-2 text-body-2" style="color:#9FB0BC">
            <v-icon icon="mdi-star-outline" size="16" />Score: {{ selected.score }}/100
          </div>
          <div v-if="selected.intention" class="d-flex align-center ga-2 text-body-2" style="color:#9FB0BC">
            <v-icon icon="mdi-lightbulb-outline" size="16" />{{ selected.intention }}
          </div>
        </div>

        <div class="mb-4">
          <p class="text-caption mb-2" style="color:#9FB0BC">Mover para:</p>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              v-for="col in columns.filter((c) => c.stage !== selected.stage)" :key="col.stage"
              size="x-small" variant="outlined"
              :style="`border-color:${col.color};color:${col.color}`"
              @click="moveStage(selected, col.stage)"
            >{{ col.stage }}</v-btn>
          </div>
        </div>

        <div v-if="history.length" class="mb-4">
          <p class="text-caption mb-2" style="color:#9FB0BC">Histórico:</p>
          <div v-for="h in history" :key="h.id" class="d-flex align-center ga-2 py-1 text-caption" style="border-bottom:1px solid rgba(255,255,255,0.05);color:#9FB0BC">
            <v-icon icon="mdi-arrow-right" size="12" />
            <span>{{ h.from_stage || '—' }} → <strong>{{ h.to_stage }}</strong></span>
            <span class="ml-auto">{{ formatDate(h.changed_at) }}</span>
          </div>
        </div>

        <div class="d-flex justify-space-between">
          <v-btn color="info" size="small" :to="`/chat/${selected.id}`">Chat</v-btn>
          <v-btn variant="text" size="small" @click="detailDialog = false">Fechar</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const loading = ref(true)
const leads = ref([])
const search = ref('')
const selected = ref(null)
const detailDialog = ref(false)
const history = ref([])
let draggedLead = null

const columns = [
  { stage: 'Novo Lead',        icon: 'mdi-account-plus-outline',   color: '#6366F1' },
  { stage: 'Em Qualificação',  icon: 'mdi-account-search-outline', color: '#38BDF8' },
  { stage: 'Qualificado',      icon: 'mdi-account-check-outline',  color: '#10B981' },
  { stage: 'Reunião Agendada', icon: 'mdi-calendar-check-outline', color: '#F59E0B' },
  { stage: 'Perdido',          icon: 'mdi-account-off-outline',    color: '#EF4444' },
  { stage: 'Vendido',          icon: 'mdi-trophy-outline',         color: '#A855F7' },
]

const totalLeads = computed(() => leads.value.length)
const filteredLeads = computed(() => {
  if (!search.value) return leads.value
  const q = search.value.toLowerCase()
  return leads.value.filter((l) => (l.name || '').toLowerCase().includes(q) || l.phone.toLowerCase().includes(q) || (l.intention || '').toLowerCase().includes(q))
})
function filteredByStage(stage) { return filteredLeads.value.filter((l) => l.stage === stage) }
function scoreColor(s) { if (s >= 70) return 'success'; if (s >= 40) return 'warning'; return 'error' }
function stageColor(s) { return { 'Novo Lead': '#6366F1', 'Em Qualificação': '#38BDF8', 'Qualificado': '#10B981', 'Reunião Agendada': '#F59E0B', 'Perdido': '#EF4444', 'Vendido': '#A855F7' }[s] || '#6366F1' }
function timeAgo(d) { if (!d) return ''; const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (min < 60) return `${min}min atrás`; const hr = Math.floor(min / 60); if (hr < 24) return `${hr}h atrás`; return `${Math.floor(hr / 24)}d atrás` }
function formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }

async function load() { loading.value = true; try { leads.value = await api.listLeads() } catch (e) { toast.error(e.message) } finally { loading.value = false } }

function onDragStart(event, lead) { draggedLead = lead; event.dataTransfer.effectAllowed = 'move' }
async function onDrop(event, targetStage) { if (!draggedLead || draggedLead.stage === targetStage) return; await moveStage(draggedLead, targetStage); draggedLead = null }

async function moveStage(lead, newStage) {
  const oldStage = lead.stage; lead.stage = newStage
  try {
    await api.updateLead(lead.id, { stage: newStage })
    if (detailDialog.value && selected.value?.id === lead.id) { selected.value.stage = newStage; loadHistory(lead.id) }
    toast.success(`Movido para "${newStage}"`)
  } catch (e) { lead.stage = oldStage; toast.error(e.message) }
}

async function openDetail(lead) { selected.value = lead; detailDialog.value = true; history.value = []; await loadHistory(lead.id) }
async function loadHistory(leadId) { try { const { history: h } = await api.leadHistory(leadId); history.value = h } catch { /* */ } }

onMounted(load)
</script>

<style scoped>
.kanban-board { display:flex; gap:16px; overflow-x:auto; padding-bottom:16px; min-height:calc(100vh - 200px); }
.kanban-col { min-width:240px; width:240px; flex-shrink:0; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:14px; display:flex; flex-direction:column; }
.kanban-header { padding:12px 14px 10px; border-radius:14px 14px 0 0; background:rgba(255,255,255,0.03); }
.kanban-cards { flex:1; padding:10px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; }
.kanban-card { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px; cursor:grab; transition:all 0.15s ease; }
.kanban-card:hover { background:rgba(255,255,255,0.07); border-color:rgba(255,255,255,0.14); transform:translateY(-1px); }
.kanban-card:active { cursor:grabbing; }
.kanban-empty { flex:1; display:flex; align-items:center; justify-content:center; padding:24px; }
.lead-avatar { width:30px; height:30px; border-radius:8px; background:rgba(99,102,241,0.15); font-size:11px; font-weight:700; color:#818CF8; display:flex; align-items:center; justify-content:center; }
.intention-tag { color:#9FB0BC; background:rgba(255,255,255,0.05); border-radius:4px; padding:2px 6px; display:inline-block; font-size:11px; margin-top:4px; }
</style>
