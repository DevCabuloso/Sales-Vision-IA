<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-5 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Templates</h1>
        <p class="text-body-2" style="color:#9FB0BC">{{ templates.length }} template(s) cadastrado(s)</p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Novo Template</v-btn>
    </div>

    <div class="d-flex flex-wrap ga-2 mb-5">
      <v-btn
        v-for="cat in ['Todos', ...CATS]" :key="cat"
        :color="filterCat === cat ? 'primary' : undefined"
        :variant="filterCat === cat ? 'tonal' : 'text'"
        size="small"
        @click="filterCat = cat"
      >{{ cat }}</v-btn>
    </div>

    <div v-if="loading" class="py-12 text-center"><v-progress-circular indeterminate color="primary" /></div>

    <v-row v-else>
      <v-col v-for="tpl in filtered" :key="tpl.id" cols="12" md="6" lg="4">
        <v-card class="glass d-flex flex-column" border style="height:100%">
          <v-card-text class="flex-1">
            <div class="d-flex align-center justify-space-between mb-2">
              <v-chip :color="catColor(tpl.category)" variant="tonal" size="small">{{ tpl.category }}</v-chip>
              <span class="text-caption" style="color:#9FB0BC">{{ formatDate(tpl.updated_at) }}</span>
            </div>
            <div class="text-body-2 font-weight-bold mb-2">{{ tpl.name }}</div>
            <p class="text-caption template-preview">{{ tpl.content }}</p>
          </v-card-text>
          <v-divider />
          <v-card-actions class="px-4 py-2">
            <v-btn size="small" variant="text" prepend-icon="mdi-test-tube" @click="openTest(tpl)">Testar</v-btn>
            <v-spacer />
            <v-btn icon variant="text" size="small" @click="duplicate(tpl)"><v-icon icon="mdi-content-copy" size="16" /></v-btn>
            <v-btn icon variant="text" size="small" @click="openEdit(tpl)"><v-icon icon="mdi-pencil-outline" size="16" /></v-btn>
            <v-btn icon variant="text" size="small" color="error" @click="openDelete(tpl)"><v-icon icon="mdi-delete-outline" size="16" /></v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col v-if="!filtered.length" cols="12">
        <v-card class="glass pa-12 text-center" border>
          <v-icon icon="mdi-file-document-outline" size="56" style="opacity:.2" class="mb-3" />
          <p class="text-body-2 mb-4" style="color:#9FB0BC">Nenhum template encontrado.</p>
          <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Criar template</v-btn>
        </v-card>
      </v-col>
    </v-row>

    <!-- Dialog: criar/editar -->
    <v-dialog v-model="editDialog" max-width="560">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">{{ editMode ? 'Editar' : 'Novo' }} Template</v-card-title>
        <v-card-text>
          <div class="d-flex ga-3 mb-3">
            <v-text-field v-model="editForm.name" label="Nome" class="flex-1" />
            <v-select v-model="editForm.category" :items="CATS" label="Categoria" style="max-width:160px" />
          </div>
          <v-textarea v-model="editForm.content" label="Conteúdo (use {{variavel}} para variáveis)" rows="5" auto-grow />
          <v-alert v-if="editError" type="error" variant="tonal" density="compact" :text="editError" class="mt-2" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveEdit">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: testar -->
    <v-dialog v-model="testDialog" max-width="500">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Testar: {{ testTarget?.name }}</v-card-title>
        <v-card-text>
          <v-textarea v-model="testContext" label="Contexto do lead..." rows="4" />
          <v-alert v-if="testResult" type="info" variant="tonal" density="compact" class="mt-3">
            <div class="font-weight-bold mb-1">Resultado gerado pela IA:</div>
            <div style="white-space:pre-wrap">{{ testResult }}</div>
          </v-alert>
          <v-alert v-if="testError" type="error" variant="tonal" density="compact" :text="testError" class="mt-3" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="testDialog = false">Fechar</v-btn>
          <v-btn color="secondary" :loading="testing" @click="runTest">Gerar com IA</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: excluir -->
    <v-dialog v-model="deleteDialog" max-width="380">
      <v-card class="glass pa-2" border>
        <v-card-title class="text-h6 font-weight-bold">Excluir template?</v-card-title>
        <v-card-text>Confirma a exclusão de <strong>{{ deleteTarget?.name }}</strong>?</v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" :loading="saving" @click="doDelete">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const templates = ref([])
const filterCat = ref('Todos')

const editDialog = ref(false)
const editMode = ref(false)
const editTarget = ref(null)
const editError = ref('')
const editForm = reactive({ name: '', category: 'geral', content: '' })

const testDialog = ref(false)
const testTarget = ref(null)
const testContext = ref('')
const testResult = ref('')
const testError = ref('')

const deleteDialog = ref(false)
const deleteTarget = ref(null)

const CATS = ['geral', 'prospecção', 'follow-up', 'proposta', 'agendamento', 'reativação']

const catColorMap = { prospecção: 'primary', 'follow-up': 'info', proposta: 'success', agendamento: 'accent', reativação: 'warning' }
function catColor(c) { return catColorMap[c] }
function formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) }

const filtered = computed(() => filterCat.value === 'Todos' ? templates.value : templates.value.filter((t) => t.category === filterCat.value))

async function load() {
  loading.value = true
  try { const { templates: t } = await api.listTemplates(); templates.value = t }
  catch (e) { toast.error(e.message) } finally { loading.value = false }
}

function openCreate() { editMode.value = false; editTarget.value = null; editError.value = ''; Object.assign(editForm, { name: '', category: 'geral', content: '' }); editDialog.value = true }
function openEdit(tpl) { editMode.value = true; editTarget.value = tpl; editError.value = ''; Object.assign(editForm, { name: tpl.name, category: tpl.category, content: tpl.content }); editDialog.value = true }

async function saveEdit() {
  editError.value = ''
  if (!editForm.name || !editForm.content) { editError.value = 'Nome e conteúdo são obrigatórios.'; return }
  saving.value = true
  try {
    if (editMode.value) { const { template } = await api.updateTemplate(editTarget.value.id, { ...editForm }); const idx = templates.value.findIndex((t) => t.id === editTarget.value.id); if (idx >= 0) templates.value[idx] = template }
    else { const { template } = await api.createTemplate({ ...editForm }); templates.value.unshift(template) }
    editDialog.value = false; toast.success(editMode.value ? 'Template atualizado.' : 'Template criado.')
  } catch (e) { editError.value = e.message } finally { saving.value = false }
}

async function duplicate(tpl) { try { const { template } = await api.duplicateTemplate(tpl.id); templates.value.unshift(template); toast.success('Template duplicado.') } catch (e) { toast.error(e.message) } }

function openDelete(tpl) { deleteTarget.value = tpl; deleteDialog.value = true }
async function doDelete() {
  saving.value = true
  try { await api.deleteTemplate(deleteTarget.value.id); templates.value = templates.value.filter((t) => t.id !== deleteTarget.value.id); deleteDialog.value = false; toast.success('Template excluído.') }
  catch (e) { toast.error(e.message) } finally { saving.value = false }
}

function openTest(tpl) { testTarget.value = tpl; testContext.value = ''; testResult.value = ''; testError.value = ''; testDialog.value = true }
async function runTest() {
  testResult.value = ''; testError.value = ''; testing.value = true
  try { const { result } = await api.testTemplate(testTarget.value.id, testContext.value); testResult.value = result }
  catch (e) { testError.value = e.message } finally { testing.value = false }
}

onMounted(load)
</script>

<style scoped>
.template-preview { color:#9FB0BC; display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; line-height:1.5; }
</style>
