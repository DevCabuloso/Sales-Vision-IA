<template>
  <div>
    <h1 class="text-h5 font-weight-bold mb-1">Configurações de Atendimento</h1>
    <p class="text-body-2 mb-5" style="color:#9FB0BC">Gerencie etiquetas, filas e horários de atendimento</p>

    <v-tabs v-model="tab" class="mb-5">
      <v-tab value="labels" prepend-icon="mdi-label-outline">Etiquetas</v-tab>
      <v-tab value="queues" prepend-icon="mdi-layers-outline">Filas</v-tab>
      <v-tab value="hours" prepend-icon="mdi-clock-outline">Horário</v-tab>
    </v-tabs>

    <!-- ETIQUETAS -->
    <div v-if="tab === 'labels'">
      <div class="d-flex align-center justify-space-between mb-4">
        <p class="text-body-2" style="color:#9FB0BC">{{ labels.length }} etiqueta(s)</p>
        <v-btn color="primary" prepend-icon="mdi-plus" size="small" @click="openLabelCreate">Nova Etiqueta</v-btn>
      </div>
      <v-row v-if="labels.length" dense>
        <v-col v-for="label in labels" :key="label.id" cols="12" sm="6" md="4" lg="3">
          <v-card class="glass pa-4 d-flex align-center ga-3" border>
            <div class="label-dot" :style="{ background: label.color }" />
            <span class="text-body-2 font-weight-medium flex-1">{{ label.name }}</span>
            <v-btn icon variant="text" size="small" @click="openLabelEdit(label)"><v-icon icon="mdi-pencil-outline" size="16" /></v-btn>
            <v-btn icon variant="text" size="small" color="error" @click="deleteLabel(label)"><v-icon icon="mdi-delete-outline" size="16" /></v-btn>
          </v-card>
        </v-col>
      </v-row>
      <v-card v-else class="glass pa-12 text-center" border>
        <v-icon icon="mdi-label-outline" size="48" style="opacity:.2" class="mb-2" />
        <p class="text-body-2" style="color:#9FB0BC">Nenhuma etiqueta criada ainda.</p>
      </v-card>

      <!-- Dialog: etiqueta -->
      <v-dialog v-model="labelDialog" max-width="360">
        <v-card class="glass pa-2" border>
          <v-card-title class="text-h6 font-weight-bold">{{ labelEditTarget ? 'Editar' : 'Nova' }} Etiqueta</v-card-title>
          <v-card-text>
            <v-text-field v-model="labelForm.name" label="Nome *" class="mb-3" />
            <div class="text-body-2 mb-2">Cor</div>
            <div class="color-grid mb-2">
              <div v-for="c in PRESET_COLORS" :key="c" class="color-swatch" :style="{ background: c }" :class="{ selected: labelForm.color === c }" @click="labelForm.color = c">
                <v-icon v-if="labelForm.color === c" icon="mdi-check" size="14" color="white" />
              </div>
            </div>
          </v-card-text>
          <v-card-actions class="px-4 pb-4">
            <v-spacer />
            <v-btn variant="text" @click="labelDialog = false">Cancelar</v-btn>
            <v-btn color="primary" :loading="savingLabel" @click="saveLabel">Salvar</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </div>

    <!-- FILAS -->
    <div v-if="tab === 'queues'">
      <div class="d-flex align-center justify-space-between mb-4">
        <p class="text-body-2" style="color:#9FB0BC">{{ queues.length }} fila(s)</p>
        <v-btn color="primary" prepend-icon="mdi-plus" size="small" @click="openQueueCreate">Nova Fila</v-btn>
      </div>
      <v-row v-if="queues.length">
        <v-col v-for="q in queues" :key="q.id" cols="12" md="6">
          <v-card class="glass pa-5" border>
            <div class="d-flex align-center ga-3 mb-3">
              <div class="queue-dot" :style="{ background: q.color }" />
              <div class="flex-1 min-width-0">
                <div class="text-body-2 font-weight-bold">{{ q.name }}</div>
                <div v-if="q.description" class="text-caption" style="color:#9FB0BC">{{ q.description }}</div>
              </div>
              <v-btn icon variant="text" size="small" @click="openQueueEdit(q)"><v-icon icon="mdi-pencil-outline" size="16" /></v-btn>
              <v-btn icon variant="text" size="small" color="error" @click="deleteQueue(q)"><v-icon icon="mdi-delete-outline" size="16" /></v-btn>
            </div>
            <div class="d-flex flex-wrap ga-1">
              <v-chip v-for="op in (q.operators || [])" :key="op.id" color="primary" variant="tonal" size="x-small" prepend-icon="mdi-account-outline">{{ op.name || op.email }}</v-chip>
              <span v-if="!q.operators?.length" class="text-caption" style="color:#6B7C88">Sem operadores</span>
            </div>
          </v-card>
        </v-col>
      </v-row>
      <v-card v-else class="glass pa-12 text-center" border>
        <v-icon icon="mdi-layers-outline" size="48" style="opacity:.2" class="mb-2" />
        <p class="text-body-2" style="color:#9FB0BC">Nenhuma fila criada ainda.</p>
      </v-card>

      <!-- Dialog: fila -->
      <v-dialog v-model="queueDialog" max-width="440">
        <v-card class="glass pa-2" border>
          <v-card-title class="text-h6 font-weight-bold">{{ queueEditTarget ? 'Editar' : 'Nova' }} Fila</v-card-title>
          <v-card-text>
            <v-text-field v-model="queueForm.name" label="Nome *" class="mb-2" />
            <v-text-field v-model="queueForm.description" label="Descrição" class="mb-3" />
            <div class="text-body-2 mb-2">Cor</div>
            <div class="color-grid mb-3">
              <div v-for="c in PRESET_COLORS" :key="c" class="color-swatch" :style="{ background: c }" :class="{ selected: queueForm.color === c }" @click="queueForm.color = c">
                <v-icon v-if="queueForm.color === c" icon="mdi-check" size="14" color="white" />
              </div>
            </div>
            <div class="text-body-2 mb-2">Operadores</div>
            <div class="d-flex flex-wrap ga-2">
              <v-checkbox v-for="op in allOperators" :key="op.id" :label="op.name || op.email" :value="op.id" v-model="queueForm.operator_ids" color="primary" hide-details density="compact" />
            </div>
          </v-card-text>
          <v-card-actions class="px-4 pb-4">
            <v-spacer />
            <v-btn variant="text" @click="queueDialog = false">Cancelar</v-btn>
            <v-btn color="primary" :loading="savingQueue" @click="saveQueue">Salvar</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </div>

    <!-- HORÁRIO -->
    <div v-if="tab === 'hours'">
      <v-card class="glass pa-6" border>
        <div class="d-flex align-center justify-space-between mb-5">
          <div>
            <div class="text-subtitle-2 font-weight-bold mb-1">Horário de Atendimento</div>
            <p class="text-caption" style="color:#9FB0BC">Mensagens fora do horário recebem a mensagem de ausência.</p>
          </div>
          <v-switch v-model="bhForm.enabled" color="primary" hide-details />
        </div>

        <v-select v-model="bhForm.timezone" :items="timezones" label="Fuso horário" style="max-width:280px" class="mb-4" />

        <v-table class="bg-transparent mb-4" density="compact">
          <thead><tr><th>Dia</th><th>Aberto</th><th>Entrada</th><th>Saída</th></tr></thead>
          <tbody>
            <tr v-for="d in weekDays" :key="d.key">
              <td class="text-body-2 font-weight-medium">{{ d.label }}</td>
              <td><v-checkbox v-model="bhForm.schedule[d.key].open" color="primary" hide-details density="compact" /></td>
              <td><v-text-field v-model="bhForm.schedule[d.key].start" type="time" density="compact" hide-details :disabled="!bhForm.schedule[d.key].open" style="max-width:110px" /></td>
              <td><v-text-field v-model="bhForm.schedule[d.key].end" type="time" density="compact" hide-details :disabled="!bhForm.schedule[d.key].open" style="max-width:110px" /></td>
            </tr>
          </tbody>
        </v-table>

        <v-textarea v-model="bhForm.off_message" label="Mensagem fora do horário" rows="3" class="mb-5" />

        <div class="d-flex justify-end">
          <v-btn color="primary" prepend-icon="mdi-content-save-outline" :loading="savingBH" @click="saveBH">Salvar configurações</v-btn>
        </div>
      </v-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { http } from '@/services/api'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const tab = ref('labels')

const PRESET_COLORS = ['#6366F1','#8B5CF6','#EC4899','#EF4444','#F97316','#F59E0B','#84CC16','#10B981','#06B6D4','#3B82F6','#6B7C88','#14B8A6','#A855F7','#E11D48','#0EA5E9']

// ETIQUETAS
const labels = ref([])
const labelDialog = ref(false)
const labelEditTarget = ref(null)
const savingLabel = ref(false)
const labelForm = reactive({ name: '', color: '#6366F1' })

async function loadLabels() { try { labels.value = (await http.get('/labels').then((r) => r.data)).labels } catch (e) { toast.error(e.message) } }
function openLabelCreate() { labelEditTarget.value = null; Object.assign(labelForm, { name: '', color: '#6366F1' }); labelDialog.value = true }
function openLabelEdit(label) { labelEditTarget.value = label; Object.assign(labelForm, { name: label.name, color: label.color }); labelDialog.value = true }
async function saveLabel() {
  if (!labelForm.name) return toast.warning('Nome obrigatório.')
  savingLabel.value = true
  try {
    if (labelEditTarget.value) { const { label } = await http.patch(`/labels/${labelEditTarget.value.id}`, labelForm).then((r) => r.data); const idx = labels.value.findIndex((l) => l.id === labelEditTarget.value.id); if (idx >= 0) labels.value[idx] = label }
    else { const { label } = await http.post('/labels', labelForm).then((r) => r.data); labels.value.push(label) }
    labelDialog.value = false; toast.success('Etiqueta salva.')
  } catch (e) { toast.error(e.message) } finally { savingLabel.value = false }
}
async function deleteLabel(label) {
  if (!confirm(`Excluir etiqueta "${label.name}"?`)) return
  try { await http.delete(`/labels/${label.id}`); labels.value = labels.value.filter((l) => l.id !== label.id); toast.success('Etiqueta excluída.') } catch (e) { toast.error(e.message) }
}

// FILAS
const queues = ref([])
const queueDialog = ref(false)
const queueEditTarget = ref(null)
const savingQueue = ref(false)
const queueForm = reactive({ name: '', description: '', color: '#6366F1', operator_ids: [] })
const allOperators = ref([])

async function loadQueues() { try { queues.value = (await http.get('/queues').then((r) => r.data)).queues } catch (e) { toast.error(e.message) } }
async function loadOperators() { try { allOperators.value = (await http.get('/operators').then((r) => r.data)).operators } catch { /* */ } }
function openQueueCreate() { queueEditTarget.value = null; Object.assign(queueForm, { name: '', description: '', color: '#6366F1', operator_ids: [] }); queueDialog.value = true }
function openQueueEdit(q) { queueEditTarget.value = q; Object.assign(queueForm, { name: q.name, description: q.description || '', color: q.color, operator_ids: (q.operators || []).map((o) => o.id) }); queueDialog.value = true }
async function saveQueue() {
  if (!queueForm.name) return toast.warning('Nome obrigatório.')
  savingQueue.value = true
  try {
    if (queueEditTarget.value) { const { queue } = await http.patch(`/queues/${queueEditTarget.value.id}`, queueForm).then((r) => r.data); const idx = queues.value.findIndex((q) => q.id === queueEditTarget.value.id); if (idx >= 0) queues.value[idx] = queue }
    else { const { queue } = await http.post('/queues', queueForm).then((r) => r.data); queues.value.push(queue) }
    queueDialog.value = false; toast.success('Fila salva.')
  } catch (e) { toast.error(e.message) } finally { savingQueue.value = false }
}
async function deleteQueue(q) {
  if (!confirm(`Excluir fila "${q.name}"?`)) return
  try { await http.delete(`/queues/${q.id}`); queues.value = queues.value.filter((x) => x.id !== q.id); toast.success('Fila excluída.') } catch (e) { toast.error(e.message) }
}

// HORÁRIO
const savingBH = ref(false)
const weekDays = [
  { key: '1', label: 'Segunda-feira' }, { key: '2', label: 'Terça-feira' }, { key: '3', label: 'Quarta-feira' },
  { key: '4', label: 'Quinta-feira' }, { key: '5', label: 'Sexta-feira' }, { key: '6', label: 'Sábado' }, { key: '0', label: 'Domingo' },
]
const timezones = ['America/Sao_Paulo','America/Manaus','America/Belem','America/Fortaleza','America/Recife','America/Cuiaba','America/Porto_Velho','America/Boa_Vista','America/Rio_Branco','America/New_York','America/Chicago','America/Los_Angeles','Europe/Lisbon','Europe/London','UTC']
const defaultSchedule = () => ({ 0: { open: false, start: '08:00', end: '18:00' }, 1: { open: true, start: '08:00', end: '18:00' }, 2: { open: true, start: '08:00', end: '18:00' }, 3: { open: true, start: '08:00', end: '18:00' }, 4: { open: true, start: '08:00', end: '18:00' }, 5: { open: true, start: '08:00', end: '18:00' }, 6: { open: false, start: '08:00', end: '12:00' } })
const bhForm = reactive({ enabled: false, timezone: 'America/Sao_Paulo', schedule: defaultSchedule(), off_message: 'Estamos fora do horário de atendimento. Retornaremos em breve!' })

async function loadBH() {
  try {
    const { config } = await http.get('/business-hours').then((r) => r.data)
    if (config) { bhForm.enabled = config.enabled; bhForm.timezone = config.timezone; bhForm.off_message = config.off_message; const sched = defaultSchedule(); Object.keys(config.schedule || {}).forEach((k) => { sched[k] = { ...sched[k], ...config.schedule[k] } }); Object.assign(bhForm.schedule, sched) }
  } catch (e) { toast.error(e.message) }
}
async function saveBH() { savingBH.value = true; try { await http.put('/business-hours', bhForm); toast.success('Horário de atendimento salvo.') } catch (e) { toast.error(e.message) } finally { savingBH.value = false } }

watch(tab, (v) => {
  if (v === 'labels' && !labels.value.length) loadLabels()
  if (v === 'queues' && !queues.value.length) { loadQueues(); loadOperators() }
  if (v === 'hours') loadBH()
})

onMounted(() => { loadLabels(); loadOperators() })
</script>

<style scoped>
.label-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
.queue-dot { width: 18px; height: 18px; border-radius: 5px; flex-shrink: 0; }
.color-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.color-swatch { width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; border: 2px solid transparent; transition: transform .1s; }
.color-swatch:hover { transform: scale(1.15); }
.color-swatch.selected { border-color: white; transform: scale(1.1); }
</style>
