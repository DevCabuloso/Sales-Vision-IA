<template>
  <div class="admin-page">
    <!-- Header -->
    <div class="page-header mb-6">
      <div>
        <h1 class="page-title">Visão Geral</h1>
        <p class="page-sub">Métricas agregadas · atualização em tempo real</p>
      </div>
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" :loading="loading" @click="load">
        Atualizar
      </v-btn>
    </div>

    <div v-if="loading && !o.total_clients" class="py-12 text-center">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else>
      <!-- Stat cards row 1 -->
      <div class="stats-row mb-4">
        <div class="stat-card">
          <div class="stat-icon-wrap" style="background:rgba(99,102,241,0.12); border-color:rgba(99,102,241,0.25)">
            <v-icon icon="mdi-domain" color="#A5B4FC" size="22" />
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ o.total_clients ?? 0 }}</div>
            <div class="stat-label">Total Clientes</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-wrap" style="background:rgba(16,185,129,0.12); border-color:rgba(16,185,129,0.25)">
            <v-icon icon="mdi-check-decagram" color="#34D399" size="22" />
          </div>
          <div class="stat-body">
            <div class="stat-value" style="color:#34D399">{{ o.active_clients ?? 0 }}</div>
            <div class="stat-label">Ativos</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-wrap" style="background:rgba(239,68,68,0.12); border-color:rgba(239,68,68,0.25)">
            <v-icon icon="mdi-pause-octagon" color="#F87171" size="22" />
          </div>
          <div class="stat-body">
            <div class="stat-value" style="color:#F87171">{{ o.suspended_clients ?? 0 }}</div>
            <div class="stat-label">Suspensos</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-wrap" style="background:rgba(139,92,246,0.12); border-color:rgba(139,92,246,0.25)">
            <v-icon icon="mdi-account-group" color="#C4B5FD" size="22" />
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ o.total_users ?? 0 }}</div>
            <div class="stat-label">Usuários</div>
          </div>
        </div>
      </div>

      <!-- Stat cards row 2 -->
      <div class="stats-row mb-6">
        <div class="stat-card">
          <div class="stat-icon-wrap" style="background:rgba(6,182,212,0.12); border-color:rgba(6,182,212,0.25)">
            <v-icon icon="mdi-account-star-outline" color="#67E8F9" size="22" />
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ o.total_leads ?? 0 }}</div>
            <div class="stat-label">Total Leads</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-wrap" style="background:rgba(20,184,166,0.12); border-color:rgba(20,184,166,0.25)">
            <v-icon icon="mdi-calendar-check-outline" color="#2DD4BF" size="22" />
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ o.total_appointments ?? 0 }}</div>
            <div class="stat-label">Atendimentos</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-wrap" style="background:rgba(245,158,11,0.12); border-color:rgba(245,158,11,0.25)">
            <v-icon icon="mdi-pulse" color="#FBB040" size="22" />
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ o.events_24h ?? 0 }}</div>
            <div class="stat-label">Eventos 24h</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-wrap" style="background:rgba(99,102,241,0.12); border-color:rgba(99,102,241,0.25)">
            <v-icon icon="mdi-message-text-outline" color="#A5B4FC" size="22" />
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ o.messages_24h ?? 0 }}</div>
            <div class="stat-label">Msgs 24h</div>
          </div>
        </div>
      </div>

      <!-- Bottom section -->
      <v-row>
        <!-- Clientes recentes -->
        <v-col cols="12" md="7">
          <div class="ztable-wrap">
            <div class="ztable-section-header">
              <span class="section-label">Clientes recentes</span>
              <v-btn variant="text" size="small" to="/admin/clientes" color="primary">Ver todos</v-btn>
            </div>
            <table class="ztable">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th>Plano</th>
                  <th>Leads</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in recentClients" :key="c.id" class="ztable-row" @click="$router.push(`/admin/clientes/${c.id}`)">
                  <td>
                    <div class="d-flex align-center ga-2">
                      <div class="z-avatar-sm" :style="{ background: avatarBg(c.name), borderColor: avatarColor(c.name) }">
                        <span :style="{ color: avatarColor(c.name) }">{{ initials(c.name) }}</span>
                      </div>
                      <div>
                        <div class="ztable-name">{{ c.name }}</div>
                        <div class="ztable-sub">{{ c.slug }}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="z-badge" :class="`z-badge--${c.status}`">
                      {{ { active: 'Ativo', suspended: 'Suspenso', trial: 'Trial' }[c.status] || c.status }}
                    </span>
                  </td>
                  <td class="ztable-sub">{{ c.plan }}</td>
                  <td class="ztable-sub">{{ c.leads_count ?? 0 }}</td>
                </tr>
                <tr v-if="!recentClients.length">
                  <td colspan="4" class="ztable-empty" style="padding:24px">Nenhum cliente cadastrado.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-col>

        <!-- Ações rápidas + Integrações -->
        <v-col cols="12" md="5">
          <v-card class="glass pa-5 mb-4" border>
            <div class="section-label mb-4">
              <v-icon icon="mdi-lightning-bolt" color="primary" size="18" class="mr-1" />
              Gestão rápida
            </div>
            <div class="d-flex flex-column ga-2">
              <v-btn color="primary" variant="tonal" prepend-icon="mdi-domain-plus" to="/admin/clientes" block>
                Novo cliente
              </v-btn>
              <v-btn color="secondary" variant="tonal" prepend-icon="mdi-account-plus-outline" to="/admin/usuarios" block>
                Gerenciar usuários
              </v-btn>
              <v-btn color="info" variant="tonal" prepend-icon="mdi-monitor-eye" to="/admin/monitoramento" block>
                Ver monitoramento
              </v-btn>
              <v-btn color="warning" variant="tonal" prepend-icon="mdi-cog-outline" to="/admin/configuracoes" block>
                Configurações
              </v-btn>
            </div>
          </v-card>

          <v-card class="glass pa-5" border>
            <div class="section-label mb-4">Integrações ativas</div>
            <div class="integ-row">
              <div class="integ-icon" style="background:rgba(37,211,102,0.12); border-color:rgba(37,211,102,0.2)">
                <v-icon icon="mdi-whatsapp" color="#25D366" size="18" />
              </div>
              <div>
                <div class="ztable-name" style="font-size:0.8rem">Meta API</div>
                <div class="ztable-sub">WhatsApp Oficial</div>
              </div>
              <span class="z-badge z-badge--active ml-auto">{{ o.using_meta ?? 0 }} ativo{{ (o.using_meta ?? 0) !== 1 ? 's' : '' }}</span>
            </div>
            <div class="integ-row">
              <div class="integ-icon" style="background:rgba(6,182,212,0.12); border-color:rgba(6,182,212,0.2)">
                <v-icon icon="mdi-api" color="#06B6D4" size="18" />
              </div>
              <div>
                <div class="ztable-name" style="font-size:0.8rem">Evolution API</div>
                <div class="ztable-sub">API não-oficial</div>
              </div>
              <span class="z-badge z-badge--info ml-auto">{{ o.using_evolution ?? 0 }} ativo{{ (o.using_evolution ?? 0) !== 1 ? 's' : '' }}</span>
            </div>
            <div class="integ-row" style="border-bottom:none">
              <div class="integ-icon" style="background:rgba(99,102,241,0.12); border-color:rgba(99,102,241,0.2)">
                <v-icon icon="mdi-calendar" color="#A5B4FC" size="18" />
              </div>
              <div>
                <div class="ztable-name" style="font-size:0.8rem">Google Calendar</div>
                <div class="ztable-sub">Agendamentos IA</div>
              </div>
              <span class="z-badge z-badge--plan ml-auto">{{ o.using_google_cal ?? 0 }} ativo{{ (o.using_google_cal ?? 0) !== 1 ? 's' : '' }}</span>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/services/api'
import { useRealtime } from '@/composables/useRealtime'

const router = useRouter()
const loading = ref(true)
const o = ref({})
const recentClients = ref([])

const AVATAR_COLORS = ['#6366F1','#8B5CF6','#EC4899','#06B6D4','#10B981','#F59E0B','#EF4444','#14B8A6']
function _colorIdx(name = '') {
  return [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length
}
function avatarColor(name = '') { return AVATAR_COLORS[_colorIdx(name)] }
function avatarBg(name = '') { return AVATAR_COLORS[_colorIdx(name)] + '1A' }
function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'
}

async function load() {
  loading.value = true
  try {
    const [overview, clients] = await Promise.all([
      api.adminOverview().catch(() => ({})),
      api.adminClients().catch(() => []),
    ])
    o.value = overview || {}
    recentClients.value = (clients || []).slice(0, 8)
  } finally {
    loading.value = false
  }
}

onMounted(load)

let t = null
const refresh = () => { clearTimeout(t); t = setTimeout(load, 500) }
useRealtime('usage_events', null, refresh)
useRealtime('leads', null, refresh)
</script>

<style scoped>
.admin-page { padding: 0; }

.page-header {
  display: flex; align-items: center;
  justify-content: space-between; flex-wrap: wrap; gap: 12px;
}
.page-title {
  font-size: 1.5rem; font-weight: 700; letter-spacing: -0.3px;
  color: var(--text-primary, #E2E8F0);
}
.page-sub { font-size: 0.8rem; color: #6B7C88; margin-top: 2px; }

/* Stat cards */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
@media (max-width: 900px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .stats-row { grid-template-columns: 1fr 1fr; } }

.stat-card {
  background: var(--glass-bg, #1C2333);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.stat-icon-wrap {
  width: 44px; height: 44px; border-radius: 10px;
  border: 1px solid;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.stat-value {
  font-size: 1.6rem; font-weight: 700; line-height: 1.1;
  letter-spacing: -0.5px;
  color: var(--text-primary, #E2E8F0);
}
.stat-label {
  font-size: 0.72rem; color: #6B7C88; margin-top: 2px;
  font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;
}
.stat-body { flex: 1; min-width: 0; }

/* Table shared styles */
.ztable-wrap {
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch;
  background: var(--glass-bg, #1C2333);
}
.ztable-section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
}
.section-label {
  font-size: 0.85rem; font-weight: 600;
  color: var(--text-primary, #E2E8F0);
}
.ztable { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.ztable thead th {
  padding: 10px 16px;
  font-size: 0.7rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.6px; color: #6B7C88;
  background: rgba(255,255,255,0.015);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.ztable tbody td {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  vertical-align: middle; color: var(--text-primary, #E2E8F0);
}
.ztable-row { cursor: pointer; transition: background 0.15s; }
.ztable-row:last-child td { border-bottom: none; }
.ztable-row:hover td { background: rgba(255,255,255,0.03); }
.ztable-name { font-weight: 600; font-size: 0.875rem; }
.ztable-sub { font-size: 0.75rem; color: #6B7C88; }
td.ztable-sub { color: #6B7C88; }
.ztable-empty { text-align: center; color: #6B7C88; font-size: 0.85rem; }

.z-avatar-sm {
  width: 30px; height: 30px; border-radius: 50%;
  border: 1.5px solid;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.65rem; font-weight: 700; flex-shrink: 0;
}

.z-badge {
  display: inline-flex; align-items: center;
  padding: 2px 10px; border-radius: 20px;
  font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.3px; white-space: nowrap;
}
.z-badge--active { background: rgba(16,185,129,0.15); color: #34D399; border: 1px solid rgba(16,185,129,0.25); }
.z-badge--suspended { background: rgba(239,68,68,0.15); color: #F87171; border: 1px solid rgba(239,68,68,0.25); }
.z-badge--trial { background: rgba(245,158,11,0.15); color: #FBB040; border: 1px solid rgba(245,158,11,0.25); }
.z-badge--plan { background: rgba(255,255,255,0.06); color: #9FB0BC; border: 1px solid rgba(255,255,255,0.1); }
.z-badge--info { background: rgba(6,182,212,0.12); color: #67E8F9; border: 1px solid rgba(6,182,212,0.25); }

/* Integrations */
.integ-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.integ-icon {
  width: 36px; height: 36px; border-radius: 8px;
  border: 1px solid;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
</style>
