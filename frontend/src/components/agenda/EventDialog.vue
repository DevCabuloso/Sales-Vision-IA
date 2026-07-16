<template>
  <v-dialog :model-value="modelValue" max-width="560" scrollable @update:model-value="$emit('update:modelValue', $event)">
    <v-card class="glass" border>
      <v-card-title class="text-h6 font-weight-bold d-flex align-center ga-2">
        {{ isEdit ? 'Editar agendamento' : 'Novo agendamento' }}
        <v-spacer />
        <v-btn icon variant="text" size="small" @click="close"><v-icon icon="mdi-close" size="18" /></v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text style="max-height:70vh">
        <v-text-field v-model="form.title" label="Título" class="mb-2" autofocus />

        <div class="d-flex align-center justify-space-between mb-2">
          <span class="text-body-2">Dia inteiro</span>
          <v-switch v-model="form.allDay" color="primary" hide-details density="compact" />
        </div>

        <div class="d-flex ga-2 mb-2">
          <v-text-field
            v-model="startLocal" :type="form.allDay ? 'date' : 'datetime-local'"
            label="Início" density="comfortable"
          />
          <v-text-field
            v-model="endLocal" :type="form.allDay ? 'date' : 'datetime-local'"
            label="Término" density="comfortable"
          />
        </div>

        <v-textarea v-model="form.description" label="Descrição" rows="2" auto-grow class="mb-2" />
        <v-text-field v-model="form.location" label="Local (opcional)" prepend-inner-icon="mdi-map-marker-outline" class="mb-2" />

        <v-autocomplete
          v-model="form.leadId" :items="leadItems" item-title="title" item-value="value"
          label="Vincular a um lead (opcional)" clearable prepend-inner-icon="mdi-account-outline"
          class="mb-2" @update:model-value="onLeadPick"
        />

        <v-combobox
          v-model="guestInput" label="Convidados (e-mail)" multiple chips closable-chips
          prepend-inner-icon="mdi-account-multiple-outline" class="mb-2" hide-selected
          :rules="[guestsRule]"
        />

        <div class="mb-3">
          <span class="text-caption font-weight-bold d-block mb-1" style="color:#9FB0BC">Cor</span>
          <div class="d-flex ga-2 flex-wrap">
            <button
              v-for="c in COLOR_OPTIONS" :key="c.key" type="button" class="color-dot"
              :style="`background:${c.hex}`" :class="{ selected: form.color === c.key }"
              @click="form.color = form.color === c.key ? null : c.key"
            />
          </div>
        </div>

        <!-- recorrência: só é possível definir na criação (edição de série usa o escopo this/following/all) -->
        <div v-if="!isEdit" class="mb-3">
          <v-select v-model="recurrence.freq" :items="recurrenceOptions" label="Repetir" density="comfortable" />
          <template v-if="recurrence.freq !== 'none'">
            <div class="d-flex ga-2 align-center mb-2">
              <span class="text-body-2" style="color:#9FB0BC">A cada</span>
              <v-text-field v-model.number="recurrence.interval" type="number" min="1" max="365" density="compact" style="max-width:80px" hide-details />
              <span class="text-body-2" style="color:#9FB0BC">{{ intervalUnitLabel }}</span>
            </div>
            <div v-if="recurrence.freq === 'weekly'" class="d-flex ga-1 flex-wrap mb-2">
              <v-chip
                v-for="d in WEEKDAYS" :key="d.code" size="small" variant="tonal"
                :color="recurrence.byDay.includes(d.code) ? 'primary' : undefined"
                @click="toggleByDay(d.code)"
              >{{ d.label }}</v-chip>
            </div>
            <v-radio-group v-model="recurrence.endMode" density="compact" hide-details class="mb-2">
              <v-radio value="never" label="Nunca termina" />
              <div class="d-flex align-center ga-2">
                <v-radio value="count" />
                <span class="text-body-2">Após</span>
                <v-text-field
                  v-model.number="recurrence.count" type="number" min="1" max="500" density="compact"
                  style="max-width:80px" hide-details :disabled="recurrence.endMode !== 'count'"
                />
                <span class="text-body-2">ocorrências</span>
              </div>
              <div class="d-flex align-center ga-2">
                <v-radio value="until" />
                <span class="text-body-2">Em</span>
                <v-text-field
                  v-model="recurrence.until" type="date" density="compact" hide-details
                  :disabled="recurrence.endMode !== 'until'"
                />
              </div>
            </v-radio-group>
          </template>
        </div>

        <!-- lembretes -->
        <div class="mb-2">
          <span class="text-caption font-weight-bold d-block mb-1" style="color:#9FB0BC">Lembretes</span>
          <div v-for="(r, i) in reminders" :key="i" class="d-flex ga-2 align-center mb-2">
            <v-text-field v-model.number="r.value" type="number" min="0" density="compact" style="max-width:70px" hide-details />
            <v-select v-model="r.unit" :items="unitOptions" density="compact" style="max-width:110px" hide-details />
            <span class="text-body-2" style="color:#9FB0BC">antes, via</span>
            <v-select v-model="r.method" :items="methodOptions" density="compact" style="max-width:130px" hide-details />
            <v-btn icon size="x-small" variant="text" color="error" @click="reminders.splice(i, 1)">
              <v-icon icon="mdi-close" size="14" />
            </v-btn>
          </div>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addReminder">Adicionar lembrete</v-btn>
        </div>

        <v-alert v-if="formError" type="error" variant="tonal" density="compact" :text="formError" class="mt-2" />
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-4 py-3">
        <v-btn v-if="isEdit" variant="text" color="error" :loading="deleting" @click="confirmDelete">Excluir</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancelar</v-btn>
        <v-btn color="primary" :loading="saving" @click="save">Salvar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- confirmação de escopo pra série recorrente -->
  <v-dialog v-model="scopeDialog.show" max-width="380">
    <v-card class="glass" border>
      <v-card-title class="text-subtitle-1 font-weight-bold">{{ scopeDialog.title }}</v-card-title>
      <v-card-text>
        <v-radio-group v-model="scopeDialog.scope" density="compact" hide-details>
          <v-radio value="this" label="Somente este evento" />
          <v-radio value="following" label="Este e os seguintes" :disabled="isGoogleSeries" />
          <v-radio value="all" label="Todos os eventos da série" :disabled="isGoogleSeries" />
        </v-radio-group>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="scopeDialog.show = false; scopeDialog.resolve(null)">Cancelar</v-btn>
        <v-btn color="primary" @click="scopeDialog.show = false; scopeDialog.resolve(scopeDialog.scope)">Confirmar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { api } from '@/services/api'
import { eventSchema } from '@/schemas/appointments'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  event: { type: Object, default: null }, // null = criar; objeto = editar
  initialDate: { type: String, default: null }, // pré-preenche start/end ao criar
})
const emit = defineEmits(['update:modelValue', 'saved', 'deleted', 'error'])

const COLOR_OPTIONS = [
  { key: 'blue', hex: '#38BDF8' }, { key: 'green', hex: '#10B981' }, { key: 'red', hex: '#EF4444' },
  { key: 'yellow', hex: '#F59E0B' }, { key: 'purple', hex: '#8B5CF6' }, { key: 'gray', hex: '#6B7C88' },
  { key: 'orange', hex: '#FB923C' }, { key: 'teal', hex: '#14B8A6' },
]
const WEEKDAYS = [
  { code: 'SU', label: 'D' }, { code: 'MO', label: 'S' }, { code: 'TU', label: 'T' }, { code: 'WE', label: 'Q' },
  { code: 'TH', label: 'Q' }, { code: 'FR', label: 'S' }, { code: 'SA', label: 'S' },
]

const isEdit = computed(() => !!props.event?.id)
const isGoogleSeries = computed(() => !!props.event?.google_recurring_event_id)
const isPartOfSeries = computed(() => !!(props.event?.recurrence_parent_id || props.event?.recurrence_rule || props.event?.google_recurring_event_id))

const saving = ref(false)
const deleting = ref(false)
const formError = ref('')
const leads = ref([])
const guestInput = ref([])

const form = reactive({
  title: '', description: '', location: '', color: null, allDay: false,
  leadId: null, leadName: '',
})
const startLocal = ref('')
const endLocal = ref('')

const recurrenceOptions = [
  { title: 'Não repete', value: 'none' },
  { title: 'Diariamente', value: 'daily' },
  { title: 'Semanalmente', value: 'weekly' },
  { title: 'Mensalmente', value: 'monthly' },
]
const recurrence = reactive({ freq: 'none', interval: 1, byDay: [], endMode: 'never', count: 10, until: '' })
const intervalUnitLabel = computed(() => ({ daily: 'dia(s)', weekly: 'semana(s)', monthly: 'mês(es)' }[recurrence.freq] || ''))

function toggleByDay(code) {
  const i = recurrence.byDay.indexOf(code)
  if (i >= 0) recurrence.byDay.splice(i, 1)
  else recurrence.byDay.push(code)
}

const unitOptions = [{ title: 'minutos', value: 'minutes' }, { title: 'horas', value: 'hours' }, { title: 'dias', value: 'days' }]
const methodOptions = [{ title: 'Notificação', value: 'popup' }, { title: 'E-mail', value: 'email' }]
const reminders = ref([])
function addReminder() { reminders.value.push({ value: 30, unit: 'minutes', method: 'popup' }) }
const UNIT_TO_MINUTES = { minutes: 1, hours: 60, days: 1440 }

const leadItems = computed(() => leads.value.map((l) => ({ title: l.name || l.phone || 'Sem nome', value: l.id })))
function onLeadPick(id) {
  const lead = leads.value.find((l) => l.id === id)
  form.leadName = lead?.name || ''
}

function guestsRule(items) {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const bad = (items || []).find((e) => !emailRe.test(typeof e === 'string' ? e : e?.email || ''))
  return !bad || `E-mail inválido: ${bad}`
}

function pad(n) { return String(n).padStart(2, '0') }
function toDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function toDateInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function resetForm() {
  formError.value = ''
  guestInput.value = []
  reminders.value = []
  Object.assign(recurrence, { freq: 'none', interval: 1, byDay: [], endMode: 'never', count: 10, until: '' })

  if (props.event) {
    Object.assign(form, {
      title: props.event.title || '', description: props.event.description || '', location: props.event.location || '',
      color: props.event.color || null, allDay: !!props.event.all_day,
      leadId: props.event.leadId || null, leadName: props.event.leadName || '',
    })
    startLocal.value = form.allDay ? toDateInput(props.event.start_time) : toDatetimeLocal(props.event.start_time)
    endLocal.value = form.allDay ? toDateInput(props.event.end_time) : toDatetimeLocal(props.event.end_time)
    guestInput.value = (props.event.guests || []).map((g) => g.email)
  } else {
    Object.assign(form, { title: '', description: '', location: '', color: null, allDay: false, leadId: null, leadName: '' })
    const base = props.initialDate ? new Date(props.initialDate) : new Date()
    if (base.getMinutes() !== 0 || base.getSeconds() !== 0) { base.setMinutes(0, 0, 0); base.setHours(base.getHours() + 1) }
    const end = new Date(base.getTime() + 30 * 60_000)
    startLocal.value = toDatetimeLocal(base.toISOString())
    endLocal.value = toDatetimeLocal(end.toISOString())
  }
}

watch(() => props.modelValue, (open) => { if (open) resetForm() }, { immediate: true })

async function loadLeads() {
  try { leads.value = await api.listLeads() } catch { leads.value = [] }
}
loadLeads()

function buildRecurrencePayload() {
  if (recurrence.freq === 'none') return undefined
  const rule = { freq: recurrence.freq }
  if (recurrence.interval > 1) rule.interval = recurrence.interval
  if (recurrence.freq === 'weekly' && recurrence.byDay.length) rule.byDay = recurrence.byDay
  if (recurrence.endMode === 'count') rule.count = recurrence.count
  else if (recurrence.endMode === 'until' && recurrence.until) rule.until = new Date(`${recurrence.until}T23:59:59`).toISOString()
  return rule
}

function localToIso(value, allDay) {
  if (!value) return null
  return allDay ? new Date(`${value}T12:00:00`).toISOString() : new Date(value).toISOString()
}

function buildReminders() {
  return reminders.value
    .filter((r) => r.value > 0)
    .map((r) => ({ method: r.method, minutesBefore: r.value * UNIT_TO_MINUTES[r.unit] }))
}

function close() { emit('update:modelValue', false) }

const scopeDialog = reactive({ show: false, title: '', scope: 'this', resolve: () => {} })

// Retorna o scope escolhido ('this'|'following'|'all'), ou null se o usuário
// cancelou o diálogo de escopo (nesse caso o chamador não deve prosseguir).
async function pickScope(title) {
  if (!isPartOfSeries.value) return 'this'
  return new Promise((resolve) => {
    scopeDialog.title = title
    scopeDialog.scope = 'this'
    scopeDialog.resolve = resolve
    scopeDialog.show = true
  })
}

async function save() {
  formError.value = ''
  const payload = {
    title: form.title, description: form.description || undefined, location: form.location || undefined,
    color: form.color || undefined, allDay: form.allDay,
    leadId: form.leadId || undefined, leadName: form.leadName || undefined,
    start: localToIso(startLocal.value, form.allDay), end: localToIso(endLocal.value, form.allDay),
    guests: guestInput.value.length ? guestInput.value : undefined,
    reminders: buildReminders().length ? buildReminders() : undefined,
    recurrence: buildRecurrencePayload(),
  }

  const parsed = eventSchema.safeParse(payload)
  if (!parsed.success) { formError.value = parsed.error.issues[0]?.message || 'Dados inválidos.'; return }

  saving.value = true
  try {
    if (isEdit.value) {
      const scope = await pickScope('Esta reunião faz parte de uma série. O que deseja alterar?')
      if (!scope) return // usuário cancelou o diálogo de escopo
      const { recurrence: _r, ...patchPayload } = parsed.data
      await api.rescheduleAppointment(props.event.id, { ...patchPayload, scope })
    } else {
      await api.createAppointment(parsed.data)
    }
    emit('saved')
    close()
  } catch (e) {
    formError.value = e?.message || 'Erro ao salvar o agendamento.'
    emit('error', formError.value)
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  deleting.value = true
  try {
    const scope = await pickScope('Esta reunião faz parte de uma série. O que deseja excluir?')
    if (!scope) return // usuário cancelou o diálogo de escopo
    await api.cancelAppointment(props.event.id, { scope })
    emit('deleted')
    close()
  } catch (e) {
    formError.value = e?.message || 'Erro ao excluir o agendamento.'
    emit('error', formError.value)
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.color-dot {
  width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer;
  padding: 0;
}
.color-dot.selected { border-color: #fff; box-shadow: 0 0 0 2px #6366F1; }
</style>
