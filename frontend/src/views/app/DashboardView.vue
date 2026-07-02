<template>
  <div class="dashboard">

    <!-- ═══ HEADER ═══ -->
    <div class="dash-header">
      <div class="dash-title-row">
        <span class="dash-eyebrow">PAINEL SDR · VISÃO COMERCIAL — Bem-vindo, {{ auth.user?.name }}!</span>
        <div class="dash-live">
          <span class="live-dot" />
          ao vivo
        </div>
      </div>
    </div>

    <!-- ═══ STAT CARDS ═══ -->
    <div class="stat-grid">
      <div v-for="s in cards" :key="s.label" class="stat-card">
        <div class="stat-top">
          <v-icon :icon="s.icon" size="18" class="stat-icon" />
        </div>
        <div class="stat-value">{{ loading ? '—' : s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <!-- ═══ LINHA PRINCIPAL ═══ -->
    <div class="main-grid">

      <!-- Gráfico de barras mensal -->
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Reuniões agendadas por mês</span>
        </div>

        <div v-if="loading" class="panel-loading">
          <v-progress-circular indeterminate color="primary" size="22" />
        </div>
        <div v-else class="bar-chart">
          <div v-for="m in monthBars" :key="m.label" class="bar-col">
            <div class="bar-wrap">
              <div class="bar-fill" :style="{ height: Math.max(m.pct, m.count > 0 ? 6 : 0) + '%' }" />
            </div>
            <span class="bar-label">{{ m.label }}</span>
          </div>
        </div>
      </div>

      <!-- Atividade do SDR IA -->
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Atividade do SDR IA</span>
        </div>

        <div v-if="loading" class="panel-loading">
          <v-progress-circular indeterminate color="primary" size="22" />
        </div>
        <div v-else-if="activityLeads.length === 0" class="panel-empty">
          Nenhuma atividade recente
        </div>
        <div v-else class="activity-list">
          <div v-for="l in activityLeads" :key="l.id" class="activity-row">
            <div class="activity-info">
              <span class="activity-name">{{ l.name || l.phone }}</span>
              <span class="activity-source">{{ l.source || 'Direto' }}</span>
            </div>
            <span class="activity-status" :class="statusClass(l.stage)">{{ statusLabel(l.stage) }}</span>
          </div>
        </div>

        <div class="panel-footer">
          Taxa de qualificação: <strong>{{ qualRate }}%</strong>
        </div>
      </div>

    </div>

    <!-- ═══ LINHA INFERIOR ═══ -->
    <div class="bottom-grid">

      <!-- Funil por etapa -->
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Funil por etapa</span>
          <span class="panel-sub">{{ leads.length }} leads</span>
        </div>
        <div v-if="loading" class="panel-loading">
          <v-progress-circular indeterminate color="primary" size="22" />
        </div>
        <div v-else-if="funnel.length === 0" class="panel-empty">Nenhum lead ainda</div>
        <div v-else class="funnel-list">
          <div v-for="s in funnel" :key="s.stage" class="funnel-row">
            <div class="funnel-meta">
              <span class="funnel-stage">{{ s.stage }}</span>
              <span class="funnel-count">{{ s.count }}</span>
            </div>
            <div class="funnel-track">
              <div class="funnel-bar" :style="{ width: s.pct + '%' }" />
            </div>
          </div>
        </div>
      </div>

      <!-- Próximas reuniões -->
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Próximas reuniões</span>
          <span class="panel-sub">{{ nextAppts.length }}</span>
        </div>
        <div v-if="loading" class="panel-loading">
          <v-progress-circular indeterminate color="primary" size="22" />
        </div>
        <div v-else-if="nextAppts.length === 0" class="panel-empty">
          Sem reuniões agendadas
        </div>
        <div v-else class="appt-list">
          <div v-for="a in nextAppts" :key="a.id" class="appt-row">
            <div class="appt-badge">
              <span class="appt-day">{{ apptDay(a.startTime) }}</span>
              <span class="appt-mon">{{ apptMon(a.startTime) }}</span>
            </div>
            <div class="appt-info">
              <span class="appt-title">{{ a.leadName || a.title }}</span>
              <span class="appt-time">{{ formatTime(a.startTime) }}</span>
            </div>
            <a v-if="a.meetingLink" :href="a.meetingLink" target="_blank" class="appt-join">
              <v-icon icon="mdi-video-outline" size="14" />
            </a>
          </div>
        </div>
      </div>

      <!-- Leads recentes -->
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Leads recentes</span>
          <span class="panel-sub">últimos 5</span>
        </div>
        <div v-if="loading" class="panel-loading">
          <v-progress-circular indeterminate color="primary" size="22" />
        </div>
        <div v-else-if="recentLeads.length === 0" class="panel-empty">Nenhum lead ainda</div>
        <div v-else class="lead-list">
          <div v-for="l in recentLeads" :key="l.id" class="lead-row">
            <div class="lead-avatar">{{ (l.name || '?').charAt(0).toUpperCase() }}</div>
            <div class="lead-info">
              <span class="lead-name">{{ l.name || l.phone }}</span>
              <span class="lead-meta">{{ l.stage || 'Novo Lead' }} · {{ relativeTime(l.createdAt) }}</span>
            </div>
            <div class="lead-score" :class="scoreClass(l.score)">{{ l.score ?? '—' }}</div>
          </div>
        </div>
      </div>

    </div>

    <!-- Botão refresh -->
    <button class="fab-refresh" :class="{ spinning: loading }" @click="load" title="Atualizar">
      <v-icon icon="mdi-refresh" size="18" />
    </button>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import { useRealtime } from '@/composables/useRealtime'
import { useAuthStore } from '@/stores/auth'

const auth    = useAuthStore()
const loading = ref(true)
const leads   = ref([])
const appts   = ref([])

// ── cards ──
const cards = computed(() => [
  {
    label: 'Leads hoje',
    icon: 'mdi-account-multiple-outline',
    value: leads.value.filter((l) => {
      const d = new Date(l.createdAt); const t = new Date()
      return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
    }).length,
  },
  {
    label: 'Conversas ativas',
    icon: 'mdi-message-outline',
    value: leads.value.filter((l) => l.conversation_status === 'open').length,
  },
  {
    label: 'Qualificados',
    icon: 'mdi-check-circle-outline',
    value: leads.value.filter((l) => (l.score ?? 0) >= 70).length,
  },
  {
    label: 'Reuniões agendadas',
    icon: 'mdi-calendar-check-outline',
    value: appts.value.filter((a) => parseDt(a.startTime) > new Date()).length,
  },
])

// ── gráfico mensal (12 meses) ──
const monthBars = computed(() => {
  const now = new Date()
  const bars = []
  const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const count = appts.value.filter((a) => {
      const s = parseDt(a.startTime)
      return s >= d && s < next
    }).length
    bars.push({ label: monthNames[d.getMonth()], count })
  }
  const max = Math.max(...bars.map((b) => b.count), 1)
  return bars.map((b) => ({ ...b, pct: Math.round((b.count / max) * 100) }))
})

const growthPct = computed(() => {
  const bars = monthBars.value
  if (bars.length < 2) return 0
  const first = bars[0].count || 1
  const last  = bars[bars.length - 1].count
  return Math.round(((last - first) / first) * 100)
})

// ── atividade leads ──
const activityLeads = computed(() =>
  [...leads.value]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6)
)

function statusLabel(stage) {
  if (!stage) return 'Em conversa'
  const s = stage.toLowerCase()
  if (s.includes('reunião') || s.includes('agendad')) return 'Reunião agendada'
  if (s.includes('qualificad')) return 'Qualificado'
  if (s.includes('fechad') || s.includes('venda')) return 'Fechado'
  return 'Em conversa'
}

function statusClass(stage) {
  const l = statusLabel(stage)
  if (l === 'Reunião agendada') return 'status-meeting'
  if (l === 'Qualificado')      return 'status-qualified'
  if (l === 'Fechado')          return 'status-closed'
  return 'status-talking'
}

// ── taxa de qualificação ──
const qualRate = computed(() => {
  if (!leads.value.length) return 0
  return Math.round((leads.value.filter((l) => (l.score ?? 0) >= 70).length / leads.value.length) * 100)
})

// ── funil ──
const funnel = computed(() => {
  const counts = {}
  for (const l of leads.value) { const s = l.stage || 'Novo Lead'; counts[s] = (counts[s] || 0) + 1 }
  const total = leads.value.length || 1
  return Object.entries(counts)
    .map(([stage, count]) => ({ stage, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
})

// ── reuniões / leads ──
const nextAppts = computed(() =>
  [...appts.value]
    .filter((a) => parseDt(a.startTime) > new Date())
    .sort((a, b) => parseDt(a.startTime) - parseDt(b.startTime))
    .slice(0, 5)
)
const recentLeads = computed(() =>
  [...leads.value]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
)

// ── formatação ──
// bare date strings (all-day Google Calendar) são UTC midnight → shift de 1 dia em UTC-3
function parseDt(s) {
  if (!s) return new Date()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0)
  }
  return new Date(s)
}
function formatTime(d) { return d ? parseDt(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—' }
function apptDay(d)    { return d ? parseDt(d).getDate() : '—' }
function apptMon(d)    { return d ? parseDt(d).toLocaleString('pt-BR', { month: 'short' }).replace('.', '') : '' }
function relativeTime(d) {
  if (!d) return ''
  const m = Math.floor((Date.now() - new Date(d)) / 60000)
  if (m < 1)  return 'agora'
  if (m < 60) return `${m}min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  return `${Math.floor(h / 24)}d atrás`
}
function scoreClass(s) {
  if (s == null) return 'score-none'
  if (s >= 70)   return 'score-high'
  if (s >= 40)   return 'score-mid'
  return 'score-low'
}

// ── dados ──
async function load() {
  loading.value = true
  try {
    const [l, a] = await Promise.all([api.listLeads().catch(() => []), api.listAppointments().catch(() => [])])
    leads.value = (l || []).map((x) => ({ ...x, createdAt: x.created_at }))
    appts.value = (a || []).map((x) => ({ id: x.id, leadName: x.lead_name, title: x.title, startTime: x.start_time, meetingLink: x.meeting_link }))
  } finally { loading.value = false }
}

onMounted(load)
let tl = null
const refresh = () => { clearTimeout(tl); tl = setTimeout(load, 300) }
useRealtime('leads', auth.user?.tenantId, refresh)
useRealtime('appointments', auth.user?.tenantId, refresh)
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 18px; position: relative; }

/* ─── Header ─── */
.dash-header { margin-bottom: 4px; }
.dash-title-row {
  display: flex; align-items: center; justify-content: space-between;
}
.dash-eyebrow {
  font-size: 11px; font-weight: 700; letter-spacing: 1.5px;
  color: var(--text-faint); text-transform: uppercase;
}
.dash-live {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600; color: #10B981;
}
.live-dot {
  width: 7px; height: 7px; border-radius: 50%; background: #10B981;
  box-shadow: 0 0 6px #10B981;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

/* ─── Stat cards ─── */
.stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
}
@media (max-width: 900px) { .stat-grid { grid-template-columns: repeat(2,1fr); } }

.stat-card {
  background: var(--panel-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 20px 20px 18px;
  display: flex; flex-direction: column; gap: 4px;
  transition: border-color .15s;
}
.stat-card:hover { border-color: var(--border-medium); }

.stat-top { margin-bottom: 6px; }
.stat-icon { color: var(--text-faint); }

.stat-value {
  font-size: 36px; font-weight: 800; line-height: 1;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.stat-label { font-size: 12px; color: var(--text-muted); font-weight: 500; }

/* ─── Grids ─── */
.main-grid {
  display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px;
}
.bottom-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
}
@media (max-width: 1024px) { .main-grid { grid-template-columns: 1fr; } }
@media (max-width: 900px)  { .bottom-grid { grid-template-columns: 1fr; } }

/* ─── Panel ─── */
.panel {
  background: var(--panel-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 20px;
  display: flex; flex-direction: column; gap: 14px;
}
.panel-head {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;
}
.panel-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.panel-sub {
  font-size: 11px; color: var(--text-faint);
  background: var(--panel-bg); border: 1px solid var(--border-subtle);
  padding: 2px 10px; border-radius: 20px;
}
.panel-growth {
  font-size: 12px; font-weight: 700; color: #10B981;
  display: flex; align-items: center; gap: 4px;
}
.panel-loading { display: flex; justify-content: center; padding: 20px 0; }
.panel-empty { font-size: 13px; color: var(--text-faint); text-align: center; padding: 20px 0; }

/* ─── Gráfico de barras ─── */
.bar-chart {
  display: flex; align-items: flex-end; gap: 6px;
  height: 140px;
}
.bar-col {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%;
}
.bar-wrap {
  flex: 1; width: 100%; border-radius: 6px 6px 4px 4px;
  background: var(--panel-bg);
  display: flex; align-items: flex-end; overflow: hidden;
}
.bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #00C2FF 0%, #3B82F6 100%);
  border-radius: 6px 6px 0 0;
  transition: height .6s cubic-bezier(.4,0,.2,1);
  min-height: 0;
}
.bar-label { font-size: 9px; font-weight: 600; color: var(--text-faint); }

/* ─── Atividade SDR ─── */
.activity-list { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.activity-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: transparent;
  transition: background .12s;
}
.activity-row:hover { background: var(--panel-hover); }

.activity-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.activity-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.activity-source { font-size: 11px; color: var(--text-muted); }

.activity-status { font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
.status-meeting   { color: #00C2FF; }
.status-qualified { color: #10B981; }
.status-closed    { color: #A855F7; }
.status-talking   { color: var(--text-muted); }

.panel-footer {
  font-size: 11px; color: var(--text-muted); padding-top: 6px;
  border-top: 1px solid var(--border-subtle);
}
.panel-footer strong { color: var(--text-primary); }

/* ─── Funil ─── */
.funnel-list { display: flex; flex-direction: column; gap: 12px; }
.funnel-row  { display: flex; flex-direction: column; gap: 5px; }
.funnel-meta { display: flex; justify-content: space-between; }
.funnel-stage { font-size: 12px; color: var(--text-secondary); }
.funnel-count { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.funnel-track {
  height: 5px; border-radius: 99px;
  background: var(--border-subtle); overflow: hidden;
}
.funnel-bar {
  height: 100%; border-radius: 99px; min-width: 4px;
  background: linear-gradient(90deg, #00C2FF, #3B82F6);
  transition: width .4s ease;
}

/* ─── Reuniões ─── */
.appt-list { display: flex; flex-direction: column; gap: 8px; }
.appt-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--border-subtle);
  transition: border-color .12s;
}
.appt-row:hover { border-color: var(--border-medium); }

.appt-badge {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  background: rgba(0,194,255,0.08);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.appt-day { font-size: 15px; font-weight: 800; color: #00C2FF; line-height: 1; }
.appt-mon { font-size: 9px; font-weight: 600; color: var(--text-faint); text-transform: uppercase; }

.appt-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.appt-title { font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.appt-time  { font-size: 11px; color: var(--text-muted); }

.appt-join {
  width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,194,255,0.1); color: #00C2FF;
  text-decoration: none; transition: background .15s;
}
.appt-join:hover { background: rgba(0,194,255,0.2); }

/* ─── Leads recentes ─── */
.lead-list { display: flex; flex-direction: column; gap: 6px; }
.lead-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 10px; transition: background .12s;
}
.lead-row:hover { background: var(--panel-hover); }

.lead-avatar {
  width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #00C2FF22, #3B82F622);
  border: 1px solid rgba(0,194,255,0.15);
  font-size: 13px; font-weight: 700; color: #00C2FF;
}
.lead-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.lead-name { font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lead-meta { font-size: 11px; color: var(--text-muted); }

.lead-score {
  font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; flex-shrink: 0;
}
.score-high { background: rgba(16,185,129,0.12); color: #34D399; }
.score-mid  { background: rgba(245,158,11,0.12);  color: #FBBF24; }
.score-low  { background: rgba(239,68,68,0.1);    color: #F87171; }
.score-none { background: var(--panel-bg); color: var(--text-faint); }

/* ─── FAB refresh ─── */
.fab-refresh {
  position: fixed; bottom: 28px; right: 28px;
  width: 40px; height: 40px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  background: var(--panel-bg); border: 1px solid var(--border-subtle);
  cursor: pointer; color: var(--text-muted); transition: all .15s;
  z-index: 10;
}
.fab-refresh:hover { border-color: var(--border-medium); color: var(--text-primary); }
.fab-refresh.spinning { animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
