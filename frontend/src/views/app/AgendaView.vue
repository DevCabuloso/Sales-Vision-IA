<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Agenda</h1>
        <p class="text-body-2" style="color:#9FB0BC">Reuniões agendadas via Google Calendar.</p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-google" variant="tonal" size="small" :loading="syncing" @click="sync">Sincronizar Google</v-btn>
    </div>

    <!-- Calendário -->
    <v-card class="glass" border>
      <!-- Header do mês -->
      <div class="cal-header">
        <v-btn icon variant="text" size="small" @click="prevMonth"><v-icon icon="mdi-chevron-left" /></v-btn>
        <span class="text-subtitle-1 font-weight-bold text-capitalize">{{ monthLabel }}</span>
        <v-btn icon variant="text" size="small" @click="nextMonth"><v-icon icon="mdi-chevron-right" /></v-btn>
        <v-btn variant="tonal" size="x-small" class="ml-3" @click="goToday">Hoje</v-btn>
      </div>

      <v-divider />

      <!-- Dias da semana -->
      <div class="cal-weekdays">
        <div v-for="d in weekdays" :key="d" class="cal-weekday">{{ d }}</div>
      </div>

      <!-- Grid de dias -->
      <div v-if="loading" class="py-12 text-center">
        <v-progress-circular indeterminate color="primary" size="32" />
      </div>
      <div v-else class="cal-grid">
        <div
          v-for="day in calendarDays" :key="day.key"
          class="cal-cell"
          :class="{
            'other-month': !day.currentMonth,
            'is-today': day.isToday,
            'is-selected': selectedDay && day.key === selectedDay,
            'has-events': day.appts.length > 0
          }"
          @click="selectDay(day)"
        >
          <span class="cal-day-num">{{ day.num }}</span>
          <div class="cal-dots">
            <span
              v-for="(a, i) in day.appts.slice(0, 3)" :key="i"
              class="cal-dot"
              :class="statusColor(a.status)"
            />
            <span v-if="day.appts.length > 3" class="cal-more">+{{ day.appts.length - 3 }}</span>
          </div>
        </div>
      </div>
    </v-card>

    <!-- Painel do dia selecionado -->
    <div v-if="selectedDay" class="mt-4">
      <div class="d-flex align-center justify-space-between mb-3">
        <span class="text-subtitle-2 font-weight-bold">{{ selectedDayLabel }}</span>
        <v-btn icon size="x-small" variant="text" @click="selectedDay = null"><v-icon icon="mdi-close" size="16" /></v-btn>
      </div>

      <div v-if="selectedDayAppts.length === 0" class="text-center py-6" style="color:#6B7C88;font-size:13px">
        <v-icon icon="mdi-calendar-blank-outline" size="36" class="d-block mx-auto mb-2" style="opacity:.3" />
        Nenhuma reunião neste dia
      </div>

      <v-row v-else>
        <v-col v-for="a in selectedDayAppts" :key="a.id" cols="12" sm="6" md="4">
          <v-card class="glass pa-4" border>
            <div class="d-flex align-center justify-space-between mb-2">
              <v-chip :color="statusColor(a.status)" variant="tonal" size="x-small">{{ statusLabel(a.status) }}</v-chip>
              <span class="text-caption" style="color:#9FB0BC">{{ a.provider }}</span>
            </div>
            <div class="text-body-2 font-weight-bold mb-1">{{ a.leadName || a.title }}</div>
            <div class="d-flex align-center ga-1 text-caption mb-3" style="color:#9FB0BC">
              <v-icon icon="mdi-clock-outline" size="14" />
              {{ formatTime(a.startTime) }} – {{ formatTime(a.endTime) }}
            </div>
            <div class="d-flex ga-2">
              <v-btn v-if="a.meetingLink" color="primary" variant="tonal" size="small" prepend-icon="mdi-video" :href="a.meetingLink" target="_blank">Entrar</v-btn>
              <v-btn v-if="a.status !== 'cancelled'" variant="text" size="small" color="error" :loading="cancelling === a.id" @click="cancel(a)">Cancelar</v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <!-- Lista geral quando nenhum dia selecionado e há eventos no mês -->
    <div v-else-if="monthAppts.length > 0" class="mt-4">
      <div class="text-subtitle-2 font-weight-bold mb-3">Reuniões em {{ monthLabel }}</div>
      <v-row>
        <v-col v-for="a in monthAppts" :key="a.id" cols="12" sm="6" md="4">
          <v-card class="glass pa-4" border>
            <div class="d-flex align-center justify-space-between mb-2">
              <v-chip :color="statusColor(a.status)" variant="tonal" size="x-small">{{ statusLabel(a.status) }}</v-chip>
              <span class="text-caption" style="color:#9FB0BC">{{ a.provider }}</span>
            </div>
            <div class="text-body-2 font-weight-bold mb-1">{{ a.leadName || a.title }}</div>
            <div class="d-flex align-center ga-1 text-caption mb-3" style="color:#9FB0BC">
              <v-icon icon="mdi-clock-outline" size="14" />
              {{ formatRange(a.startTime, a.endTime) }}
            </div>
            <div class="d-flex ga-2">
              <v-btn v-if="a.meetingLink" color="primary" variant="tonal" size="small" prepend-icon="mdi-video" :href="a.meetingLink" target="_blank">Entrar</v-btn>
              <v-btn v-if="a.status !== 'cancelled'" variant="text" size="small" color="error" :loading="cancelling === a.id" @click="cancel(a)">Cancelar</v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import { useRealtime } from '@/composables/useRealtime'
import { useAuthStore } from '@/stores/auth'

const auth     = useAuthStore()
const loading  = ref(true)
const syncing  = ref(false)
const cancelling = ref(null)
const appts    = ref([])
const cursor   = ref(new Date())   // mês exibido
const selectedDay = ref(null)      // string 'YYYY-MM-DD'

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ——— navegação de mês ———
function prevMonth() { const d = new Date(cursor.value); d.setMonth(d.getMonth() - 1); cursor.value = d; selectedDay.value = null }
function nextMonth() { const d = new Date(cursor.value); d.setMonth(d.getMonth() + 1); cursor.value = d; selectedDay.value = null }
function goToday()  { cursor.value = new Date(); selectedDay.value = toKey(new Date()) }

const monthLabel = computed(() => cursor.value.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }))

// ——— helpers de data ———
function toKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

// bare date strings (YYYY-MM-DD) vindas de eventos all-day do Google Calendar são interpretadas
// pelo JS como UTC midnight, o que causa shift de 1 dia em fuso UTC-3. Parseamos como local noon.
function parseDt(s) {
  if (!s) return new Date()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0)
  }
  return new Date(s)
}

function apptKey(a) { if (!a.startTime) return null; return toKey(parseDt(a.startTime)) }

// ——— grid do calendário ———
const calendarDays = computed(() => {
  const year  = cursor.value.getFullYear()
  const month = cursor.value.getMonth()
  const today = toKey(new Date())

  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)

  const apptsByDay = {}
  for (const a of appts.value) {
    const k = apptKey(a)
    if (k) { if (!apptsByDay[k]) apptsByDay[k] = []; apptsByDay[k].push(a) }
  }

  const days = []
  // dias do mês anterior para completar a primeira semana
  for (let i = first.getDay(); i > 0; i--) {
    const d = new Date(year, month, 1 - i)
    const key = toKey(d)
    days.push({ key, num: d.getDate(), currentMonth: false, isToday: key === today, appts: apptsByDay[key] || [] })
  }
  // dias do mês atual
  for (let i = 1; i <= last.getDate(); i++) {
    const d = new Date(year, month, i)
    const key = toKey(d)
    days.push({ key, num: i, currentMonth: true, isToday: key === today, appts: apptsByDay[key] || [] })
  }
  // dias do próximo mês para completar a última semana
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i)
      const key = toKey(d)
      days.push({ key, num: d.getDate(), currentMonth: false, isToday: key === today, appts: apptsByDay[key] || [] })
    }
  }
  return days
})

// ——— dia selecionado ———
function selectDay(day) { selectedDay.value = selectedDay.value === day.key ? null : day.key }

const selectedDayLabel = computed(() => {
  if (!selectedDay.value) return ''
  const [y, m, d] = selectedDay.value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
})

const selectedDayAppts = computed(() => {
  if (!selectedDay.value) return []
  return appts.value.filter((a) => apptKey(a) === selectedDay.value)
})

const monthAppts = computed(() => {
  const year  = cursor.value.getFullYear()
  const month = cursor.value.getMonth()
  return appts.value.filter((a) => {
    if (!a.startTime) return false
    const d = parseDt(a.startTime)
    return d.getFullYear() === year && d.getMonth() === month
  }).sort((a, b) => parseDt(a.startTime) - parseDt(b.startTime))
})

// ——— helpers visuais ———
function statusColor(s) { return { scheduled: 'info', confirmed: 'success', completed: 'secondary', cancelled: 'error' }[s] || 'info' }
function statusLabel(s) { return { scheduled: 'Agendada', confirmed: 'Confirmada', completed: 'Concluída', cancelled: 'Cancelada' }[s] || s }

function formatTime(d) { if (!d) return '—'; return parseDt(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
function formatRange(start, end) {
  if (!start) return '—'
  const s = parseDt(start)
  let txt = s.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  if (end) txt += ' – ' + parseDt(end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return txt
}

// ——— dados ———
async function load() {
  loading.value = true
  try {
    const raw = (await api.listAppointments().catch(() => [])) || []
    appts.value = raw.map((a) => ({
      id: a.id, leadName: a.lead_name, title: a.title,
      provider: a.provider, startTime: a.start_time, endTime: a.end_time,
      meetingLink: a.meeting_link, status: a.status,
    }))
  } finally { loading.value = false }
}

async function sync() {
  syncing.value = true
  try {
    await api.syncAppointments()
    await load()
  } catch { /* Google Calendar pode não estar conectado */ }
  finally { syncing.value = false }
}

async function cancel(a) {
  cancelling.value = a.id
  try { await api.cancelAppointment(a.id); await load() }
  catch (e) { console.warn(e.message) } finally { cancelling.value = null }
}

onMounted(async () => {
  await api.syncAppointments().catch(() => {})
  await load()
})

let t = null
useRealtime('appointments', auth.user?.tenantId, () => { clearTimeout(t); t = setTimeout(load, 300) })
</script>

<style scoped>
/* ——— HEADER ——— */
.cal-header {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 16px 20px;
}

/* ——— DIAS DA SEMANA ——— */
.cal-weekdays {
  display: grid; grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.cal-weekday {
  padding: 8px 4px; text-align: center;
  font-size: 11px; font-weight: 700; color: #6B7C88;
  letter-spacing: .5px;
}

/* ——— GRID ——— */
.cal-grid {
  display: grid; grid-template-columns: repeat(7, 1fr);
}

.cal-cell {
  min-height: 80px; padding: 8px 6px 6px;
  border-right: 1px solid rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.04);
  cursor: pointer; transition: background 0.15s;
  display: flex; flex-direction: column; gap: 4px;
}
.cal-cell:hover { background: rgba(255,255,255,0.03); }
.cal-cell:nth-child(7n) { border-right: none; }

.cal-cell.other-month .cal-day-num { color: #3A4A55; }
.cal-cell.is-today .cal-day-num {
  background: #6366F1; color: white;
  border-radius: 50%; width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
}
.cal-cell.is-selected { background: rgba(99,102,241,0.1); }
.cal-cell.is-selected .cal-day-num { color: #818CF8; }

.cal-day-num {
  font-size: 12px; font-weight: 600; color: #9FB0BC;
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
}

/* ——— DOTS ——— */
.cal-dots { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.cal-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.cal-dot.info      { background: #38BDF8; }
.cal-dot.success   { background: #10B981; }
.cal-dot.secondary { background: #6B7C88; }
.cal-dot.error     { background: #EF4444; }
.cal-more { font-size: 9px; color: #6B7C88; font-weight: 600; }
</style>
