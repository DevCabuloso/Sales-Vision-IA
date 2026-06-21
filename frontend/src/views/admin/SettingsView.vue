<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h4 font-weight-bold mb-1">Configurações da Plataforma</h1>
        <p class="text-body-2" style="color:#9FB0BC">Estado atual das integrações e parâmetros do sistema</p>
      </div>
      <v-btn variant="tonal" color="accent" prepend-icon="mdi-refresh" :loading="loading" @click="load">
        Atualizar
      </v-btn>
    </div>

    <div v-if="loading" class="py-12 text-center">
      <v-progress-circular indeterminate color="accent" />
    </div>

    <template v-else>
      <v-row>
        <!-- OpenAI -->
        <v-col cols="12" md="6">
          <v-card class="glass pa-6" border>
            <div class="d-flex align-center ga-3 mb-4">
              <div class="settings-icon openai d-flex align-center justify-center">
                <v-icon icon="mdi-robot-outline" size="22" color="white" />
              </div>
              <div>
                <div class="text-subtitle-1 font-weight-bold">OpenAI / IA</div>
                <div class="text-caption" style="color:#9FB0BC">Configuração do agente SDR</div>
              </div>
              <v-spacer />
              <v-chip :color="s.openai?.configured ? 'success' : 'error'" variant="tonal" size="small">
                {{ s.openai?.configured ? 'Configurado' : 'Não configurado' }}
              </v-chip>
            </div>
            <v-list density="compact" class="bg-transparent">
              <v-list-item class="px-0">
                <template #prepend><v-icon icon="mdi-tag-outline" size="16" class="mr-3" /></template>
                <v-list-item-title class="text-body-2">Modelo</v-list-item-title>
                <template #append>
                  <v-chip variant="outlined" size="small" color="secondary">{{ s.openai?.model || '—' }}</v-chip>
                </template>
              </v-list-item>
              <v-list-item class="px-0">
                <template #prepend><v-icon icon="mdi-key-outline" size="16" class="mr-3" /></template>
                <v-list-item-title class="text-body-2">API Key</v-list-item-title>
                <template #append>
                  <v-chip :color="s.openai?.configured ? 'success' : 'error'" variant="tonal" size="small">
                    {{ s.openai?.configured ? 'Definida no .env' : 'Ausente' }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
            <v-alert
              v-if="!s.openai?.configured"
              type="warning"
              variant="tonal"
              density="compact"
              class="mt-3"
              text="Defina OPENAI_API_KEY no arquivo .env do backend para ativar o agente SDR."
            />
          </v-card>
        </v-col>

        <!-- Google Calendar -->
        <v-col cols="12" md="6">
          <v-card class="glass pa-6" border>
            <div class="d-flex align-center ga-3 mb-4">
              <div class="settings-icon google d-flex align-center justify-center">
                <v-icon icon="mdi-calendar" size="22" color="white" />
              </div>
              <div>
                <div class="text-subtitle-1 font-weight-bold">Google Calendar</div>
                <div class="text-caption" style="color:#9FB0BC">OAuth para agendamentos</div>
              </div>
              <v-spacer />
              <v-chip :color="s.google?.configured ? 'success' : 'error'" variant="tonal" size="small">
                {{ s.google?.configured ? 'Configurado' : 'Não configurado' }}
              </v-chip>
            </div>
            <v-list density="compact" class="bg-transparent">
              <v-list-item class="px-0">
                <template #prepend><v-icon icon="mdi-link-variant" size="16" class="mr-3" /></template>
                <v-list-item-title class="text-body-2">Redirect URI</v-list-item-title>
                <template #append>
                  <code class="text-caption" style="color:#9FB0BC; font-size:11px;">{{ s.google?.redirectUri || '—' }}</code>
                </template>
              </v-list-item>
              <v-list-item class="px-0">
                <template #prepend><v-icon icon="mdi-key-outline" size="16" class="mr-3" /></template>
                <v-list-item-title class="text-body-2">Credenciais OAuth</v-list-item-title>
                <template #append>
                  <v-chip :color="s.google?.configured ? 'success' : 'error'" variant="tonal" size="small">
                    {{ s.google?.configured ? 'Definidas' : 'Ausentes' }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
            <v-alert
              v-if="!s.google?.configured"
              type="warning"
              variant="tonal"
              density="compact"
              class="mt-3"
              text="Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env do backend."
            />
          </v-card>
        </v-col>

        <!-- Meta WhatsApp -->
        <v-col cols="12" md="6">
          <v-card class="glass pa-6" border>
            <div class="d-flex align-center ga-3 mb-4">
              <div class="settings-icon meta d-flex align-center justify-center">
                <v-icon icon="mdi-whatsapp" size="22" color="white" />
              </div>
              <div>
                <div class="text-subtitle-1 font-weight-bold">Meta WhatsApp</div>
                <div class="text-caption" style="color:#9FB0BC">Webhook e API Cloud</div>
              </div>
            </div>
            <v-list density="compact" class="bg-transparent">
              <v-list-item class="px-0">
                <template #prepend><v-icon icon="mdi-tag-outline" size="16" class="mr-3" /></template>
                <v-list-item-title class="text-body-2">Graph API versão</v-list-item-title>
                <template #append>
                  <v-chip variant="outlined" size="small">{{ s.meta?.graphVersion || '—' }}</v-chip>
                </template>
              </v-list-item>
              <v-list-item class="px-0">
                <template #prepend><v-icon icon="mdi-shield-check-outline" size="16" class="mr-3" /></template>
                <v-list-item-title class="text-body-2">Verify Token</v-list-item-title>
                <template #append>
                  <v-chip :color="s.meta?.verifyTokenConfigured ? 'success' : 'warning'" variant="tonal" size="small">
                    {{ s.meta?.verifyTokenConfigured ? 'Configurado' : 'Padrão' }}
                  </v-chip>
                </template>
              </v-list-item>
              <v-list-item class="px-0">
                <template #prepend><v-icon icon="mdi-webhook" size="16" class="mr-3" /></template>
                <v-list-item-title class="text-body-2">Webhook URL</v-list-item-title>
                <template #append>
                  <code class="text-caption" style="color:#9FB0BC; font-size:11px;">/webhooks/meta</code>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- Banco de dados / Supabase -->
        <v-col cols="12" md="6">
          <v-card class="glass pa-6" border>
            <div class="d-flex align-center ga-3 mb-4">
              <div class="settings-icon supabase d-flex align-center justify-center">
                <v-icon icon="mdi-database-outline" size="22" color="white" />
              </div>
              <div>
                <div class="text-subtitle-1 font-weight-bold">Supabase / Banco de dados</div>
                <div class="text-caption" style="color:#9FB0BC">PostgreSQL e Realtime</div>
              </div>
              <v-spacer />
              <v-chip :color="s.supabase?.configured ? 'success' : 'error'" variant="tonal" size="small">
                {{ s.supabase?.configured ? 'Conectado' : 'Não configurado' }}
              </v-chip>
            </div>
            <v-list density="compact" class="bg-transparent">
              <v-list-item class="px-0">
                <template #prepend><v-icon icon="mdi-link-variant" size="16" class="mr-3" /></template>
                <v-list-item-title class="text-body-2">URL do projeto</v-list-item-title>
                <template #append>
                  <code class="text-caption" style="color:#9FB0BC; font-size:11px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    {{ s.supabase?.url || 'Não definida' }}
                  </code>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- JWT / Autenticação -->
        <v-col cols="12" md="6">
          <v-card class="glass pa-6" border>
            <div class="d-flex align-center ga-3 mb-4">
              <div class="settings-icon jwt d-flex align-center justify-center">
                <v-icon icon="mdi-shield-lock-outline" size="22" color="white" />
              </div>
              <div>
                <div class="text-subtitle-1 font-weight-bold">JWT / Autenticação</div>
                <div class="text-caption" style="color:#9FB0BC">Tokens de sessão</div>
              </div>
            </div>
            <v-list density="compact" class="bg-transparent">
              <v-list-item class="px-0">
                <template #prepend><v-icon icon="mdi-clock-outline" size="16" class="mr-3" /></template>
                <v-list-item-title class="text-body-2">Expiração do token</v-list-item-title>
                <template #append>
                  <v-chip variant="outlined" size="small">{{ s.jwt?.expiresIn || '—' }}</v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- Ambiente -->
        <v-col cols="12" md="6">
          <v-card class="glass pa-6" border>
            <div class="d-flex align-center ga-3 mb-4">
              <div class="settings-icon env d-flex align-center justify-center">
                <v-icon icon="mdi-server-outline" size="22" color="white" />
              </div>
              <div>
                <div class="text-subtitle-1 font-weight-bold">Ambiente</div>
                <div class="text-caption" style="color:#9FB0BC">Configurações de runtime</div>
              </div>
              <v-spacer />
              <v-chip :color="s.env === 'production' ? 'success' : 'warning'" variant="tonal" size="small">
                {{ s.env || 'development' }}
              </v-chip>
            </div>
            <p class="text-body-2" style="color:#9FB0BC">
              Para alterar as variáveis de ambiente, edite o arquivo <code>.env</code> na raiz do backend e reinicie o servidor.
            </p>
            <v-btn
              class="mt-3"
              variant="tonal"
              color="secondary"
              size="small"
              prepend-icon="mdi-file-document-outline"
              href="https://github.com/motdotla/dotenv"
              target="_blank"
            >
              Documentação .env
            </v-btn>
          </v-card>
        </v-col>
      </v-row>

      <!-- Webhooks de referência -->
      <v-card class="glass pa-6 mt-4" border>
        <div class="text-subtitle-1 font-weight-bold mb-4">
          <v-icon icon="mdi-webhook" color="accent" size="20" class="mr-1" />
          URLs de Webhook
        </div>
        <v-row>
          <v-col v-for="wh in webhooks" :key="wh.name" cols="12" md="4">
            <div class="webhook-card pa-3 rounded-lg">
              <div class="d-flex align-center ga-2 mb-2">
                <v-icon :icon="wh.icon" size="16" :color="wh.color" />
                <span class="text-body-2 font-weight-medium">{{ wh.name }}</span>
              </div>
              <div class="d-flex align-center ga-2">
                <code class="webhook-url text-caption">{{ wh.path }}</code>
                <v-btn
                  icon size="x-small" variant="text"
                  @click="copyText(wh.path)"
                >
                  <v-icon icon="mdi-content-copy" size="14" />
                </v-btn>
              </div>
            </div>
          </v-col>
        </v-row>
      </v-card>
    </template>

    <v-snackbar v-model="copied" timeout="2000" color="success">URL copiada!</v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '@/services/api'

const loading = ref(true)
const copied = ref(false)
const s = ref({})

const webhooks = [
  { name: 'Meta WhatsApp', icon: 'mdi-whatsapp', color: 'success', path: '/webhooks/meta' },
  { name: 'Evolution API', icon: 'mdi-api', color: 'info', path: '/webhooks/evolution/:tenantId' },
  { name: 'Google Calendar', icon: 'mdi-calendar', color: 'accent', path: '/api/integrations/google/callback' },
]

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => { copied.value = true })
}

async function load() {
  loading.value = true
  try {
    s.value = await api.adminSettings()
  } catch (e) {
    console.error('[settings]', e.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.settings-icon {
  width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
}
.settings-icon.openai { background: linear-gradient(135deg, #10B981, #2DD4BF); }
.settings-icon.google { background: linear-gradient(135deg, #4285F4, #34A853); }
.settings-icon.meta { background: linear-gradient(135deg, #25D366, #128C7E); }
.settings-icon.supabase { background: linear-gradient(135deg, #3ECF8E, #1C7C4A); }
.settings-icon.jwt { background: linear-gradient(135deg, #6366F1, #8B5CF6); }
.settings-icon.env { background: linear-gradient(135deg, #F59E0B, #FBBF24); }

.webhook-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
}
.webhook-url {
  background: rgba(0,0,0,0.3);
  padding: 4px 8px;
  border-radius: 6px;
  color: #9FB0BC;
  font-family: monospace;
  font-size: 11px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
