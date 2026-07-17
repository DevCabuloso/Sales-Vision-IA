<template>
  <div>
    <h1 class="text-h5 font-weight-bold mb-1">{{ t('settings.title') }}</h1>
    <p class="text-body-2 mb-6" style="color:#9FB0BC">{{ t('settings.subtitle') }}</p>

    <!-- ── 1. Conta & Segurança ── -->
    <div class="section-label">Conta &amp; Segurança</div>
    <v-row class="mb-6">
      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border style="height:100%">
          <div class="d-flex align-center ga-3 mb-5">
            <div class="cfg-icon" style="background:linear-gradient(135deg,#6366F1,#8B5CF6)">
              <v-icon icon="mdi-domain" color="white" size="20" />
            </div>
            <span class="text-subtitle-1 font-weight-bold">{{ t('settings.company') }}</span>
          </div>
          <v-list density="compact" class="bg-transparent">
            <v-list-item class="px-0">
              <template #prepend><v-icon icon="mdi-office-building-outline" size="16" class="mr-2" /></template>
              <v-list-item-title class="text-body-2">{{ t('settings.name') }}</v-list-item-title>
              <template #append><span class="text-body-2 font-weight-medium ellipsis-value">{{ auth.user?.tenantName || '—' }}</span></template>
            </v-list-item>
            <v-list-item class="px-0">
              <template #prepend><v-icon icon="mdi-identifier" size="16" class="mr-2" /></template>
              <v-list-item-title class="text-body-2">{{ t('settings.slug') }}</v-list-item-title>
              <template #append><code class="text-caption ellipsis-value" style="color:#9FB0BC">{{ auth.user?.tenantSlug || '—' }}</code></template>
            </v-list-item>
            <v-list-item class="px-0">
              <template #prepend><v-icon icon="mdi-account-outline" size="16" class="mr-2" /></template>
              <v-list-item-title class="text-body-2">{{ t('settings.myEmail') }}</v-list-item-title>
              <template #append><span class="text-body-2 ellipsis-value">{{ auth.user?.email }}</span></template>
            </v-list-item>
            <v-list-item class="px-0">
              <template #prepend><v-icon icon="mdi-shield-account-outline" size="16" class="mr-2" /></template>
              <v-list-item-title class="text-body-2">{{ t('settings.permission') }}</v-list-item-title>
              <template #append>
                <v-chip :color="auth.user?.role === 'admin' ? 'warning' : 'primary'" variant="tonal" size="small">
                  {{ auth.user?.role }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border style="height:100%">
          <div class="d-flex align-center ga-3 mb-5">
            <div class="cfg-icon" style="background:linear-gradient(135deg,#10B981,#2DD4BF)">
              <v-icon icon="mdi-lock-outline" color="white" size="20" />
            </div>
            <span class="text-subtitle-1 font-weight-bold">{{ t('settings.changePass') }}</span>
          </div>
          <v-text-field v-model="pwForm.current" :label="t('settings.currentPass')" type="password" density="compact" class="mb-3" />
          <v-text-field v-model="pwForm.newPw"   :label="t('settings.newPass')"     type="password" density="compact" class="mb-3" />
          <v-text-field v-model="pwForm.confirm" :label="t('settings.confirmPass')" type="password" density="compact" class="mb-4" />
          <v-alert v-if="pwError"   type="error"   variant="tonal" density="compact" :text="pwError"                    class="mb-3" />
          <v-alert v-if="pwSuccess" type="success" variant="tonal" density="compact" text="Senha alterada com sucesso!" class="mb-3" />
          <v-btn color="primary" block :loading="savingPw" @click="changePassword">{{ t('settings.changeBtn') }}</v-btn>
        </v-card>
      </v-col>
    </v-row>

    <!-- ── 2. Preferências ── -->
    <div class="section-label">Preferências</div>
    <v-row class="mb-6">
      <!-- Idioma -->
      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border style="height:100%">
          <div class="d-flex align-center ga-3 mb-5">
            <div class="cfg-icon" style="background:linear-gradient(135deg,#F59E0B,#FBBF24)">
              <v-icon icon="mdi-translate" color="white" size="20" />
            </div>
            <div>
              <div class="text-subtitle-1 font-weight-bold">{{ t('settings.language') }}</div>
              <div class="text-caption" style="color:#9FB0BC">{{ t('settings.languageDesc') }}</div>
            </div>
          </div>
          <div class="lang-options">
            <button
              v-for="lang in languages"
              :key="lang.code"
              class="lang-btn"
              :class="{ active: locale.locale === lang.code }"
              @click="selectLang(lang.code)"
            >
              <span class="lang-flag">{{ lang.flag }}</span>
              <span class="lang-name">{{ lang.name }}</span>
              <v-icon v-if="locale.locale === lang.code" icon="mdi-check-circle" size="16" color="primary" class="ml-auto" />
            </button>
          </div>
          <v-alert v-if="langSaved" type="success" variant="tonal" density="compact" :text="t('settings.langSaved')" class="mt-3" />
        </v-card>
      </v-col>

      <!-- Regional -->
      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border style="height:100%">
          <div class="d-flex align-center ga-3 mb-5">
            <div class="cfg-icon" style="background:linear-gradient(135deg,#38BDF8,#0EA5E9)">
              <v-icon icon="mdi-earth" color="white" size="20" />
            </div>
            <div>
              <div class="text-subtitle-1 font-weight-bold">Regional</div>
              <div class="text-caption" style="color:#9FB0BC">Fuso horário e formato de data</div>
            </div>
          </div>
          <v-select
            v-model="regional.timezone"
            :items="timezones"
            item-title="label"
            item-value="value"
            label="Fuso Horário"
            prepend-inner-icon="mdi-clock-outline"
            density="compact"
            class="mb-3"
          />
          <v-select
            v-model="regional.dateFormat"
            :items="dateFormats"
            item-title="label"
            item-value="value"
            label="Formato de Data"
            prepend-inner-icon="mdi-calendar-outline"
            density="compact"
            class="mb-5"
          />
          <v-btn color="primary" variant="tonal" block :loading="savingRegional" @click="saveRegional">
            <v-icon icon="mdi-content-save-outline" start size="16" /> Salvar Regional
          </v-btn>
          <v-alert v-if="regionalSaved" type="success" variant="tonal" density="compact" text="Configurações regionais salvas!" class="mt-3" />
        </v-card>
      </v-col>
    </v-row>

    <!-- ── 3. Notificações ── -->
    <div class="section-label">Notificações</div>
    <v-card class="glass pa-6 mb-6" border>
      <div class="d-flex align-center ga-3 mb-5">
        <div class="cfg-icon" style="background:linear-gradient(135deg,#EF4444,#F87171)">
          <v-icon icon="mdi-bell-outline" color="white" size="20" />
        </div>
        <div>
          <div class="text-subtitle-1 font-weight-bold">Notificações</div>
          <div class="text-caption" style="color:#9FB0BC">Escolha quando e como ser notificado</div>
        </div>
      </div>

      <v-row>
        <v-col cols="12" md="6">
          <div class="notif-group-title mb-2">
            <v-icon icon="mdi-bell-ring-outline" size="14" class="mr-1" /> Notificações no Navegador
          </div>
          <div v-for="n in browserNotifs" :key="n.key" class="notif-row">
            <div>
              <div class="text-body-2 font-weight-medium">{{ n.label }}</div>
              <div class="text-caption" style="color:#6B7C88">{{ n.desc }}</div>
            </div>
            <v-switch v-model="notifications[n.key]" color="primary" hide-details density="compact" />
          </div>

          <!-- Mensagem sem resposta — controla a janela usada pelo sino de alertas (não é e-mail) -->
          <div class="notif-row notif-row--unanswered">
            <div>
              <div class="text-body-2 font-weight-medium">Mensagem sem resposta</div>
              <div class="text-caption" style="color:#6B7C88">O sino de alertas avisa quando um lead aguarda resposta há mais de:</div>
            </div>
            <div class="d-flex align-center ga-2 flex-shrink-0">
              <v-text-field
                v-model.number="unansweredTimeout"
                type="number"
                :min="1"
                :max="1440"
                density="compact"
                hide-details
                variant="outlined"
                suffix="min"
                style="width:90px"
              />
            </div>
          </div>
        </v-col>
      </v-row>

      <v-divider class="my-4" />
      <div class="d-flex justify-end">
        <v-btn color="primary" variant="tonal" size="small" :loading="savingNotifs" @click="saveNotifications">
          <v-icon icon="mdi-content-save-outline" start size="16" /> Salvar Notificações
        </v-btn>
      </div>
      <v-alert v-if="notifsSaved" type="success" variant="tonal" density="compact" text="Preferências de notificação salvas!" class="mt-3" />
    </v-card>

    <!-- ── 3b. Relatório semanal por e-mail ── -->
    <template v-if="isAdmin">
      <div class="section-label">Relatório Semanal por E-mail</div>
      <v-card class="glass pa-6 mb-6" border>
        <div class="d-flex align-center ga-3 mb-5">
          <div class="cfg-icon" style="background:linear-gradient(135deg,#8B5CF6,#A78BFA)">
            <v-icon icon="mdi-email-outline" color="white" size="20" />
          </div>
          <div class="flex-1">
            <div class="text-subtitle-1 font-weight-bold">Relatório Semanal por E-mail</div>
            <div class="text-caption" style="color:#9FB0BC">Resumo automático (leads, conversas, agendamentos) enviado por e-mail.</div>
          </div>
          <v-switch v-model="reportSchedule.active" color="primary" hide-details density="compact" />
        </div>

        <v-combobox
          v-model="reportSchedule.recipients"
          label="Destinatários (e-mails)"
          multiple chips closable-chips density="compact" class="mb-3"
          placeholder="Digite um e-mail e aperte Enter"
        />
        <v-row dense>
          <v-col cols="12" sm="4">
            <v-select v-model="reportSchedule.day_of_week" :items="weekDays" item-title="label" item-value="value" label="Dia da semana" density="compact" />
          </v-col>
          <v-col cols="6" sm="4">
            <v-text-field v-model.number="reportSchedule.hour" type="number" :min="0" :max="23" label="Hora" density="compact" />
          </v-col>
          <v-col cols="6" sm="4">
            <v-text-field v-model.number="reportSchedule.minute" type="number" :min="0" :max="59" label="Minuto" density="compact" />
          </v-col>
        </v-row>

        <v-alert type="info" variant="tonal" density="compact" class="mb-3">
          O envio depende de um servidor de e-mail (SMTP) configurado pelo administrador da plataforma no servidor.
        </v-alert>

        <div class="d-flex justify-end">
          <v-btn color="primary" variant="tonal" size="small" :loading="savingReportSchedule" @click="saveReportSchedule">
            <v-icon icon="mdi-content-save-outline" start size="16" /> Salvar
          </v-btn>
        </div>
        <v-alert v-if="reportScheduleSaved" type="success" variant="tonal" density="compact" text="Configuração salva!" class="mt-3" />
      </v-card>
    </template>

    <!-- ── 4. Acesso Rápido ── -->
    <div class="section-label">Acesso Rápido</div>
    <v-card class="glass pa-6" border>
      <p class="text-caption mb-4" style="color:#6B7C88">Navegue rapidamente para as configurações do sistema</p>
      <v-row dense>
        <v-col v-for="link in configLinks" :key="link.to" cols="12" sm="6" md="4" lg="3">
          <v-card :to="link.to" class="glass pa-4 d-flex align-center ga-3" border>
            <div class="cfg-icon" :style="`background:${link.gradient}`">
              <v-icon :icon="link.icon" color="white" size="18" />
            </div>
            <div class="flex-1 min-width-0">
              <div class="text-body-2 font-weight-bold text-truncate">{{ link.title }}</div>
              <div class="text-caption text-truncate" style="color:#9FB0BC">{{ link.desc }}</div>
            </div>
            <v-icon icon="mdi-chevron-right" size="16" style="opacity:.3" />
          </v-card>
        </v-col>
      </v-row>
    </v-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore } from '@/stores/locale.js'
import { http, api } from '@/services/api'
import { changePasswordSchema } from '@/schemas/auth'
import { validateForm } from '@/composables/useZodValidation'

const auth   = useAuthStore()
const locale = useLocaleStore()
const t = (k) => locale.t(k)
const isAdmin = computed(() => auth.user?.role === 'admin' || auth.user?.role === 'owner')

// ── Senha ──
const savingPw  = ref(false)
const pwError   = ref('')
const pwSuccess = ref(false)
const pwForm    = reactive({ current: '', newPw: '', confirm: '' })

async function changePassword() {
  pwError.value = ''; pwSuccess.value = false
  const check = validateForm(changePasswordSchema, pwForm)
  if (!check.success) { pwError.value = check.error; return }
  savingPw.value = true
  try {
    await http.post('/auth/change-password', { currentPassword: pwForm.current, newPassword: pwForm.newPw })
    pwSuccess.value = true
    Object.assign(pwForm, { current: '', newPw: '', confirm: '' })
  } catch (e) { pwError.value = e.message } finally { savingPw.value = false }
}

// ── Idioma ──
const langSaved = ref(false)
const languages = [
  { code: 'pt-BR', name: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'en-US', name: 'English (US)',        flag: '🇺🇸' },
  { code: 'es-ES', name: 'Español',             flag: '🇪🇸' },
]

function selectLang(code) {
  locale.setLocale(code)
  langSaved.value = true
  setTimeout(() => { langSaved.value = false }, 2500)
}

// ── Regional ──
const savingRegional = ref(false)
const regionalSaved  = ref(false)
const regional = reactive({
  timezone:   localStorage.getItem('sdr_timezone')    || 'America/Sao_Paulo',
  dateFormat: localStorage.getItem('sdr_dateformat')  || 'DD/MM/YYYY',
})

const timezones = [
  { label: 'Brasília — GMT-3',            value: 'America/Sao_Paulo' },
  { label: 'Manaus — GMT-4',              value: 'America/Manaus' },
  { label: 'Belém / Fortaleza — GMT-3',   value: 'America/Belem' },
  { label: 'Fernando de Noronha — GMT-2', value: 'America/Noronha' },
  { label: 'Rio Branco — GMT-5',          value: 'America/Rio_Branco' },
  { label: 'Nova York — GMT-5',           value: 'America/New_York' },
  { label: 'Los Angeles — GMT-8',         value: 'America/Los_Angeles' },
  { label: 'Lisboa — GMT+0',              value: 'Europe/Lisbon' },
  { label: 'Londres — GMT+0',             value: 'Europe/London' },
  { label: 'Madri — GMT+1',              value: 'Europe/Madrid' },
]

const dateFormats = [
  { label: 'DD/MM/AAAA  (padrão Brasil)', value: 'DD/MM/YYYY' },
  { label: 'MM/DD/AAAA  (padrão EUA)',    value: 'MM/DD/YYYY' },
  { label: 'AAAA-MM-DD  (ISO 8601)',      value: 'YYYY-MM-DD' },
]

async function saveRegional() {
  savingRegional.value = true
  try {
    localStorage.setItem('sdr_timezone',   regional.timezone)
    localStorage.setItem('sdr_dateformat', regional.dateFormat)
    regionalSaved.value = true
    setTimeout(() => { regionalSaved.value = false }, 2500)
  } finally { savingRegional.value = false }
}

// ── Notificações ──
const savingNotifs = ref(false)
const notifsSaved  = ref(false)

// "Notificações por e-mail" existia aqui antes, mas era só um toggle salvo em
// localStorage sem nenhum efeito real — o backend não tem nenhuma capacidade
// de envio de e-mail. Removido pra não prometer algo que não acontece.
const notifications = reactive(
  JSON.parse(localStorage.getItem('sdr_notifications') || 'null') || {
    browser_realtime:    true,
    browser_new_message: true,
  }
)

const unansweredTimeout = ref(parseInt(localStorage.getItem('sdr_unanswered_timeout') || '30'))

const browserNotifs = [
  { key: 'browser_realtime',    label: 'Alertas em tempo real',    desc: 'Notificações push enquanto a plataforma estiver aberta' },
  { key: 'browser_new_message', label: 'Nova mensagem recebida',   desc: 'Alerta sonoro e visual para cada nova mensagem de lead' },
]

async function saveNotifications() {
  savingNotifs.value = true
  try {
    localStorage.setItem('sdr_notifications', JSON.stringify({ ...notifications }))
    const timeout = Math.max(1, Math.min(1440, unansweredTimeout.value || 30))
    localStorage.setItem('sdr_unanswered_timeout', String(timeout))
    unansweredTimeout.value = timeout
    notifsSaved.value = true
    setTimeout(() => { notifsSaved.value = false }, 2500)
  } finally { savingNotifs.value = false }
}

// ── Relatório semanal por e-mail ──
const savingReportSchedule = ref(false)
const reportScheduleSaved = ref(false)
const reportSchedule = reactive({ active: false, recipients: [], day_of_week: 1, hour: 8, minute: 0 })
const weekDays = [
  { label: 'Domingo', value: 0 }, { label: 'Segunda', value: 1 }, { label: 'Terça', value: 2 },
  { label: 'Quarta', value: 3 }, { label: 'Quinta', value: 4 }, { label: 'Sexta', value: 5 }, { label: 'Sábado', value: 6 },
]

async function loadReportSchedule() {
  if (!isAdmin.value) return
  try {
    const s = await api.getReportSchedule()
    Object.assign(reportSchedule, { active: s.active, recipients: s.recipients || [], day_of_week: s.day_of_week, hour: s.hour, minute: s.minute })
  } catch { /* */ }
}

async function saveReportSchedule() {
  savingReportSchedule.value = true
  try {
    const s = await api.updateReportSchedule({ ...reportSchedule })
    Object.assign(reportSchedule, { active: s.active, recipients: s.recipients || [], day_of_week: s.day_of_week, hour: s.hour, minute: s.minute })
    reportScheduleSaved.value = true
    setTimeout(() => { reportScheduleSaved.value = false }, 2500)
  } finally { savingReportSchedule.value = false }
}

onMounted(loadReportSchedule)

// ── Atalhos ──
const configLinks = [
  { to: '/operacao',    title: 'Operacional',   desc: 'Timeout, pausa, visibilidade', icon: 'mdi-cog-outline',           gradient: 'linear-gradient(135deg,#EF4444,#F87171)' },
  { to: '/atendimento', title: 'Atendimento',   desc: 'Etiquetas, filas, horário',    icon: 'mdi-headset',               gradient: 'linear-gradient(135deg,#10B981,#2DD4BF)' },
  { to: '/ia-config',   title: 'IA Config',     desc: 'Prompt, modelo, temperatura',  icon: 'mdi-robot-outline',         gradient: 'linear-gradient(135deg,#6366F1,#8B5CF6)' },
  { to: '/integracoes', title: 'Integrações',   desc: 'WhatsApp, Google, APIs',       icon: 'mdi-puzzle-outline',        gradient: 'linear-gradient(135deg,#A78BFA,#C4B5FD)' },
  { to: '/templates',   title: 'Templates',     desc: 'Mensagens prontas',            icon: 'mdi-file-document-outline', gradient: 'linear-gradient(135deg,#F59E0B,#FBBF24)' },
  { to: '/apis',        title: 'APIs Externas', desc: 'OpenAI, Claude, Gemini...',   icon: 'mdi-api',                   gradient: 'linear-gradient(135deg,#38BDF8,#0EA5E9)' },
  { to: '/operadores',  title: 'Usuários',      desc: 'Equipe de atendimento',        icon: 'mdi-account-group-outline', gradient: 'linear-gradient(135deg,#6B7C88,#4D6070)' },
  { to: '/broadcast',   title: 'Broadcast',     desc: 'Campanhas em massa',           icon: 'mdi-bullhorn-outline',      gradient: 'linear-gradient(135deg,#EC4899,#F472B6)' },
]
</script>

<style scoped>
.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4D6070;
  margin-bottom: 12px;
}

.cfg-icon {
  width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}

/* evita que valores longos (e-mail, nome de empresa) estourem o card em
   telas estreitas, empurrando o rótulo do v-list-item pra um "..." */
.ellipsis-value {
  max-width: 55vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: bottom;
}

/* ── Language ── */
.lang-options { display: flex; flex-direction: column; gap: 6px; }

.lang-btn {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 10px;
  border: 1px solid var(--sep);
  background: var(--panel-bg);
  cursor: pointer; transition: all .15s;
  width: 100%; text-align: left; color: var(--text-secondary);
}
.lang-btn:hover  { background: var(--panel-hover); border-color: var(--sep-md); color: var(--text-primary); }
.lang-btn.active { background: rgba(99,102,241,0.12);  border-color: rgba(99,102,241,0.4);  color: #E2E8F0; }
.lang-flag { font-size: 20px; flex-shrink: 0; }
.lang-name { font-size: 13px; font-weight: 600; flex: 1; }

/* ── Notifications ── */
.notif-group-title {
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.07em; text-transform: uppercase;
  color: #6B7C88;
  display: flex; align-items: center;
}

.notif-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--sep);
  gap: 12px;
}
.notif-row:last-child { border-bottom: none; }
.notif-row--unanswered { border-bottom: none; }
</style>
