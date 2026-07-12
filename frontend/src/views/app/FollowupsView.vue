<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-5 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Acompanhamentos</h1>
        <p class="text-body-2" style="color:#9FB0BC">Sequências de mensagens automáticas por contato</p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Novo Acompanhamento</v-btn>
    </div>

    <v-card class="glass" border>
      <v-data-table :headers="headers" :items="sequences" :loading="loading" item-value="id" class="bg-transparent" :items-per-page="25">
        <template #item.name="{ item }">
          <div class="py-1">
            <div class="text-body-2 font-weight-medium">{{ item.name }}</div>
            <div v-if="item.description" class="text-caption text-truncate" style="color:#9FB0BC;max-width:360px">{{ item.description }}</div>
          </div>
        </template>
        <template #item.steps_count="{ item }">
          <v-chip variant="tonal" size="small">{{ item.steps_count }} mensagem(ns)</v-chip>
        </template>
        <template #item.active_count="{ item }">
          <v-chip :color="item.active_count ? 'success' : undefined" variant="tonal" size="small">{{ item.active_count }} contato(s)</v-chip>
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex ga-1 justify-end">
            <v-btn icon variant="text" size="small" title="Duplicar" @click="duplicate(item)"><v-icon icon="mdi-content-copy" size="16" /></v-btn>
            <v-btn icon variant="text" size="small" title="Editar" @click="openEdit(item)"><v-icon icon="mdi-pencil-outline" size="16" /></v-btn>
            <v-btn icon variant="text" size="small" color="error" title="Excluir" @click="openDelete(item)"><v-icon icon="mdi-delete-outline" size="16" /></v-btn>
          </div>
        </template>
        <template #no-data>
          <div class="py-8 text-center" style="color:#6B7C88">
            Nenhum acompanhamento cadastrado.
            <div class="mt-3"><v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="openCreate">Criar acompanhamento</v-btn></div>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Dialog: criar/editar -->
    <v-dialog v-model="editDialog" max-width="720" scrollable>
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">{{ editMode ? 'Editar' : 'Novo' }} Acompanhamento</v-card-title>
        <v-card-text style="max-height:70vh">
          <v-text-field v-model="editForm.name" label="Nome do acompanhamento" class="mb-2" />
          <v-textarea v-model="editForm.description" label="Descrição (opcional)" rows="2" auto-grow class="mb-4" />

          <div class="mb-4">
            <div class="text-caption font-weight-bold mb-2" style="color:#9FB0BC;letter-spacing:.5px">HORÁRIO DE ENVIO</div>
            <v-btn-toggle v-model="editForm.time_mode" mandatory density="comfortable" color="primary" divided class="mb-2">
              <v-btn value="general" size="small">Horário geral</v-btn>
              <v-btn value="individual" size="small">Horário individual</v-btn>
            </v-btn-toggle>

            <div v-if="editForm.time_mode === 'general'">
              <v-text-field
                v-model="editForm.default_send_time" type="time" density="compact" style="max-width:160px"
                label="Horário de envio" hide-details
              />
              <div class="text-caption mt-1" style="color:#6B7C88">
                Todas as mensagens (exceto as marcadas como "Enviar imediatamente") saem neste horário, no dia correspondente.
              </div>
            </div>
            <div v-else class="text-caption" style="color:#6B7C88">
              Defina um horário diferente para cada mensagem abaixo.
            </div>
          </div>

          <div class="d-flex align-center justify-space-between mb-2">
            <div class="text-caption font-weight-bold" style="color:#9FB0BC;letter-spacing:.5px">MENSAGENS DA SEQUÊNCIA</div>
            <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-plus" @click="addStep">Adicionar mensagem</v-btn>
          </div>

          <div class="d-flex flex-column ga-3">
            <v-card
              v-for="(step, i) in editForm.steps" :key="step._key"
              class="step-card pa-3" border
              :class="{ 'is-dragging': dragIndex === i, 'is-drag-over': dragOverIndex === i && dragIndex !== i }"
              draggable="true"
              @dragstart="onDragStart(i, $event)"
              @dragover="onDragOver(i, $event)"
              @drop="onDrop(i, $event)"
              @dragend="onDragEnd"
            >
              <div class="d-flex align-center ga-2 mb-2">
                <v-icon icon="mdi-drag-vertical" size="18" class="drag-handle" style="color:#6B7C88" />
                <v-chip size="small" variant="tonal" color="primary">Mensagem {{ i + 1 }}</v-chip>
                <v-spacer />
                <v-btn icon variant="text" size="x-small" color="error" :disabled="editForm.steps.length === 1" @click="removeStep(i)"><v-icon icon="mdi-close" size="16" /></v-btn>
              </div>

              <v-textarea v-model="step.text" label="Conteúdo da mensagem" rows="2" auto-grow density="compact" class="mb-2" />

              <div class="d-flex align-center ga-3 flex-wrap">
                <v-text-field
                  v-model.number="step.delay_days" type="number" min="0" density="compact" style="max-width:320px"
                  :label="step.delay_days === 0 ? 'Enviar imediatamente' : 'Dias após o início do acompanhamento'" hide-details
                />
                <v-text-field
                  v-if="editForm.time_mode === 'individual' && step.delay_days > 0"
                  v-model="step.send_time" type="time" density="compact" style="max-width:160px"
                  label="Horário de envio" hide-details
                />
                <input :ref="(el) => (fileInputs[i] = el)" type="file" class="d-none" @change="onPickFile(i, $event)" />
                <v-btn size="small" variant="tonal" prepend-icon="mdi-paperclip" @click="fileInputs[i]?.click()">
                  {{ step._file || step.media_filename ? 'Trocar anexo' : 'Anexar arquivo' }}
                </v-btn>
                <v-chip v-if="step._file || step.media_filename" size="small" closable @click:close="clearAttachment(i)">
                  {{ step._file?.name || step.media_filename }}
                </v-chip>
              </div>
            </v-card>
          </div>

          <v-alert v-if="editError" type="error" variant="tonal" density="compact" :text="editError" class="mt-4" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveEdit">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: excluir -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Excluir acompanhamento?</v-card-title>
        <v-card-text>
          Confirma a exclusão de <strong>{{ deleteTarget?.name }}</strong>?
          <div v-if="deleteTarget?.active_count" class="text-caption mt-2" style="color:#F59E0B">
            {{ deleteTarget.active_count }} contato(s) em andamento continuam recebendo as mensagens já agendadas.
          </div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" :loading="saving" @click="doDelete">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { followupSequenceSchema } from '@/schemas/followups'
import { validateForm } from '@/composables/useZodValidation'

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const sequences = ref([])

const headers = [
  { title: 'Nome', key: 'name' },
  { title: 'Etapas', key: 'steps_count' },
  { title: 'Contatos ativos', key: 'active_count' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
]

let stepKeySeq = 0
function blankStep() {
  return { _key: stepKeySeq++, text: '', delay_days: 0, send_time: '09:00', _file: null, media_url: null, media_type: null, media_mimetype: null, media_filename: null }
}

const editDialog = ref(false)
const editMode = ref(false)
const editTarget = ref(null)
const editError = ref('')
const editForm = reactive({ name: '', description: '', time_mode: 'general', default_send_time: '09:00', steps: [blankStep()] })
const fileInputs = {}

const deleteDialog = ref(false)
const deleteTarget = ref(null)

async function load() {
  loading.value = true
  try { sequences.value = await api.listFollowupSequences() }
  catch (e) { toast.error(e.message) } finally { loading.value = false }
}

function openCreate() {
  editMode.value = false; editTarget.value = null; editError.value = ''
  Object.assign(editForm, { name: '', description: '', time_mode: 'general', default_send_time: '09:00', steps: [blankStep()] })
  editDialog.value = true
}

async function openEdit(seq) {
  editMode.value = true; editTarget.value = seq; editError.value = ''
  try {
    const { sequence, steps } = await api.getFollowupSequence(seq.id)
    Object.assign(editForm, {
      name: sequence.name,
      description: sequence.description || '',
      time_mode: sequence.time_mode || 'general',
      default_send_time: sequence.default_send_time || '09:00',
      steps: steps.length
        ? steps.map((s) => ({ _key: stepKeySeq++, text: s.text, delay_days: s.delay_days, send_time: s.send_time || sequence.default_send_time || '09:00', _file: null, media_url: s.media_url, media_type: s.media_type, media_mimetype: s.media_mimetype, media_filename: s.media_filename }))
        : [blankStep()],
    })
    editDialog.value = true
  } catch (e) { toast.error(e.message) }
}

function addStep() { editForm.steps.push(blankStep()) }
function removeStep(i) { if (editForm.steps.length > 1) editForm.steps.splice(i, 1) }

const dragIndex = ref(null)
const dragOverIndex = ref(null)
function onDragStart(i, ev) {
  dragIndex.value = i
  ev.dataTransfer.effectAllowed = 'move'
  ev.dataTransfer.setData('text/plain', String(i))
}
function onDragOver(i, ev) {
  ev.preventDefault()
  dragOverIndex.value = i
}
function onDrop(i, ev) {
  ev.preventDefault()
  const from = dragIndex.value
  dragOverIndex.value = null
  dragIndex.value = null
  if (from === null || from === i) return
  const [moved] = editForm.steps.splice(from, 1)
  editForm.steps.splice(i, 0, moved)
}
function onDragEnd() { dragIndex.value = null; dragOverIndex.value = null }

function onPickFile(i, ev) {
  const file = ev.target.files?.[0]
  if (file) editForm.steps[i]._file = file
  ev.target.value = ''
}
function clearAttachment(i) {
  editForm.steps[i]._file = null
  editForm.steps[i].media_url = null
  editForm.steps[i].media_type = null
  editForm.steps[i].media_mimetype = null
  editForm.steps[i].media_filename = null
}

async function saveEdit() {
  editError.value = ''
  const check = validateForm(followupSequenceSchema, {
    name: editForm.name,
    description: editForm.description || null,
    time_mode: editForm.time_mode,
    default_send_time: editForm.default_send_time || '09:00',
    steps: editForm.steps.map((s) => ({
      delay_days: Number(s.delay_days) || 0,
      text: s.text,
      media_url: s.media_url || null,
      media_type: s.media_type || null,
      media_mimetype: s.media_mimetype || null,
      media_filename: s.media_filename || null,
      send_time: editForm.time_mode === 'individual' ? (s.send_time || '09:00') : null,
    })),
  })
  if (!check.success) { editError.value = check.error; return }

  saving.value = true
  try {
    const payload = check.data

    const { sequence, steps } = editMode.value
      ? await api.updateFollowupSequence(editTarget.value.id, payload)
      : await api.createFollowupSequence(payload)

    const stepsByOrder = {}
    for (const st of steps) stepsByOrder[st.order_index] = st
    const pendingUploads = editForm.steps
      .map((s, i) => ({ file: s._file, step: stepsByOrder[i] }))
      .filter((p) => p.file && p.step)
    for (const { file, step } of pendingUploads) {
      await api.uploadFollowupStepMedia(sequence.id, step.id, file)
    }

    editDialog.value = false
    toast.success(editMode.value ? 'Acompanhamento atualizado.' : 'Acompanhamento criado.')
    await load()
  } catch (e) { editError.value = e.message } finally { saving.value = false }
}

async function duplicate(seq) {
  try { await api.duplicateFollowupSequence(seq.id); toast.success('Acompanhamento duplicado.'); await load() }
  catch (e) { toast.error(e.message) }
}

function openDelete(seq) { deleteTarget.value = seq; deleteDialog.value = true }
async function doDelete() {
  saving.value = true
  try {
    await api.deleteFollowupSequence(deleteTarget.value.id)
    sequences.value = sequences.value.filter((s) => s.id !== deleteTarget.value.id)
    deleteDialog.value = false
    toast.success('Acompanhamento excluído.')
  } catch (e) { toast.error(e.message) } finally { saving.value = false }
}

onMounted(load)
</script>

<style scoped>
.step-card { background: rgba(255,255,255,0.02); transition: opacity .15s, border-color .15s; }
.step-card.is-dragging { opacity: .4; }
.step-card.is-drag-over { border-color: #6366F1 !important; }
.drag-handle { cursor: grab; }
.drag-handle:active { cursor: grabbing; }
</style>
