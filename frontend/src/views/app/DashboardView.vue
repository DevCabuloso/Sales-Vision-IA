<template>
  <div class="dashboard">

    <!-- ═══ HEADER ═══ -->
    <div class="dash-header">
      <div class="dash-title-row">
        <span class="dash-eyebrow">PAINEL SDR · Bem-vindo, {{ auth.user?.name }}!</span>
        <div class="d-flex align-center ga-3">
          <button class="report-btn" :disabled="reportLoading" @click="openReport">
            <v-progress-circular v-if="reportLoading" indeterminate size="14" width="2" />
            <v-icon v-else icon="mdi-file-chart-outline" size="16" />
            Gerar relatório do dia
          </button>
          <div class="dash-live">
            <span class="live-dot" />
            ao vivo
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ STAT CARDS ═══ -->
    <div class="stat-grid">
      <div v-for="s in cards" :key="s.label" class="stat-card">
        <div class="stat-top">
          <div class="stat-icon-chip" :style="{ background: s.color + '1A', color: s.color }">
            <v-icon :icon="s.icon" size="17" />
          </div>
        </div>
        <div class="stat-value">{{ loading ? '—' : s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
        <div v-if="!loading && s.trend" class="stat-trend" :class="s.trendUp === false ? 'trend-down' : s.trendUp === true ? 'trend-up' : 'trend-neutral'">
          <v-icon v-if="s.trendUp !== null" :icon="s.trendUp ? 'mdi-trending-up' : 'mdi-trending-down'" size="12" />
          {{ s.trend }}
        </div>
      </div>
    </div>

    <!-- ═══ LINHA PRINCIPAL ═══ -->
    <div class="main-grid">

      <!-- Gráfico de barras mensal -->
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Reuniões agendadas por mês</span>
          <span v-if="!loading" class="panel-growth" :class="{ 'growth-down': growthPct < 0, 'growth-flat': growthPct === 0 }">
            <v-icon :icon="growthPct >= 0 ? 'mdi-trending-up' : 'mdi-trending-down'" size="14" />
            {{ growthPct > 0 ? '+' : '' }}{{ growthPct }}% vs mês anterior
          </span>
        </div>

        <div v-if="loading" class="panel-loading">
          <v-progress-circular indeterminate color="primary" size="22" />
        </div>
        <div v-else class="bar-chart">
          <div v-for="(m, i) in monthBars" :key="m.label" class="bar-col">
            <span class="bar-value">{{ m.count > 0 ? m.count : '' }}</span>
            <div class="bar-wrap">
              <div
                class="bar-fill"
                :class="{ 'bar-fill-current': i === monthBars.length - 1 }"
                :style="{ height: Math.max(m.pct, m.count > 0 ? 6 : 0) + '%' }"
              />
            </div>
            <span class="bar-label" :class="{ 'bar-label-current': i === monthBars.length - 1 }">{{ m.label }}</span>
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
              <span class="activity-source">{{ l.source || 'Direto' }} · {{ relativeTime(l.createdAt) }}</span>
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
              <span class="funnel-count">{{ s.count }} <em>· {{ s.pct }}%</em></span>
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

    <!-- Dialog: relatório diário -->
    <v-dialog v-model="reportDialog" max-width="820" scrollable>
      <v-card class="glass" border>
        <v-card-title class="d-flex align-center justify-space-between pa-5 pb-3">
          <div>
            <div class="text-h6 font-weight-bold">Resumo diário</div>
            <div class="text-caption" style="color:#6B7C88; text-transform:capitalize">{{ reportDateLabel }}</div>
          </div>
          <v-btn icon variant="text" size="small" @click="reportDialog = false">
            <v-icon icon="mdi-close" size="18" />
          </v-btn>
        </v-card-title>

        <v-divider />

        <v-card-text class="pa-5">
          <div v-if="reportLoading" class="py-12 text-center">
            <v-progress-circular indeterminate color="primary" size="32" />
          </div>
          <div v-else-if="reportError" class="py-8 text-center" style="color:#F87171">{{ reportError }}</div>
          <template v-else-if="report">

            <div class="report-summary-grid mb-5">
              <div class="report-stat">
                <span class="report-stat-value">{{ report.summary.newLeads }}</span>
                <span class="report-stat-label">Novos leads</span>
              </div>
              <div class="report-stat">
                <span class="report-stat-value">{{ report.summary.qualifiedNewLeads }}</span>
                <span class="report-stat-label">Qualificados hoje</span>
              </div>
              <div class="report-stat">
                <span class="report-stat-value">{{ report.summary.conversationsOpened }}</span>
                <span class="report-stat-label">Atend. iniciados</span>
              </div>
              <div class="report-stat">
                <span class="report-stat-value">{{ report.summary.conversationsResolved }}</span>
                <span class="report-stat-label">Atend. resolvidos</span>
              </div>
              <div class="report-stat">
                <span class="report-stat-value">{{ report.summary.appointmentsScheduled }}</span>
                <span class="report-stat-label">Reuniões marcadas</span>
              </div>
              <div class="report-stat">
                <span class="report-stat-value">{{ report.summary.messages.total }}</span>
                <span class="report-stat-label">Mensagens trocadas</span>
              </div>
            </div>

            <div class="text-caption mb-5" style="color:#6B7C88">
              Mensagens: {{ report.summary.messages.fromLeads }} de leads · {{ report.summary.messages.fromAI }} da IA · {{ report.summary.messages.fromAgents }} de atendentes
            </div>

            <div class="report-section-title">Funil atual</div>
            <div class="report-funnel mb-5">
              <v-chip
                v-for="f in report.funnel" :key="f.stage"
                size="small" variant="tonal"
                :style="`background:${stageColor(f.stage)}22;color:${stageColor(f.stage)}`"
                class="mr-1 mb-1"
              >{{ f.stage }}: {{ f.count }}</v-chip>
              <span v-if="!report.funnel.length" class="text-caption" style="color:#6B7C88">Nenhum lead ainda.</span>
            </div>

            <div class="report-section-title">Atendimentos por usuário</div>
            <div v-if="!report.byUser.length" class="text-body-2 py-4 text-center" style="color:#6B7C88">
              Nenhum usuário cadastrado.
            </div>
            <div v-for="u in report.byUser" :key="u.userId" class="report-user-card mb-3">
              <div class="d-flex align-center justify-space-between mb-2 flex-wrap ga-2">
                <div class="d-flex align-center ga-2">
                  <div class="report-user-avatar">{{ (u.name || '?').charAt(0).toUpperCase() }}</div>
                  <div>
                    <div class="text-body-2 font-weight-bold">{{ u.name }}</div>
                    <div class="text-caption" style="color:#6B7C88">{{ u.email }}</div>
                  </div>
                </div>
                <div class="d-flex ga-1 flex-wrap">
                  <v-chip size="x-small" variant="tonal" color="primary">{{ u.leadsAttended.length }} atendidos</v-chip>
                  <v-chip size="x-small" variant="tonal" color="success">{{ u.conversationsResolved }} resolvidos</v-chip>
                  <v-chip size="x-small" variant="tonal" color="info">{{ u.messagesSent }} msgs</v-chip>
                  <v-chip v-if="u.appointmentsCreated" size="x-small" variant="tonal" color="warning">{{ u.appointmentsCreated }} reuniões</v-chip>
                </div>
              </div>

              <div v-if="!u.leadsAttended.length" class="text-caption pl-1" style="color:#6B7C88">
                Nenhum atendimento hoje.
              </div>
              <div v-else class="report-client-list">
                <div v-for="c in u.leadsAttended" :key="c.leadId + c.lastActionAt" class="report-client-row">
                  <span class="report-client-name">{{ c.leadName }}</span>
                  <span class="report-client-stage" :style="`color:${stageColor(c.stage)}`">{{ c.stage }}</span>
                  <span class="report-client-action">{{ actionLabel(c.lastAction) }} · {{ formatDateTime(c.lastActionAt) }}</span>
                </div>
              </div>
            </div>

          </template>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="reportDialog = false">Fechar</v-btn>
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-file-download-outline" :loading="generatingPdf" :disabled="!report" @click="downloadReportPdf">Baixar PDF</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const cards = computed(() => {
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)

  const todayCount     = leads.value.filter((l) => isSameDay(new Date(l.createdAt), today)).length
  const yesterdayCount = leads.value.filter((l) => isSameDay(new Date(l.createdAt), yesterday)).length
  const leadsDiff = todayCount - yesterdayCount

  const openCount = leads.value.filter((l) => l.conversation_status === 'open').length
  const qualCount = leads.value.filter((l) => (l.score ?? 0) >= 70).length
  const meetingsCount = appts.value.filter((a) => parseDt(a.startTime) > new Date()).length
  const meetingsThisWeek = appts.value.filter((a) => {
    const s = parseDt(a.startTime)
    const in7 = new Date(); in7.setDate(in7.getDate() + 7)
    return s > new Date() && s <= in7
  }).length

  return [
    {
      label: 'Leads hoje',
      icon: 'mdi-account-multiple-outline',
      color: '#00C2FF',
      value: todayCount,
      trend: leadsDiff === 0 ? 'igual a ontem' : `${leadsDiff > 0 ? '+' : ''}${leadsDiff} vs ontem`,
      trendUp: leadsDiff === 0 ? null : leadsDiff > 0,
    },
    {
      label: 'Conversas ativas',
      icon: 'mdi-message-outline',
      color: '#A855F7',
      value: openCount,
      trend: `${leads.value.length} leads no total`,
      trendUp: null,
    },
    {
      label: 'Qualificados',
      icon: 'mdi-check-circle-outline',
      color: '#10B981',
      value: qualCount,
      trend: `${qualRate.value}% do total de leads`,
      trendUp: null,
    },
    {
      label: 'Reuniões agendadas',
      icon: 'mdi-calendar-check-outline',
      color: '#F59E0B',
      value: meetingsCount,
      trend: `${meetingsThisWeek} nos próximos 7 dias`,
      trendUp: null,
    },
  ]
})

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
  const prev = bars[bars.length - 2].count
  const curr = bars[bars.length - 1].count
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
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

// ── relatório diário ──
const reportDialog  = ref(false)
const reportLoading = ref(false)
const reportError   = ref('')
const report        = ref(null)

async function openReport() {
  reportDialog.value = true
  reportLoading.value = true
  reportError.value = ''
  try {
    report.value = await api.dailyReport()
  } catch (e) {
    reportError.value = e.message
  } finally {
    reportLoading.value = false
  }
}

const generatingPdf = ref(false)

async function downloadReportPdf() {
  if (!report.value) return
  generatingPdf.value = true
  try {
    // dynamic import: jspdf+jspdf-autotable só carregam quando alguém realmente
    // exporta um PDF, em vez de pesar no bundle da dashboard pra todo mundo
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const s = report.value
    const marginX = 40
    const pageWidth = 595 // A4 em pt
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    let y = 50

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(20, 20, 20)
    doc.text('Resumo diário', marginX, y)

    y += 20
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(100, 100, 100)
    doc.text(reportDateLabel.value, marginX, y)
    if (auth.user?.tenantName) {
      doc.text(auth.user.tenantName, pageWidth - marginX, y, { align: 'right' })
    }

    y += 16
    doc.setDrawColor(220)
    doc.line(marginX, y, pageWidth - marginX, y)
    y += 20

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Métrica', 'Valor']],
      body: [
        ['Novos leads', s.summary.newLeads],
        ['Qualificados hoje', s.summary.qualifiedNewLeads],
        ['Atendimentos iniciados', s.summary.conversationsOpened],
        ['Atendimentos resolvidos', s.summary.conversationsResolved],
        ['Reuniões agendadas', s.summary.appointmentsScheduled],
        ['Mensagens trocadas', `${s.summary.messages.total}  (${s.summary.messages.fromLeads} de leads · ${s.summary.messages.fromAI} da IA · ${s.summary.messages.fromAgents} de atendentes)`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 10, cellPadding: 6 },
      columnStyles: { 0: { cellWidth: 160 } },
    })
    y = doc.lastAutoTable.finalY + 26

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    doc.text('Funil atual', marginX, y)

    autoTable(doc, {
      startY: y + 10,
      margin: { left: marginX, right: marginX },
      head: [['Etapa', 'Leads']],
      body: s.funnel.length ? s.funnel.map((f) => [f.stage, f.count]) : [['Nenhum lead ainda', '']],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 10, cellPadding: 6 },
    })
    y = doc.lastAutoTable.finalY + 26

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    doc.text('Atendimentos por usuário', marginX, y)
    y += 16

    for (const u of s.byUser) {
      if (y > 760) { doc.addPage(); y = 50 }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(20, 20, 20)
      doc.text(u.name, marginX, y)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      doc.text(
        `${u.leadsAttended.length} atendidos · ${u.conversationsResolved} resolvidos · ${u.messagesSent} mensagens · ${u.appointmentsCreated} reuniões`,
        marginX, y + 13
      )

      if (!u.leadsAttended.length) {
        y += 34
        continue
      }

      autoTable(doc, {
        startY: y + 22,
        margin: { left: marginX, right: marginX },
        head: [['Cliente', 'Etapa', 'Ação', 'Quando']],
        body: u.leadsAttended.map((c) => [c.leadName, c.stage, actionLabel(c.lastAction), formatDateTime(c.lastActionAt)]),
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85] },
        styles: { fontSize: 9, cellPadding: 5 },
      })
      y = doc.lastAutoTable.finalY + 22
    }

    doc.save(`resumo-diario-${s.date}.pdf`)
  } finally {
    generatingPdf.value = false
  }
}

const reportDateLabel = computed(() => {
  if (!report.value?.date) return ''
  const [y, m, d] = report.value.date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
})

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function actionLabel(action) {
  if (action?.startsWith('recebeu de')) return action
  return {
    opened: 'Assumiu o atendimento',
    transferred: 'Transferiu para outro atendente',
    reopened: 'Reabriu o atendimento',
    pending: 'Devolveu à fila',
    closed: 'Resolveu o atendimento',
  }[action] || action
}

function stageColor(s) {
  return {
    'Novo Lead': '#6366F1',
    'Em Qualificação': '#38BDF8',
    'Qualificado': '#10B981',
    'Reunião Agendada': '#F59E0B',
    'Perdido': '#EF4444',
    'Vendido': '#A855F7',
  }[s] || '#6366F1'
}
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 18px; position: relative; }

/* ─── Header ─── */
.dash-header { margin-bottom: 4px; }
.dash-title-row {
  display: flex; align-items: center; justify-content: space-between;
}
.dash-eyebrow {
  font-size: 13px; font-weight: 700; letter-spacing: 1px;
  color: var(--text-secondary); text-transform: uppercase;
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

.report-btn {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: var(--text-primary);
  background: var(--panel-bg); border: 1px solid var(--border-subtle);
  border-radius: 9px; padding: 7px 14px; cursor: pointer; transition: border-color .15s;
}
.report-btn:hover:not(:disabled) { border-color: var(--border-medium); }
.report-btn:disabled { opacity: .6; cursor: not-allowed; }

/* ─── Relatório diário ─── */
.report-summary-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
}
@media (max-width: 560px) { .report-summary-grid { grid-template-columns: repeat(2, 1fr); } }
.report-stat {
  background: var(--panel-bg); border: 1px solid var(--border-subtle); border-radius: 12px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 2px;
}
.report-stat-value { font-size: 22px; font-weight: 800; color: var(--text-primary); line-height: 1; }
.report-stat-label { font-size: 11px; color: var(--text-muted); }

.report-section-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
  color: var(--text-faint); margin-bottom: 10px;
}
.report-funnel { display: flex; flex-wrap: wrap; }

.report-user-card {
  border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px;
}
.report-user-avatar {
  width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #00C2FF22, #3B82F622);
  border: 1px solid rgba(0,194,255,0.15);
  font-size: 13px; font-weight: 700; color: #00C2FF;
}
.report-client-list {
  display: flex; flex-direction: column; gap: 4px; margin-top: 8px;
  border-top: 1px solid var(--border-subtle); padding-top: 8px;
}
.report-client-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  font-size: 12px; padding: 4px 0;
}
.report-client-name { font-weight: 600; color: var(--text-primary); }
.report-client-stage { font-weight: 600; }
.report-client-action { color: var(--text-muted); margin-left: auto; }

/* ─── Stat cards ─── */
.stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
}
@media (max-width: 900px) { .stat-grid { grid-template-columns: repeat(2,1fr); } }
@media (max-width: 480px) { .stat-grid { grid-template-columns: 1fr; } }

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

.stat-icon-chip {
  width: 32px; height: 32px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
}

.stat-value {
  font-size: 36px; font-weight: 800; line-height: 1;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.stat-label { font-size: 12px; color: var(--text-muted); font-weight: 500; }

.stat-trend {
  display: flex; align-items: center; gap: 3px;
  font-size: 11px; font-weight: 600; margin-top: 2px;
}
.trend-up      { color: #34D399; }
.trend-down    { color: #F87171; }
.trend-neutral { color: var(--text-faint); }

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
.panel-growth.growth-down { color: #F87171; }
.panel-growth.growth-flat { color: var(--text-faint); }
.panel-loading { display: flex; justify-content: center; padding: 20px 0; }
.panel-empty { font-size: 13px; color: var(--text-faint); text-align: center; padding: 20px 0; }

/* ─── Gráfico de barras ─── */
.bar-chart {
  display: flex; align-items: flex-end; gap: 6px;
  height: 140px;
}
.bar-col {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%;
}
.bar-value {
  font-size: 10px; font-weight: 700; color: var(--text-muted);
  height: 13px; line-height: 13px;
}
.bar-wrap {
  flex: 1; width: 100%; border-radius: 6px 6px 4px 4px;
  background: var(--panel-bg);
  display: flex; align-items: flex-end; overflow: hidden;
}
.bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #00C2FF55 0%, #3B82F655 100%);
  border-radius: 6px 6px 0 0;
  transition: height .6s cubic-bezier(.4,0,.2,1);
  min-height: 0;
}
.bar-fill-current {
  background: linear-gradient(180deg, #00C2FF 0%, #3B82F6 100%);
}
.bar-label { font-size: 9px; font-weight: 600; color: var(--text-faint); }
.bar-label-current { color: #00C2FF; }

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
.funnel-count em { font-style: normal; font-weight: 500; color: var(--text-faint); }
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
