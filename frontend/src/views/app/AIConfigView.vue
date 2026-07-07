<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Configuração da IA</h1>
        <p class="text-body-2" style="color:#9FB0BC">Personalize o comportamento do agente SDR.</p>
      </div>
      <div class="d-flex ga-2">
        <v-btn variant="tonal" prepend-icon="mdi-test-tube" :disabled="testing" @click="openTest">Testar IA</v-btn>
        <v-btn color="primary" prepend-icon="mdi-content-save-outline" :loading="saving" @click="save">Salvar</v-btn>
      </div>
    </div>

    <div v-if="loading" class="py-12 text-center"><v-progress-circular indeterminate color="primary" /></div>

    <v-row v-else>
      <!-- Identidade -->
      <v-col cols="12" md="6">
        <v-card class="glass pa-6" border>
          <div class="d-flex align-center ga-2 mb-5">
            <v-icon icon="mdi-robot-outline" color="primary" size="22" />
            <span class="text-subtitle-1 font-weight-bold">Identidade</span>
          </div>
          <v-text-field v-model="form.name" label="Nome da IA" placeholder="SDR IA" class="mb-3" />
          <v-select v-model="form.model" :items="models" label="Modelo" class="mb-3" />
          <div class="mb-3">
            <div class="d-flex justify-space-between text-body-2 mb-1">
              <span>Temperatura</span>
              <span class="font-weight-bold">{{ form.temperature.toFixed(1) }}</span>
            </div>
            <v-slider v-model="form.temperature" min="0" max="2" step="0.1" color="primary" track-color="rgba(255,255,255,0.08)" hide-details />
            <div class="d-flex justify-space-between text-caption mt-1" style="color:#6B7C88">
              <span>Preciso</span><span>Criativo</span>
            </div>
          </div>
          <v-text-field v-model.number="form.max_tokens" label="Máximo de tokens" type="number" min="100" max="32000" />
        </v-card>
      </v-col>

      <!-- Prompts -->
      <v-col cols="12" md="6">
        <v-card class="glass pa-6 mb-4" border>
          <div class="d-flex align-center ga-2 mb-3">
            <v-icon icon="mdi-text-box-outline" color="secondary" size="22" />
            <span class="text-subtitle-1 font-weight-bold">Prompt de Sistema</span>
          </div>
          <p class="text-caption mb-3" style="color:#9FB0BC">Define personalidade, tom e regras da IA.</p>
          <v-textarea v-model="form.system_prompt" placeholder="Ex: Você é a Lara, assistente de vendas da Empresa XYZ..." rows="4" auto-grow maxlength="8000" />
        </v-card>
        <v-card class="glass pa-6 mb-4" border>
          <div class="d-flex align-center ga-2 mb-3">
            <v-icon icon="mdi-format-text" color="accent" size="22" />
            <span class="text-subtitle-1 font-weight-bold">Prompt Principal</span>
          </div>
          <p class="text-caption mb-3" style="color:#9FB0BC">Contexto do negócio: produtos, preços, diferenciais.</p>
          <v-textarea v-model="form.main_prompt" placeholder="Ex: Nossa solução custa R$ 297/mês..." rows="4" auto-grow maxlength="8000" />
        </v-card>

        <v-card class="glass pa-6" border>
          <div class="d-flex align-center ga-2 mb-3">
            <v-icon icon="mdi-file-document-outline" color="primary" size="22" />
            <span class="text-subtitle-1 font-weight-bold">Base de Conhecimento</span>
          </div>
          <p class="text-caption mb-3" style="color:#9FB0BC">Envie um catálogo de produtos/serviços (PDF, XLSX, CSV ou TXT) para a IA consultar nas conversas.</p>

          <div v-if="knowledgeBase.filename" class="d-flex align-center ga-2 mb-3 pa-3" style="background:rgba(255,255,255,0.04); border-radius:8px">
            <v-icon icon="mdi-file-check-outline" color="success" size="20" />
            <div class="flex-grow-1" style="min-width:0">
              <div class="text-body-2 font-weight-medium text-truncate">{{ knowledgeBase.filename }}</div>
              <div class="text-caption" style="color:#6B7C88">Atualizado em {{ formatDate(knowledgeBase.updatedAt) }}</div>
            </div>
            <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" :loading="removingKB" @click="removeKB" />
          </div>

          <v-file-input
            v-model="kbFile"
            label="Selecionar arquivo"
            accept=".pdf,.xlsx,.xls,.csv,.txt"
            prepend-icon=""
            prepend-inner-icon="mdi-paperclip"
            density="compact"
            variant="outlined"
            :loading="uploadingKB"
            show-size
            @update:model-value="uploadKB"
          />
          <v-alert v-if="kbError" type="error" variant="tonal" density="compact" :text="kbError" class="mt-2" />
          <v-alert v-if="kbTruncated" type="warning" variant="tonal" density="compact" text="Documento muito grande — apenas os primeiros 15.000 caracteres foram usados." class="mt-2" />
        </v-card>
      </v-col>
    </v-row>

    <!-- Dialog: testar -->
    <v-dialog v-model="testDialog" max-width="500">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Testar IA</v-card-title>
        <v-card-text>
          <v-textarea v-model="testMessage" label="Mensagem de teste" placeholder="Olá, vim pelo Instagram..." rows="4" />
          <v-alert v-if="testResult" type="info" variant="tonal" density="compact" class="mt-3">
            <div class="font-weight-bold mb-1">Resposta da IA:</div>
            <div style="white-space:pre-wrap">{{ testResult }}</div>
          </v-alert>
          <v-alert v-if="testError" type="error" variant="tonal" density="compact" :text="testError" class="mt-3" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="testDialog = false">Fechar</v-btn>
          <v-btn color="secondary" :loading="testing" @click="runTest">Enviar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '@/services/api'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const testDialog = ref(false)
const testMessage = ref('')
const testResult = ref('')
const testError = ref('')

const models = ['gpt-4o-mini', 'gpt-4.1-mini']
const form = reactive({ name: 'SDR IA', model: 'gpt-4o-mini', system_prompt: '', main_prompt: '', temperature: 0.7, max_tokens: 1000 })

const knowledgeBase = reactive({ filename: '', updatedAt: null })
const kbFile = ref(null)
const uploadingKB = ref(false)
const removingKB = ref(false)
const kbError = ref('')
const kbTruncated = ref(false)

function applyConfig(cfg) {
  if (!cfg) return
  form.name = cfg.name ?? form.name; form.model = cfg.model ?? form.model
  form.system_prompt = cfg.system_prompt ?? ''; form.main_prompt = cfg.main_prompt ?? ''
  form.temperature = Number(cfg.temperature ?? 0.7); form.max_tokens = cfg.max_tokens ?? 1000
  knowledgeBase.filename = cfg.knowledge_base_filename ?? ''
  knowledgeBase.updatedAt = cfg.knowledge_base_updated_at ?? null
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR')
}

async function uploadKB(file) {
  if (!file) return
  kbError.value = ''; kbTruncated.value = false; uploadingKB.value = true
  try {
    const { config, truncated } = await api.uploadKnowledgeBase(file)
    applyConfig(config)
    kbTruncated.value = !!truncated
    toast.success('Base de conhecimento atualizada.')
  } catch (e) {
    kbError.value = e.message
  } finally {
    uploadingKB.value = false
    kbFile.value = null
  }
}

async function removeKB() {
  removingKB.value = true
  try {
    const { config } = await api.removeKnowledgeBase()
    applyConfig(config)
    toast.success('Base de conhecimento removida.')
  } catch (e) {
    toast.error(e.message)
  } finally {
    removingKB.value = false
  }
}

async function load() { loading.value = true; try { const { config } = await api.getAIConfig(); applyConfig(config) } catch (e) { toast.error(e.message) } finally { loading.value = false } }
async function save() { saving.value = true; try { const { config } = await api.saveAIConfig({ ...form }); applyConfig(config); toast.success('Configuração salva.') } catch (e) { toast.error(e.message) } finally { saving.value = false } }

function openTest() { testResult.value = ''; testError.value = ''; testDialog.value = true }
async function runTest() {
  testResult.value = ''; testError.value = ''; testing.value = true
  try { const { reply } = await api.testAIConfig(testMessage.value || undefined); testResult.value = reply }
  catch (e) { testError.value = e.message } finally { testing.value = false }
}

onMounted(load)
</script>
