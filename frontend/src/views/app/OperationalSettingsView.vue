<template>
  <div>
    <!-- Cabeçalho -->
    <div class="d-flex align-center justify-space-between mb-1 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold">Configurações Operacionais</h1>
        <p class="text-body-2" style="color:#9FB0BC">Controle o comportamento do atendimento, visibilidade e automações</p>
      </div>
      <v-btn color="primary" :loading="saving" prepend-icon="mdi-content-save-outline" @click="save">
        Salvar Alterações
      </v-btn>
    </div>

    <v-alert v-if="loadError" type="warning" variant="tonal" density="compact" :text="loadError" class="mt-4 mb-2" />

    <div v-if="loading" class="py-16 text-center">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else>

      <!-- ── 1. Encerramento Automático ── -->
      <div class="section-label mt-5">Encerramento Automático</div>
      <v-card class="glass pa-6 mb-4" border>
        <div class="card-header mb-4">
          <div class="cfg-icon" style="background:linear-gradient(135deg,#EF4444,#F87171)">
            <v-icon icon="mdi-timer-off-outline" color="white" size="20" />
          </div>
          <div>
            <div class="text-subtitle-2 font-weight-bold">Timeout de Inatividade</div>
            <div class="text-caption" style="color:#9FB0BC">Fecha tickets sem resposta do lead após o tempo configurado</div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Ativar encerramento por inatividade</div>
            <div class="text-caption text-muted">Fecha automaticamente tickets sem interação do lead</div>
          </div>
          <v-switch v-model="s.auto_close_enabled" color="primary" hide-details density="compact" />
        </div>

        <template v-if="s.auto_close_enabled">
          <div class="setting-row">
            <div class="setting-info">
              <div class="text-body-2 font-weight-medium">Tempo até encerrar (minutos)</div>
              <div class="text-caption text-muted">Ex: 30 = fecha após 30 min sem resposta do lead</div>
            </div>
            <v-text-field v-model.number="s.auto_close_minutes" type="number" min="1" max="1440" density="compact" hide-details style="max-width:100px" />
          </div>
          <div class="setting-row setting-row--column">
            <div class="text-body-2 font-weight-medium mb-2">Mensagem enviada ao encerrar</div>
            <v-textarea v-model="s.auto_close_message" rows="2" density="compact" hide-details auto-grow />
          </div>
        </template>

        <v-divider class="my-3" />

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Carência pós-atendimento</div>
            <div class="text-caption text-muted">Se o lead responder dentro deste prazo após o fechamento, reabre para o mesmo agente. 0 = desativado</div>
          </div>
          <div class="d-flex align-center ga-2">
            <v-text-field v-model.number="s.post_close_grace_minutes" type="number" min="0" max="1440" density="compact" hide-details style="max-width:80px" />
            <span class="text-caption text-muted">min</span>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Forçar motivo no fechamento</div>
            <div class="text-caption text-muted">Agentes precisam selecionar um motivo ao encerrar o ticket</div>
          </div>
          <v-switch v-model="s.force_close_reason" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Reabrir ticket toma posse do agente</div>
            <div class="text-caption text-muted">Ao reativar um ticket fechado, o agente torna-se o novo responsável</div>
          </div>
          <v-switch v-model="s.reopen_takes_ownership" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row setting-row--last">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Transbordo de tickets (agentes offline)</div>
            <div class="text-caption text-muted">Move automaticamente tickets de agentes offline para os disponíveis</div>
          </div>
          <v-switch v-model="s.transfer_offline_tickets" color="primary" hide-details density="compact" />
        </div>
      </v-card>

      <!-- ── 2. Comportamento dos Agentes ── -->
      <div class="section-label">Comportamento dos Agentes</div>
      <v-card class="glass pa-6 mb-4" border>
        <div class="card-header mb-4">
          <div class="cfg-icon" style="background:linear-gradient(135deg,#10B981,#2DD4BF)">
            <v-icon icon="mdi-account-cog-outline" color="white" size="20" />
          </div>
          <div>
            <div class="text-subtitle-2 font-weight-bold">Controle de Agentes</div>
            <div class="text-caption" style="color:#9FB0BC">Regras de presença, pausa e notificações</div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Permitir pausar atendimento</div>
            <div class="text-caption text-muted">Habilita o botão de pausa na barra de ferramentas do agente</div>
          </div>
          <v-switch v-model="s.allow_pause" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row" :class="{ 'setting-row--disabled': !s.allow_pause }">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Despausar quando lead responder</div>
            <div class="text-caption text-muted">Retoma o atendimento pausado automaticamente ao receber resposta do lead</div>
          </div>
          <v-switch v-model="s.unpause_on_client_reply" color="primary" hide-details density="compact" :disabled="!s.allow_pause" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Ficar offline ao fechar a aba</div>
            <div class="text-caption text-muted">Marca o agente como offline ao fechar a última aba do sistema</div>
          </div>
          <v-switch v-model="s.offline_on_tab_close" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Notificações sonoras</div>
            <div class="text-caption text-muted">Alerta de áudio para novas mensagens e tickets atribuídos</div>
          </div>
          <v-switch v-model="s.sound_notifications" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row setting-row--last">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Push somente para o dono do ticket</div>
            <div class="text-caption text-muted">Envia notificação push apenas ao agente responsável, sem notificar supervisores</div>
          </div>
          <v-switch v-model="s.limit_push_to_owner" color="primary" hide-details density="compact" />
        </div>
      </v-card>

      <!-- ── 3. Visibilidade de Tickets ── -->
      <div class="section-label">Visibilidade de Tickets</div>
      <v-card class="glass pa-6 mb-4" border>
        <div class="card-header mb-4">
          <div class="cfg-icon" style="background:linear-gradient(135deg,#6366F1,#8B5CF6)">
            <v-icon icon="mdi-eye-settings-outline" color="white" size="20" />
          </div>
          <div>
            <div class="text-subtitle-2 font-weight-bold">Permissões de Visibilidade</div>
            <div class="text-caption" style="color:#9FB0BC">Defina o que cada perfil pode ver na tela de atendimentos</div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Ocultar tickets atribuídos a outros agentes</div>
            <div class="text-caption text-muted">Agentes veem apenas seus próprios tickets e os sem atribuição</div>
          </div>
          <v-switch v-model="s.hide_other_tickets" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Ocultar tickets em atendimento pelo Bot</div>
            <div class="text-caption text-muted">Esconde tickets que ainda estão em fluxo automatizado de IA</div>
          </div>
          <v-switch v-model="s.hide_chatbot_tickets" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Visualizar tickets sem destinatário ou fila</div>
            <div class="text-caption text-muted">Agentes podem ver tickets que entraram sem fila ou agente definido</div>
          </div>
          <v-switch v-model="s.show_unassigned_tickets" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Supervisor com visão de agente</div>
            <div class="text-caption text-muted">Remove os privilégios extras de visualização do perfil Supervisor</div>
          </div>
          <v-switch v-model="s.supervisor_as_agent" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Privacidade do Funil (Kanban)</div>
            <div class="text-caption text-muted">Restringe a visualização de cards no Kanban apenas ao responsável por cada oportunidade</div>
          </div>
          <v-switch v-model="s.kanban_private" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Mostrar histórico de atendimentos anteriores</div>
            <div class="text-caption text-muted">Exibe mensagens de tickets anteriores do mesmo contato</div>
          </div>
          <v-switch v-model="s.show_message_history" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row setting-row--last">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Não atualizar nome pelo perfil do WhatsApp</div>
            <div class="text-caption text-muted">Preserva o nome salvo no cadastro ao invés de usar o nome do perfil do lead</div>
          </div>
          <v-switch v-model="s.preserve_contact_name" color="primary" hide-details density="compact" />
        </div>
      </v-card>

      <!-- ── 4. Ordenação & Display ── -->
      <div class="section-label">Ordenação &amp; Display</div>
      <v-card class="glass pa-6 mb-4" border>
        <div class="card-header mb-4">
          <div class="cfg-icon" style="background:linear-gradient(135deg,#F59E0B,#FBBF24)">
            <v-icon icon="mdi-sort-variant" color="white" size="20" />
          </div>
          <div>
            <div class="text-subtitle-2 font-weight-bold">Exibição da Lista de Atendimentos</div>
            <div class="text-caption" style="color:#9FB0BC">Ordem, filtros e elementos visuais da fila</div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Ordenar por última mensagem</div>
            <div class="text-caption text-muted">Tickets com interação mais recente aparecem no topo</div>
          </div>
          <v-switch v-model="s.list_by_last_message" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Inverter ordem da lista</div>
            <div class="text-caption text-muted">Exibe os tickets mais antigos no topo</div>
          </div>
          <v-switch v-model="s.reverse_ticket_order" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Contador nas abas superiores</div>
            <div class="text-caption text-muted">Mostra a quantidade de tickets em cada aba (Privados / Grupos / Pendentes)</div>
          </div>
          <v-switch v-model="s.show_tab_counters" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row setting-row--last">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Filtrar conversas inativas</div>
            <div class="text-caption text-muted">Oculta tickets sem atividade há mais de X dias. 0 = não filtrar</div>
          </div>
          <div class="d-flex align-center ga-2">
            <v-text-field v-model.number="s.filter_old_tickets_days" type="number" min="0" density="compact" hide-details style="max-width:80px" />
            <span class="text-caption text-muted">dias</span>
          </div>
        </div>
      </v-card>

      <!-- ── 5. Bot & Automação ── -->
      <div class="section-label">Bot &amp; Automação</div>
      <v-card class="glass pa-6 mb-4" border>
        <div class="card-header mb-4">
          <div class="cfg-icon" style="background:linear-gradient(135deg,#A78BFA,#C4B5FD)">
            <v-icon icon="mdi-robot-outline" color="white" size="20" />
          </div>
          <div>
            <div class="text-subtitle-2 font-weight-bold">Comportamento do Bot</div>
            <div class="text-caption" style="color:#9FB0BC">Mensagens automáticas e regras de fluxo</div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Habilitar suporte a grupos</div>
            <div class="text-caption text-muted">Mensagens de grupos do WhatsApp passam a virar conversas no Chat, atendidas por um humano (a IA nunca responde em grupo)</div>
          </div>
          <v-switch
            :model-value="!s.ignore_group_messages"
            @update:model-value="(v) => (s.ignore_group_messages = !v)"
            color="primary" hide-details density="compact"
          />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Mostrar grupos para todos os agentes</div>
            <div class="text-caption text-muted">Vale só pra grupos sem acesso restrito definido (configurado dentro de cada conversa de grupo, no Chat) — um grupo com acesso restrito só aparece pra quem foi selecionado, mesmo com isso ligado</div>
          </div>
          <v-switch v-model="s.show_groups_to_all" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Mostrar tickets fechados para todos</div>
            <div class="text-caption text-muted">Agentes podem consultar o histórico de atendimentos encerrados</div>
          </div>
          <v-switch v-model="s.show_closed_to_all" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Manter agente ao mover para pendente</div>
            <div class="text-caption text-muted">Preserva o vínculo com o atendente ao mover ticket de "Aberto" para "Pendente"</div>
          </div>
          <v-switch v-model="s.force_agent_on_status_change" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row setting-row--last" :class="{ 'setting-row--column': s.call_message_enabled }">
          <div class="d-flex align-center justify-space-between" style="width:100%">
            <div class="setting-info">
              <div class="text-body-2 font-weight-medium">Mensagem automática para chamadas de voz</div>
              <div class="text-caption text-muted">Envia aviso automático quando o lead tenta ligar via WhatsApp</div>
            </div>
            <v-switch v-model="s.call_message_enabled" color="primary" hide-details density="compact" />
          </div>
          <v-text-field
            v-if="s.call_message_enabled"
            v-model="s.call_message_text"
            label="Texto da mensagem de chamada"
            density="compact"
            hide-details
            class="mt-2"
            style="width:100%"
          />
        </div>
      </v-card>

      <!-- ── 6. WhatsApp Oficial (WABA) ── -->
      <div class="section-label">WhatsApp Oficial (WABA)</div>
      <v-card class="glass pa-6 mb-6" border>
        <div class="card-header mb-4">
          <div class="cfg-icon" style="background:linear-gradient(135deg,#25D366,#128C7E)">
            <v-icon icon="mdi-whatsapp" color="white" size="20" />
          </div>
          <div>
            <div class="text-subtitle-2 font-weight-bold">Meta WhatsApp Business API</div>
            <div class="text-caption" style="color:#9FB0BC">Configurações exclusivas do canal oficial. Requer integração Meta ativa</div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Validar número ao cadastrar contato</div>
            <div class="text-caption text-muted">Verifica se o número é válido na API WABA durante o cadastro</div>
          </div>
          <v-switch v-model="s.waba_validate_contact" color="primary" hide-details density="compact" />
        </div>

        <div class="setting-row setting-row--last">
          <div class="setting-info">
            <div class="text-body-2 font-weight-medium">Permitir envio fora da janela de 24h</div>
            <div class="text-caption text-muted">Tenta enviar mensagem após a janela expirar via templates HSM (sem garantia de entrega)</div>
          </div>
          <v-switch v-model="s.waba_out_of_window" color="primary" hide-details density="compact" />
        </div>
      </v-card>

      <!-- Botão salvar inferior -->
      <div class="d-flex justify-end mb-8">
        <v-btn color="primary" size="large" :loading="saving" prepend-icon="mdi-content-save-outline" @click="save">
          Salvar Alterações
        </v-btn>
      </div>
    </template>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3500" location="bottom right">
      {{ snack.text }}
    </v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { http } from '@/services/api'
import { DEFAULTS, opSettingsSchema } from '@/schemas/opSettings'
import { validateForm } from '@/composables/useZodValidation'

const loading   = ref(true)
const saving    = ref(false)
const loadError = ref('')
const snack     = reactive({ show: false, text: '', color: 'success' })

const s = reactive({ ...DEFAULTS })

function toast(text, color = 'success') {
  snack.text = text; snack.color = color; snack.show = true
}

async function load() {
  try {
    const { data } = await http.get('/op-settings')
    Object.assign(s, { ...DEFAULTS, ...data.settings })
  } catch {
    loadError.value = 'Não foi possível carregar as configurações do servidor. Exibindo valores padrão.'
    Object.assign(s, { ...DEFAULTS })
  } finally {
    loading.value = false
  }
}

async function save() {
  const check = validateForm(opSettingsSchema, s)
  if (!check.success) { toast(check.error, 'error'); return }
  saving.value = true
  try {
    await http.put('/op-settings', check.data)
    toast('Configurações operacionais salvas com sucesso!')
  } catch (e) {
    toast(e.message || 'Erro ao salvar configurações.', 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
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

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 0;
  border-bottom: 1px solid var(--sep);
}
.setting-row--last  { border-bottom: none; }
.setting-row--column { flex-direction: column; align-items: flex-start; }
.setting-row--disabled { opacity: 0.45; pointer-events: none; }

.setting-info { flex: 1; min-width: 0; }

.text-muted { color: #6B7C88; }
</style>
