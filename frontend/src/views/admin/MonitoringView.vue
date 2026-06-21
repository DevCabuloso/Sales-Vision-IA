<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h4 font-weight-bold mb-1">Monitoramento</h1>
        <p class="text-body-2" style="color:#9FB0BC">Visibilidade global de toda a atividade da plataforma</p>
      </div>
      <v-btn variant="tonal" color="accent" prepend-icon="mdi-refresh" :loading="loading" @click="load">
        Atualizar
      </v-btn>
    </div>

    <!-- Filtros -->
    <v-card class="glass pa-4 mb-4" border>
      <div class="d-flex align-center flex-wrap ga-3">
        <v-select
          v-model="filterTenant"
          :items="tenantOptions"
          label="Filtrar por cliente"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width:240px"
        />
        <v-text-field
          v-model="filterFrom"
          label="De"
          type="date"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width:160px"
        />
        <v-text-field
          v-model="filterTo"
          label="Até"
          type="date"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width:160px"
        />
        <v-btn color="primary" variant="tonal" @click="load">Filtrar</v-btn>
        <v-btn variant="text" @click="clearFilters">Limpar</v-btn>
      </div>
    </v-card>

    <!-- Cards de resumo -->
    <v-row class="mb-4">
      <v-col cols="6" sm="3">
        <v-card class="glass pa-4 text-center" border>
          <div class="text-h4 font-weight-black" style="color:#10B981">{{ leads.length }}</div>
          <div class="text-caption mt-1" style="color:#9FB0BC">Leads</div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card class="glass pa-4 text-center" border>
          <div class="text-h4 font-weight-black" style="color:#38BDF8">{{ messages.length }}</div>
          <div class="text-caption mt-1" style="color:#9FB0BC">Mensagens</div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card class="glass pa-4 text-center" border>
          <div class="text-h4 font-weight-black" style="color:#F59E0B">{{ appointments.length }}</div>
          <div class="text-caption mt-1" style="color:#9FB0BC">Reuniões</div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card class="glass pa-4 text-center" border>
          <div class="text-h4 font-weight-black" style="color:#A78BFA">{{ tenants.length }}</div>
          <div class="text-caption mt-1" style="color:#9FB0BC">Clientes</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Tabs de conteúdo -->
    <v-card class="glass" border>
      <v-tabs v-model="tab" color="accent" bg-color="transparent" density="comfortable">
        <v-tab value="leads">
          <v-icon icon="mdi-account-star-outline" class="mr-2" />
          Leads ({{ leads.length }})
        </v-tab>
        <v-tab value="messages">
          <v-icon icon="mdi-message-text-outline" class="mr-2" />
          Mensagens ({{ messages.length }})
        </v-tab>
        <v-tab value="appointments">
          <v-icon icon="mdi-calendar-check-outline" class="mr-2" />
          Reuniões ({{ appointments.length }})
        </v-tab>
      </v-tabs>

      <v-divider />

      <div v-if="loading" class="py-12 text-center">
        <v-progress-circular indeterminate color="accent" />
      </div>

      <v-tabs-window v-else v-model="tab">
        <!-- Leads -->
        <v-tabs-window-item value="leads">
          <v-data-table
            :headers="leadsHeaders"
            :items="leads"
            item-value="id"
            class="bg-transparent"
            :items-per-page="25"
          >
            <template #item.name="{ item }">
              <div class="font-weight-medium">{{ item.name || item.phone }}</div>
              <div class="text-caption" style="color:#6B7C88">{{ item.phone }}</div>
            </template>
            <template #item.tenant="{ item }">
              <span class="text-body-2">{{ item.tenant?.name || '—' }}</span>
            </template>
            <template #item.stage="{ item }">
              <v-chip :color="stageColor(item.stage)" variant="tonal" size="small">
                {{ item.stage || 'Novo Lead' }}
              </v-chip>
            </template>
            <template #item.score="{ item }">
              <div class="d-flex align-center ga-2">
                <v-progress-linear
                  :model-value="item.score ?? 0"
                  :color="scoreColor(item.score)"
                  rounded
                  height="4"
                  style="width:60px"
                  bg-color="rgba(255,255,255,0.06)"
                />
                <span class="text-caption">{{ item.score ?? 0 }}</span>
              </div>
            </template>
            <template #item.created_at="{ item }">
              <span class="text-caption">{{ formatDate(item.created_at) }}</span>
            </template>
            <template #no-data>
              <div class="py-8 text-center" style="color:#6B7C88">Nenhum lead no período.</div>
            </template>
          </v-data-table>
        </v-tabs-window-item>

        <!-- Mensagens -->
        <v-tabs-window-item value="messages">
          <v-data-table
            :headers="messagesHeaders"
            :items="messages"
            item-value="id"
            class="bg-transparent"
            :items-per-page="25"
          >
            <template #item.role="{ item }">
              <v-chip :color="item.role === 'ai' ? 'secondary' : item.role === 'lead' ? 'primary' : 'info'" variant="tonal" size="small">
                {{ roleLabel(item.role) }}
              </v-chip>
            </template>
            <template #item.provider="{ item }">
              <div class="d-flex align-center ga-1">
                <v-icon :icon="providerIcon(item.provider)" size="16" />
                <span class="text-caption">{{ item.provider || '—' }}</span>
              </div>
            </template>
            <template #item.tenant="{ item }">
              <span class="text-body-2">{{ item.tenant?.name || '—' }}</span>
            </template>
            <template #item.created_at="{ item }">
              <span class="text-caption">{{ formatDate(item.created_at) }}</span>
            </template>
            <template #no-data>
              <div class="py-8 text-center" style="color:#6B7C88">Nenhuma mensagem no período.</div>
            </template>
          </v-data-table>
        </v-tabs-window-item>

        <!-- Reuniões -->
        <v-tabs-window-item value="appointments">
          <v-data-table
            :headers="appointmentsHeaders"
            :items="appointments"
            item-value="id"
            class="bg-transparent"
            :items-per-page="25"
          >
            <template #item.title="{ item }">
              <div class="font-weight-medium">{{ item.title }}</div>
              <div class="text-caption" style="color:#6B7C88">{{ item.lead_name || '—' }}</div>
            </template>
            <template #item.tenant="{ item }">
              <span class="text-body-2">{{ item.tenant?.name || '—' }}</span>
            </template>
            <template #item.status="{ item }">
              <v-chip :color="apptStatusColor(item.status)" variant="tonal" size="small">
                {{ item.status }}
              </v-chip>
            </template>
            <template #item.start_time="{ item }">
              <span class="text-caption">{{ formatDate(item.start_time) }}</span>
            </template>
            <template #item.provider="{ item }">
              <div class="d-flex align-center ga-1">
                <v-icon :icon="providerIcon(item.provider)" size="16" />
                <span class="text-caption">{{ item.provider || '—' }}</span>
              </div>
            </template>
            <template #no-data>
              <div class="py-8 text-center" style="color:#6B7C88">Nenhuma reunião no período.</div>
            </template>
          </v-data-table>
        </v-tabs-window-item>
      </v-tabs-window>
    </v-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '@/services/api'

const loading = ref(true)
const tab = ref('leads')

const leads = ref([])
const messages = ref([])
const appointments = ref([])
const tenants = ref([])

const filterTenant = ref(null)
const filterFrom = ref('')
const filterTo = ref('')

const leadsHeaders = [
  { title: 'Lead', key: 'name' },
  { title: 'Cliente', key: 'tenant' },
  { title: 'Estágio', key: 'stage' },
  { title: 'Score', key: 'score' },
  { title: 'Criado em', key: 'created_at' },
]

const messagesHeaders = [
  { title: 'Remetente', key: 'role' },
  { title: 'Canal', key: 'provider' },
  { title: 'Cliente', key: 'tenant' },
  { title: 'Enviado em', key: 'created_at' },
]

const appointmentsHeaders = [
  { title: 'Reunião', key: 'title' },
  { title: 'Cliente', key: 'tenant' },
  { title: 'Status', key: 'status' },
  { title: 'Início', key: 'start_time' },
  { title: 'Canal', key: 'provider' },
]

const tenantOptions = computed(() => {
  const opts = [{ title: 'Todos os clientes', value: null }]
  for (const t of tenants.value) opts.push({ title: t.name, value: t.id })
  return opts
})

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function stageColor(s) {
  const m = {
    'Novo Lead': 'secondary', 'Em Qualificação': 'info', 'Qualificado': 'success',
    'Reunião Agendada': 'accent', 'Perdido': 'error',
  }
  return m[s] || 'primary'
}

function scoreColor(s) {
  if (!s) return 'grey'
  if (s >= 70) return 'success'
  if (s >= 40) return 'warning'
  return 'error'
}

function roleLabel(r) {
  return { ai: 'IA', lead: 'Lead', user: 'Usuário' }[r] || r
}

function providerIcon(p) {
  return { meta_whatsapp: 'mdi-whatsapp', evolution: 'mdi-api', google: 'mdi-calendar' }[p] || 'mdi-connection'
}

function apptStatusColor(s) {
  return { scheduled: 'success', cancelled: 'error', completed: 'info' }[s] || 'secondary'
}

function clearFilters() {
  filterTenant.value = null
  filterFrom.value = ''
  filterTo.value = ''
  load()
}

async function load() {
  loading.value = true
  try {
    const params = {}
    if (filterTenant.value) params.tenant = filterTenant.value
    if (filterFrom.value) params.from = filterFrom.value
    if (filterTo.value) params.to = filterTo.value + 'T23:59:59'

    const data = await api.adminMonitoring(params)
    leads.value = data.leads || []
    messages.value = data.messages || []
    appointments.value = data.appointments || []
    tenants.value = data.tenants || []
  } catch (e) {
    console.error('[monitoring]', e.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
