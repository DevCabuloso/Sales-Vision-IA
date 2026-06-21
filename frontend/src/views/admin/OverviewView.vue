<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h4 font-weight-bold mb-1">Visão Geral</h1>
        <p class="text-body-2" style="color:#9FB0BC">Métricas agregadas de toda a plataforma · atualização em tempo real</p>
      </div>
      <v-btn variant="tonal" color="accent" prepend-icon="mdi-refresh" :loading="loading" @click="load">
        Atualizar
      </v-btn>
    </div>

    <div v-if="loading && !o.total_clients" class="py-12 text-center">
      <v-progress-circular indeterminate color="accent" />
    </div>

    <template v-else>
      <!-- Métricas principais -->
      <v-row>
        <v-col cols="6" sm="3">
          <StatCard label="Clientes" :value="o.total_clients ?? 0" icon="mdi-domain" color="accent" />
        </v-col>
        <v-col cols="6" sm="3">
          <StatCard label="Ativos" :value="o.active_clients ?? 0" icon="mdi-check-decagram" color="success" />
        </v-col>
        <v-col cols="6" sm="3">
          <StatCard label="Suspensos" :value="o.suspended_clients ?? 0" icon="mdi-pause-octagon" color="error" />
        </v-col>
        <v-col cols="6" sm="3">
          <StatCard label="Usuários" :value="o.total_users ?? 0" icon="mdi-account-group" color="primary" hint="exceto proprietário" />
        </v-col>
      </v-row>

      <v-row class="mt-2">
        <v-col cols="6" sm="3">
          <StatCard label="Total de Leads" :value="o.total_leads ?? 0" icon="mdi-account-star-outline" color="secondary" />
        </v-col>
        <v-col cols="6" sm="3">
          <StatCard label="Atendimentos" :value="o.total_appointments ?? 0" icon="mdi-calendar-check-outline" color="info" />
        </v-col>
        <v-col cols="6" sm="3">
          <StatCard label="Eventos 24h" :value="o.events_24h ?? 0" icon="mdi-pulse" color="warning" hint="atividade recente" />
        </v-col>
        <v-col cols="6" sm="3">
          <StatCard label="Mensagens 24h" :value="o.messages_24h ?? 0" icon="mdi-message-text-outline" color="primary" />
        </v-col>
      </v-row>

      <!-- Integrações ativas -->
      <v-row class="mt-2">
        <v-col cols="12" sm="4">
          <StatCard label="Meta API" :value="o.using_meta ?? 0" icon="mdi-whatsapp" color="success" hint="WhatsApp Oficial" />
        </v-col>
        <v-col cols="12" sm="4">
          <StatCard label="Evolution" :value="o.using_evolution ?? 0" icon="mdi-api" color="info" hint="API não-oficial" />
        </v-col>
        <v-col cols="12" sm="4">
          <StatCard label="Google Calendar" :value="o.using_google_cal ?? 0" icon="mdi-calendar" color="accent" hint="agendamentos IA" />
        </v-col>
      </v-row>

      <!-- Ações rápidas -->
      <v-row class="mt-4">
        <v-col cols="12">
          <v-card class="glass pa-5" border>
            <div class="text-subtitle-1 font-weight-bold mb-4">
              <v-icon icon="mdi-lightning-bolt" color="accent" size="20" class="mr-1" />
              Gestão rápida
            </div>
            <div class="d-flex flex-wrap ga-3">
              <v-btn color="accent" variant="tonal" prepend-icon="mdi-domain-plus" to="/admin/clientes" @click.stop="openCreateClient">
                Novo cliente
              </v-btn>
              <v-btn color="primary" variant="tonal" prepend-icon="mdi-account-plus-outline" to="/admin/usuarios">
                Gerenciar usuários
              </v-btn>
              <v-btn color="secondary" variant="tonal" prepend-icon="mdi-monitor-eye" to="/admin/monitoramento">
                Ver monitoramento
              </v-btn>
              <v-btn color="info" variant="tonal" prepend-icon="mdi-domain" to="/admin/clientes">
                Ver todos os clientes
              </v-btn>
              <v-btn color="warning" variant="tonal" prepend-icon="mdi-cog-outline" to="/admin/configuracoes">
                Configurações
              </v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Clientes recentes -->
      <v-row class="mt-2">
        <v-col cols="12" md="6">
          <v-card class="glass pa-5" border style="height:100%">
            <div class="d-flex align-center justify-space-between mb-4">
              <span class="text-subtitle-1 font-weight-bold">Clientes recentes</span>
              <v-btn variant="text" size="small" to="/admin/clientes" color="accent">Ver todos</v-btn>
            </div>
            <div v-if="!recentClients.length" class="text-body-2 py-4 text-center" style="color:#6B7C88">
              Nenhum cliente cadastrado.
            </div>
            <div v-for="c in recentClients" :key="c.id" class="client-row d-flex align-center justify-space-between py-2">
              <div class="d-flex align-center ga-3">
                <div class="client-avatar d-flex align-center justify-center">
                  <v-icon icon="mdi-domain" size="16" color="accent" />
                </div>
                <div>
                  <div class="text-body-2 font-weight-medium">{{ c.name }}</div>
                  <div class="text-caption" style="color:#6B7C88">{{ c.plan }} · {{ c.leads_count ?? 0 }} leads</div>
                </div>
              </div>
              <v-chip :color="statusColor(c.status)" variant="tonal" size="x-small">
                {{ c.status }}
              </v-chip>
            </div>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <v-card class="glass pa-5" border style="height:100%">
            <div class="d-flex align-center justify-space-between mb-4">
              <span class="text-subtitle-1 font-weight-bold">Uso por plano</span>
            </div>
            <div v-for="plan in planStats" :key="plan.name" class="mb-4">
              <div class="d-flex justify-space-between mb-1">
                <span class="text-body-2 font-weight-medium text-capitalize">{{ plan.name }}</span>
                <span class="text-body-2" style="color:#9FB0BC">{{ plan.count }} cliente{{ plan.count !== 1 ? 's' : '' }}</span>
              </div>
              <v-progress-linear
                :model-value="planPct(plan.count)"
                :color="plan.color"
                rounded
                height="6"
                bg-color="rgba(255,255,255,0.06)"
              />
            </div>
            <div v-if="!planStats.length" class="text-body-2 py-4 text-center" style="color:#6B7C88">
              Sem dados de plano.
            </div>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import StatCard from '@/components/StatCard.vue'
import { useRealtime } from '@/composables/useRealtime'

const loading = ref(true)
const o = ref({})
const recentClients = ref([])

const planColors = { trial: 'warning', starter: 'info', pro: 'primary', enterprise: 'accent' }

const planStats = computed(() => {
  if (!recentClients.value.length) return []
  const counts = {}
  for (const c of recentClients.value) counts[c.plan] = (counts[c.plan] || 0) + 1
  return Object.entries(counts).map(([name, count]) => ({
    name,
    count,
    color: planColors[name] || 'secondary',
  }))
})

const totalClients = computed(() => recentClients.value.length || o.value.total_clients || 0)

function planPct(count) {
  const total = totalClients.value
  return total ? Math.round((count / total) * 100) : 0
}

function statusColor(s) {
  return { active: 'success', suspended: 'error', trial: 'warning' }[s] || 'info'
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
.client-row {
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.client-row:last-child { border-bottom: none; }

.client-avatar {
  width: 32px; height: 32px; border-radius: 8px;
  background: rgba(245,158,11,0.1);
  border: 1px solid rgba(245,158,11,0.15);
  flex-shrink: 0;
}
</style>
