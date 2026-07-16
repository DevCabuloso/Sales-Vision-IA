<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Agenda</h1>
        <p class="text-body-2" style="color:#9FB0BC">Seus agendamentos, com ou sem o Google Calendar.</p>
      </div>
      <div class="d-flex ga-2 flex-wrap">
        <v-btn color="primary" prepend-icon="mdi-plus" size="small" @click="openCreate()">Novo agendamento</v-btn>
        <v-btn color="primary" prepend-icon="mdi-google" variant="tonal" size="small" :loading="syncing" @click="sync">Sincronizar Google</v-btn>
      </div>
    </div>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="4000" location="bottom end">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- navegação + seletor de visão -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-3">
      <div class="d-flex align-center ga-2">
        <v-btn v-if="view !== 'agenda'" icon variant="text" size="small" @click="goPrev"><v-icon icon="mdi-chevron-left" /></v-btn>
        <span class="text-subtitle-1 font-weight-bold text-capitalize">{{ rangeLabel }}</span>
        <v-btn v-if="view !== 'agenda'" icon variant="text" size="small" @click="goNext"><v-icon icon="mdi-chevron-right" /></v-btn>
        <v-btn v-if="view !== 'agenda'" variant="tonal" size="x-small" @click="goToday">Hoje</v-btn>
      </div>
      <v-btn-toggle v-model="view" color="primary" density="compact" mandatory variant="outlined">
        <v-btn value="month" size="small">Mês</v-btn>
        <v-btn value="week" size="small">Semana</v-btn>
        <v-btn value="day" size="small">Dia</v-btn>
        <v-btn value="agenda" size="small">Agenda</v-btn>
      </v-btn-toggle>
    </div>

    <div v-if="loading" class="py-12 text-center">
      <v-progress-circular indeterminate color="primary" size="32" />
    </div>

    <template v-else>
      <!-- ═══ MÊS ═══ -->
      <template v-if="view === 'month'">
        <v-card class="glass" border>
          <div class="cal-weekdays">
            <div v-for="d in WEEKDAYS_SHORT" :key="d" class="cal-weekday">{{ d }}</div>
          </div>
          <div class="cal-grid">
            <div
              v-for="day in calendarDays" :key="day.key" class="cal-cell"
              :class="{ 'other-month': !day.currentMonth, 'is-today': day.isToday, 'is-selected': selectedDay && day.key === selectedDay }"
              @click="selectDay(day)"
              @dragover.prevent
              @drop="onCellDrop($event, day)"
            >
              <div class="d-flex align-center justify-space-between">
                <span class="cal-day-num">{{ day.num }}</span>
                <button class="cal-add-btn" type="button" title="Novo agendamento" @click.stop="openCreate(day.date)">
                  <v-icon icon="mdi-plus" size="12" />
                </button>
              </div>
              <div class="cal-dots">
                <span
                  v-for="(a, i) in day.appts.slice(0, 4)" :key="i" class="cal-dot" draggable="true"
                  :style="`background:${colorFor(a)}`" :title="a.title"
                  @dragstart="onDotDragStart($event, a)"
                  @click.stop="openEdit(a)"
                />
                <span v-if="day.appts.length > 4" class="cal-more">+{{ day.appts.length - 4 }}</span>
              </div>
            </div>
          </div>
        </v-card>

        <div v-if="selectedDay" class="mt-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-subtitle-2 font-weight-bold">{{ selectedDayLabel }}</span>
            <v-btn icon size="x-small" variant="text" @click="selectedDay = null"><v-icon icon="mdi-close" size="16" /></v-btn>
          </div>
          <div v-if="selectedDayAppts.length === 0" class="text-center py-6" style="color:#6B7C88;font-size:13px">
            <v-icon icon="mdi-calendar-blank-outline" size="36" class="d-block mx-auto mb-2" style="opacity:.3" />
            Nenhum agendamento neste dia
          </div>
          <v-row v-else>
            <v-col v-for="a in selectedDayAppts" :key="a.id" cols="12" sm="6" md="4">
              <ApptCard :appt="a" @edit="openEdit(a)" @cancel="quickCancel(a)" />
            </v-col>
          </v-row>
        </div>
        <div v-else-if="monthAppts.length > 0" class="mt-4">
          <div class="text-subtitle-2 font-weight-bold mb-3">Agendamentos em {{ rangeLabel }}</div>
          <v-row>
            <v-col v-for="a in monthAppts" :key="a.id" cols="12" sm="6" md="4">
              <ApptCard :appt="a" @edit="openEdit(a)" @cancel="quickCancel(a)" />
            </v-col>
          </v-row>
        </div>
      </template>

      <!-- ═══ SEMANA / DIA ═══ -->
      <WeekView
        v-else-if="view === 'week' || view === 'day'"
        :days="weekDays" :events="activeAppts"
        @edit="openEdit"
        @create-slot="openCreate"
        @reschedule="onReschedule"
        @resize="onResize"
      />

      <!-- ═══ AGENDA (lista) ═══ -->
      <template v-else>
        <div v-if="agendaAppts.length === 0" class="text-center py-12" style="color:#6B7C88">
          <v-icon icon="mdi-calendar-blank-outline" size="40" class="d-block mx-auto mb-2" style="opacity:.3" />
          Nenhum agendamento futuro.
        </div>
        <div v-for="group in agendaGroups" :key="group.key" class="mb-4">
          <div class="text-caption font-weight-bold mb-2 text-capitalize" style="color:#9FB0BC">{{ group.label }}</div>
          <v-row>
            <v-col v-for="a in group.items" :key="a.id" cols="12" sm="6" md="4">
              <ApptCard :appt="a" @edit="openEdit(a)" @cancel="quickCancel(a)" />
            </v-col>
          </v-row>
        </div>
      </template>
    </template>

    <EventDialog
      v-model="dialogOpen" :event="editingEvent" :initial-date="initialDateForCreate"
      @saved="onDialogSaved" @deleted="onDialogDeleted" @error="(msg) => notify(msg, 'error')"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, h } from 'vue'
import { api } from '@/services/api'
import { useRealtime } from '@/composables/useRealtime'
import { useAuthStore } from '@/stores/auth'
import EventDialog from '@/components/agenda/EventDialog.vue'
import WeekView from '@/components/agenda/WeekView.vue'

const auth     = useAuthStore()
const loading  = ref(true)
const syncing  = ref(false)
const appts    = ref([])
const cursor   = ref(new Date())
const view     = ref('month')
const selectedDay = ref(null)

const dialogOpen = ref(false)
const editingEvent = ref(null)
const initialDateForCreate = ref(null)

const snackbar = ref({ show: false, message: '', color: 'success' })
function notify(message, color = 'success') { snackbar.value = { show: true, message, color } }

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const COLOR_HEX = {
  blue: '#38BDF8', green: '#10B981', red: '#EF4444', yellow: '#F59E0B',
  purple: '#8B5CF6', gray: '#6B7C88', orange: '#FB923C', teal: '#14B8A6',
}
const STATUS_HEX = { scheduled: '#38BDF8', confirmed: '#10B981', completed: '#6B7C88', cancelled: '#EF4444' }
function colorFor(a) { return COLOR_HEX[a.color] || STATUS_HEX[a.status] || '#38BDF8' }
function statusLabel(s) { return { scheduled: 'Agendada', confirmed: 'Confirmada', completed: 'Concluída', cancelled: 'Cancelada' }[s] || s }

// ——— helpers de data ———
function toKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

// bare date strings (YYYY-MM-DD) vindas de eventos all-day são interpretadas
// pelo JS como UTC midnight, causando shift de 1 dia em fuso UTC-3. Parseamos como local noon.
function parseDt(s) {
  if (!s) return new Date()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0)
  }
  return new Date(s)
}
function apptKey(a) { if (!a.start_time) return null; return toKey(parseDt(a.start_time)) }

const activeAppts = computed(() => appts.value.filter((a) => a.status !== 'cancelled'))

// ——— navegação ———
function goPrev() {
  const d = new Date(cursor.value)
  if (view.value === 'month') d.setMonth(d.getMonth() - 1)
  else if (view.value === 'week') d.setDate(d.getDate() - 7)
  else d.setDate(d.getDate() - 1)
  cursor.value = d
  selectedDay.value = null
}
function goNext() {
  const d = new Date(cursor.value)
  if (view.value === 'month') d.setMonth(d.getMonth() + 1)
  else if (view.value === 'week') d.setDate(d.getDate() + 7)
  else d.setDate(d.getDate() + 1)
  cursor.value = d
  selectedDay.value = null
}
function goToday() { cursor.value = new Date(); selectedDay.value = view.value === 'month' ? toKey(new Date()) : null }

const rangeLabel = computed(() => {
  if (view.value === 'month') return cursor.value.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
  if (view.value === 'day') return cursor.value.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  if (view.value === 'week') {
    const days = weekDays.value
    const first = days[0].date, last = days[days.length - 1].date
    if (first.getMonth() === last.getMonth()) return `${first.getDate()}–${last.getDate()} de ${first.toLocaleString('pt-BR', { month: 'long' })}`
    return `${first.getDate()} ${first.toLocaleString('pt-BR', { month: 'short' })} – ${last.getDate()} ${last.toLocaleString('pt-BR', { month: 'short' })}`
  }
  return 'Próximos agendamentos'
})

// ——— grid do mês ———
const calendarDays = computed(() => {
  const year = cursor.value.getFullYear()
  const month = cursor.value.getMonth()
  const today = toKey(new Date())

  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)

  const apptsByDay = {}
  for (const a of appts.value) {
    if (a.status === 'cancelled') continue
    const k = apptKey(a)
    if (k) { if (!apptsByDay[k]) apptsByDay[k] = []; apptsByDay[k].push(a) }
  }

  const days = []
  for (let i = first.getDay(); i > 0; i--) {
    const d = new Date(year, month, 1 - i)
    const key = toKey(d)
    days.push({ key, date: d, num: d.getDate(), currentMonth: false, isToday: key === today, appts: apptsByDay[key] || [] })
  }
  for (let i = 1; i <= last.getDate(); i++) {
    const d = new Date(year, month, i)
    const key = toKey(d)
    days.push({ key, date: d, num: i, currentMonth: true, isToday: key === today, appts: apptsByDay[key] || [] })
  }
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i)
      const key = toKey(d)
      days.push({ key, date: d, num: d.getDate(), currentMonth: false, isToday: key === today, appts: apptsByDay[key] || [] })
    }
  }
  return days
})

function selectDay(day) { selectedDay.value = selectedDay.value === day.key ? null : day.key }

const selectedDayLabel = computed(() => {
  if (!selectedDay.value) return ''
  const [y, m, d] = selectedDay.value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
})
const selectedDayAppts = computed(() => {
  if (!selectedDay.value) return []
  return appts.value.filter((a) => a.status !== 'cancelled' && apptKey(a) === selectedDay.value)
})
const monthAppts = computed(() => {
  const year = cursor.value.getFullYear(), month = cursor.value.getMonth()
  return appts.value.filter((a) => {
    if (a.status === 'cancelled' || !a.start_time) return false
    const d = parseDt(a.start_time)
    return d.getFullYear() === year && d.getMonth() === month
  }).sort((a, b) => parseDt(a.start_time) - parseDt(b.start_time))
})

// ——— semana/dia ———
function dayObj(d) {
  const key = toKey(d)
  return { key, date: new Date(d), num: d.getDate(), dow: WEEKDAYS_SHORT[d.getDay()], isToday: key === toKey(new Date()) }
}
const weekDays = computed(() => {
  if (view.value === 'day') return [dayObj(cursor.value)]
  const start = new Date(cursor.value)
  start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 7 }, (_, i) => dayObj(addDays(start, i)))
})

// ——— agenda (lista cronológica) ———
const agendaAppts = computed(() => {
  const now = startOfDay(new Date())
  return appts.value
    .filter((a) => a.status !== 'cancelled' && a.start_time && parseDt(a.start_time) >= now)
    .sort((a, b) => parseDt(a.start_time) - parseDt(b.start_time))
})
const agendaGroups = computed(() => {
  const groups = []
  const byKey = {}
  for (const a of agendaAppts.value) {
    const k = apptKey(a)
    if (!byKey[k]) {
      const [y, m, d] = k.split('-').map(Number)
      byKey[k] = { key: k, label: new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }), items: [] }
      groups.push(byKey[k])
    }
    byKey[k].items.push(a)
  }
  return groups
})

// ——— dados ———
function mapAppt(a) {
  return {
    id: a.id, leadId: a.lead_id, leadName: a.lead_name, title: a.title,
    provider: a.provider, externalId: a.external_id,
    start_time: a.start_time, end_time: a.end_time,
    meetingLink: a.meeting_link, status: a.status,
    description: a.description, location: a.location, color: a.color, all_day: a.all_day,
    timezone: a.timezone, guests: a.guests || [],
    recurrence_rule: a.recurrence_rule, recurrence_parent_id: a.recurrence_parent_id,
    google_recurring_event_id: a.google_recurring_event_id,
  }
}

async function load() {
  loading.value = true
  try {
    const from = new Date(cursor.value.getFullYear(), cursor.value.getMonth() - 1, 1).toISOString()
    const to = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + 2, 0).toISOString()
    const raw = (await api.listAppointments({ from, to, limit: 1000 }).catch(() => [])) || []
    appts.value = raw.map(mapAppt)
  } finally { loading.value = false }
}

watch(cursor, load)

async function sync() {
  syncing.value = true
  try {
    const result = await api.syncAppointments()
    await load()
    if (result?.warning) notify(result.warning, 'warning')
    else notify(`Sincronizado: ${result?.synced ?? 0} evento(s) atualizados.`, 'success')
  } catch (e) {
    notify(e?.message || 'Erro ao sincronizar com Google Calendar.', 'error')
  } finally {
    syncing.value = false
  }
}

function openCreate(date) {
  editingEvent.value = null
  initialDateForCreate.value = date instanceof Date ? date.toISOString() : (date || null)
  dialogOpen.value = true
}
function openEdit(a) {
  editingEvent.value = a
  dialogOpen.value = true
}
function onDialogSaved() { notify('Agendamento salvo com sucesso.'); load() }
function onDialogDeleted() { notify('Agendamento excluído.'); load() }

async function quickCancel(a) {
  try {
    await api.cancelAppointment(a.id)
    notify('Agendamento cancelado.')
    await load()
  } catch (e) {
    notify(e?.message || 'Erro ao cancelar o agendamento.', 'error')
  }
}

async function onReschedule({ event, start, end }) {
  try {
    await api.rescheduleAppointment(event.id, { start, end, scope: 'this' })
    await load()
  } catch (e) {
    notify(e?.message || 'Erro ao reagendar.', 'error')
  }
}
async function onResize({ event, end }) {
  try {
    await api.rescheduleAppointment(event.id, { end, scope: 'this' })
    await load()
  } catch (e) {
    notify(e?.message || 'Erro ao alterar duração.', 'error')
  }
}

// ——— drag and drop no mês (só muda a data, preserva o horário) ———
function onDotDragStart(evt, a) {
  evt.dataTransfer.setData('text/plain', a.id)
  evt.dataTransfer.effectAllowed = 'move'
}
async function onCellDrop(evt, day) {
  const id = evt.dataTransfer.getData('text/plain')
  const a = appts.value.find((x) => x.id === id)
  if (!a) return
  const oldStart = parseDt(a.start_time)
  const newStart = new Date(day.date)
  newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0)
  const duration = parseDt(a.end_time) - oldStart
  const newEnd = new Date(newStart.getTime() + duration)
  try {
    await api.rescheduleAppointment(a.id, { start: newStart.toISOString(), end: newEnd.toISOString(), scope: 'this' })
    await load()
  } catch (e) {
    notify(e?.message || 'Erro ao reagendar.', 'error')
  }
}

// ——— card de agendamento (mês/dia-selecionado/agenda) ———
const ApptCard = {
  props: { appt: Object },
  emits: ['edit', 'cancel'],
  setup(props, { emit }) {
    return () => h('div', {
      class: 'glass pa-4 rounded-lg appt-card', style: 'border:1px solid rgba(255,255,255,0.08);cursor:pointer',
      onClick: () => emit('edit'),
    }, [
      h('div', { class: 'd-flex align-center justify-space-between mb-2' }, [
        h('span', {
          class: 'text-caption font-weight-bold px-2 py-1 rounded',
          style: `background:${colorFor(props.appt)}22;color:${colorFor(props.appt)}`,
        }, statusLabel(props.appt.status)),
        h('span', { class: 'text-caption', style: 'color:#9FB0BC' }, props.appt.provider === 'google' ? 'Google' : 'Plataforma'),
      ]),
      h('div', { class: 'text-body-2 font-weight-bold mb-1' }, props.appt.leadName || props.appt.title),
      h('div', { class: 'text-caption mb-3', style: 'color:#9FB0BC' },
        props.appt.all_day ? 'Dia inteiro' : `${fmtTime(props.appt.start_time)} – ${fmtTime(props.appt.end_time)}`),
      h('div', { class: 'd-flex ga-2', onClick: (e) => e.stopPropagation() }, [
        props.appt.meetingLink ? h('a', {
          href: props.appt.meetingLink, target: '_blank', class: 'text-caption text-primary font-weight-bold text-decoration-none',
        }, '🔗 Entrar') : null,
        props.appt.status !== 'cancelled' ? h('button', {
          class: 'text-caption', style: 'color:#EF4444;background:none;border:none;cursor:pointer',
          onClick: () => emit('cancel'),
        }, 'Cancelar') : null,
      ]),
    ])
  },
}
function fmtTime(d) { if (!d) return '—'; return parseDt(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }

onMounted(async () => {
  await api.syncAppointments().catch(() => {})
  await load()
})

let t = null
useRealtime('appointments', auth.user?.tenantId, () => { clearTimeout(t); t = setTimeout(load, 300) })
</script>

<style scoped>
.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); border-bottom: 1px solid rgba(255,255,255,0.06); }
.cal-weekday { padding: 8px 4px; text-align: center; font-size: 11px; font-weight: 700; color: #6B7C88; letter-spacing: .5px; }

.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.cal-cell {
  min-height: 84px; padding: 8px 6px 6px;
  border-right: 1px solid rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.04);
  cursor: pointer; transition: background 0.15s; display: flex; flex-direction: column; gap: 4px;
}
.cal-cell:hover { background: rgba(255,255,255,0.03); }
.cal-cell:hover .cal-add-btn { opacity: 1; }
.cal-cell:nth-child(7n) { border-right: none; }
.cal-cell.other-month .cal-day-num { color: #3A4A55; }
.cal-cell.is-today .cal-day-num { background: #6366F1; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
.cal-cell.is-selected { background: rgba(99,102,241,0.1); }
.cal-cell.is-selected .cal-day-num { color: #818CF8; }
.cal-day-num { font-size: 12px; font-weight: 600; color: #9FB0BC; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
.cal-add-btn {
  opacity: 0; transition: opacity .15s; width: 18px; height: 18px; border-radius: 4px; border: none;
  background: rgba(99,102,241,0.15); color: #818CF8; display: flex; align-items: center; justify-content: center; cursor: pointer;
}

.cal-dots { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.cal-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; cursor: grab; }
.cal-more { font-size: 9px; color: #6B7C88; font-weight: 600; }

.appt-card:hover { background: rgba(255,255,255,0.03); }
</style>
