<template>
  <v-card class="glass" border>
    <!-- cabeçalho dos dias -->
    <div class="week-header" :style="`grid-template-columns: 56px repeat(${days.length}, 1fr)`">
      <div />
      <div v-for="d in days" :key="d.key" class="week-day-head" :class="{ today: d.isToday }">
        <span class="dow">{{ d.dow }}</span>
        <span class="num">{{ d.num }}</span>
      </div>
    </div>

    <!-- eventos de dia inteiro -->
    <div v-if="hasAllDay" class="week-allday" :style="`grid-template-columns: 56px repeat(${days.length}, 1fr)`">
      <div class="allday-label">Dia todo</div>
      <div v-for="d in days" :key="d.key" class="allday-col">
        <div
          v-for="ev in allDayEventsFor(d)" :key="ev.id" class="allday-chip"
          :style="`background:${colorFor(ev)}33;color:${colorFor(ev)}`"
          @click="$emit('edit', ev)"
        >{{ ev.title }}</div>
      </div>
    </div>

    <v-divider />

    <!-- grade de horas -->
    <div ref="scrollEl" class="week-scroll">
      <div class="week-grid" :style="`grid-template-columns: 56px repeat(${days.length}, 1fr); height:${HOURS * HOUR_PX}px`">
        <div class="week-hours">
          <div v-for="h in HOURS" :key="h" class="hour-label" :style="`height:${HOUR_PX}px`">{{ String(h - 1).padStart(2, '0') }}:00</div>
        </div>

        <div
          v-for="d in days" :key="d.key" class="week-col" :style="`height:${HOURS * HOUR_PX}px`"
          @click="onColumnClick($event, d)"
        >
          <div v-for="h in HOURS" :key="h" class="hour-line" :style="`height:${HOUR_PX}px`" />

          <div
            v-for="ev in timedEventsFor(d)" :key="ev.id" class="week-event"
            :style="eventStyle(ev, d)" :class="{ dragging: dragState?.event?.id === ev.id }"
            @mousedown.stop="onEventMouseDown($event, ev, d)"
            @click.stop="onEventClick(ev)"
          >
            <div class="event-body" :style="`background:${colorFor(ev)}26;border-left:3px solid ${colorFor(ev)}`">
              <span class="event-title">{{ ev.title }}</span>
              <span class="event-time">{{ formatRange(ev) }}</span>
            </div>
            <div class="resize-handle" @mousedown.stop="onResizeMouseDown($event, ev, d)" />
          </div>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  days: { type: Array, required: true }, // [{ key, date, num, dow, isToday }]
  events: { type: Array, default: () => [] },
})
const emit = defineEmits(['edit', 'create-slot', 'reschedule', 'resize'])

const HOUR_PX = 48
const HOURS = 24
const PX_PER_MIN = HOUR_PX / 60
const SNAP_MIN = 15

const COLOR_HEX = {
  blue: '#38BDF8', green: '#10B981', red: '#EF4444', yellow: '#F59E0B',
  purple: '#8B5CF6', gray: '#6B7C88', orange: '#FB923C', teal: '#14B8A6',
}
const STATUS_HEX = { scheduled: '#38BDF8', confirmed: '#10B981', completed: '#6B7C88', cancelled: '#EF4444' }
function colorFor(ev) { return COLOR_HEX[ev.color] || STATUS_HEX[ev.status] || '#38BDF8' }

function dayStartOf(d) { const x = new Date(d.date); x.setHours(0, 0, 0, 0); return x }

function timedEventsFor(d) {
  const start = dayStartOf(d)
  const end = new Date(start.getTime() + 24 * 60 * 60_000)
  return props.events.filter((ev) => {
    if (ev.all_day) return false
    const s = new Date(ev.start_time)
    return s >= start && s < end
  })
}
function allDayEventsFor(d) {
  const start = dayStartOf(d)
  const end = new Date(start.getTime() + 24 * 60 * 60_000)
  return props.events.filter((ev) => {
    if (!ev.all_day) return false
    const s = new Date(ev.start_time)
    return s >= start && s < end
  })
}
const hasAllDay = computed(() => props.days.some((d) => allDayEventsFor(d).length > 0))

function eventStyle(ev, d) {
  const dayStart = dayStartOf(d)
  const s = new Date(ev.start_time)
  const e = new Date(ev.end_time)
  const startMin = Math.max(0, (s - dayStart) / 60_000)
  const endMin = Math.min(24 * 60, Math.max(startMin + 15, (e - dayStart) / 60_000))
  return { top: `${startMin * PX_PER_MIN}px`, height: `${(endMin - startMin) * PX_PER_MIN}px` }
}

function formatRange(ev) {
  const s = new Date(ev.start_time)
  const e = new Date(ev.end_time)
  const fmt = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${fmt(s)} – ${fmt(e)}`
}

// evita que o "click" disparado pelo navegador logo após soltar um
// arrastar/redimensionar (mouseup) reabra o diálogo de edição
let suppressClick = false
function onEventClick(ev) {
  if (suppressClick) return
  emit('edit', ev)
}

// ─── criar por clique em horário vazio ───
function onColumnClick(evt, d) {
  if (evt.target.closest('.week-event')) return
  const rect = evt.currentTarget.getBoundingClientRect()
  const offsetY = evt.clientY - rect.top
  const minutes = snap((offsetY / PX_PER_MIN))
  const date = new Date(dayStartOf(d).getTime() + minutes * 60_000)
  emit('create-slot', date)
}

function snap(min) { return Math.round(min / SNAP_MIN) * SNAP_MIN }

// ─── arrastar pra reagendar ───
const dragState = ref(null)

function onEventMouseDown(evt, ev, d) {
  const startY = evt.clientY
  const colIndex = props.days.findIndex((x) => x.key === d.key)
  dragState.value = { event: ev, startY, colIndex, deltaMin: 0, deltaDays: 0 }

  function onMove(e) {
    const deltaMin = snap((e.clientY - startY) / PX_PER_MIN)
    const colEls = document.querySelectorAll('.week-col')
    let newColIndex = colIndex
    colEls.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      if (e.clientX >= r.left && e.clientX <= r.right) newColIndex = i
    })
    dragState.value = { ...dragState.value, deltaMin, deltaDays: newColIndex - colIndex }
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    const state = dragState.value
    dragState.value = null
    if (!state || (state.deltaMin === 0 && state.deltaDays === 0)) return
    suppressClick = true
    setTimeout(() => { suppressClick = false }, 0)
    const duration = new Date(ev.end_time) - new Date(ev.start_time)
    const newStart = new Date(new Date(ev.start_time).getTime() + state.deltaMin * 60_000 + state.deltaDays * 86_400_000)
    const newEnd = new Date(newStart.getTime() + duration)
    emit('reschedule', { event: ev, start: newStart.toISOString(), end: newEnd.toISOString() })
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ─── redimensionar (mudar duração) ───
function onResizeMouseDown(evt, ev) {
  const startY = evt.clientY
  let deltaMin = 0

  function onMove(e) { deltaMin = snap((e.clientY - startY) / PX_PER_MIN) }
  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    if (!deltaMin) return
    suppressClick = true
    setTimeout(() => { suppressClick = false }, 0)
    const minDurationMs = SNAP_MIN * 60_000
    const newEndMs = Math.max(new Date(ev.start_time).getTime() + minDurationMs, new Date(ev.end_time).getTime() + deltaMin * 60_000)
    emit('resize', { event: ev, end: new Date(newEndMs).toISOString() })
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

const scrollEl = ref(null)
onMounted(() => { if (scrollEl.value) scrollEl.value.scrollTop = 7 * HOUR_PX })
</script>

<style scoped>
.week-header, .week-allday { display: grid; }
.week-day-head { text-align: center; padding: 8px 4px; }
.week-day-head .dow { display: block; font-size: 11px; color: #6B7C88; font-weight: 700; }
.week-day-head .num { display: block; font-size: 15px; font-weight: 700; }
.week-day-head.today .num { color: #6366F1; }

.week-allday { border-top: 1px solid rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 4px 0; }
.allday-label { font-size: 10px; color: #6B7C88; padding: 4px 6px; }
.allday-col { display: flex; flex-direction: column; gap: 2px; padding: 2px 4px; }
.allday-chip { font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.week-scroll { max-height: 600px; overflow-y: auto; }
.week-grid { display: grid; position: relative; }
.week-hours { position: relative; }
.hour-label { font-size: 10px; color: #6B7C88; text-align: right; padding-right: 6px; box-sizing: border-box; transform: translateY(-6px); }
.week-col { position: relative; border-left: 1px solid rgba(255,255,255,0.05); cursor: pointer; }
.hour-line { border-bottom: 1px solid rgba(255,255,255,0.04); box-sizing: border-box; }

.week-event { position: absolute; left: 2px; right: 2px; cursor: grab; user-select: none; }
.week-event.dragging { opacity: 0.6; }
.event-body {
  height: 100%; border-radius: 4px; padding: 2px 6px; overflow: hidden;
  display: flex; flex-direction: column; font-size: 11px; line-height: 1.3;
}
.event-title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.event-time { color: #9FB0BC; font-size: 10px; }
.resize-handle { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; cursor: ns-resize; }
</style>
