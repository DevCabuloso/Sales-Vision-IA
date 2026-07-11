<template>
  <div class="ob-bg">
    <div class="ob-wrap">

      <!-- Progresso -->
      <div class="ob-progress">
        <div v-for="(s, i) in stepLabels" :key="s" class="ob-progress-item" :class="{ active: i === step, done: i < step }">
          <div class="ob-progress-dot">
            <v-icon v-if="i < step" icon="mdi-check" size="12" />
            <span v-else>{{ i + 1 }}</span>
          </div>
          <span class="ob-progress-label">{{ s }}</span>
        </div>
      </div>

      <div class="ob-card">

        <!-- 1. NEGÓCIO -->
        <section v-if="step === 0">
          <h2 class="ob-title">Fale sobre o seu negócio</h2>
          <p class="ob-sub">Essas informações vão alimentar diretamente as respostas do seu chatbot ou IA.</p>

          <div class="ob-field">
            <label class="ob-label">Nome do negócio</label>
            <input v-model="business.name" class="ob-input" placeholder="Ex: Studio Fit Academia" />
          </div>
          <div class="ob-field">
            <label class="ob-label">Segmento</label>
            <input v-model="business.segment" class="ob-input" placeholder="Ex: Academia, imobiliária, clínica..." />
          </div>
          <div class="ob-field">
            <label class="ob-label">Descreva seus produtos/serviços, diferenciais e preços</label>
            <textarea v-model="business.description" class="ob-textarea" rows="6"
              placeholder="Quanto mais detalhe, melhor o atendimento responde seus clientes. Ex: planos, valores, horários, diferenciais..." />
          </div>
        </section>

        <!-- 2. EQUIPE -->
        <section v-if="step === 1">
          <h2 class="ob-title">Monte sua equipe</h2>
          <p class="ob-sub">Crie os setores/filas de atendimento e quem vai ter acesso à plataforma. Isso é opcional — você pode ajustar tudo depois.</p>

          <div class="ob-subhead">Setores / filas</div>
          <div v-for="(q, i) in queues" :key="q.localId" class="ob-row">
            <input v-model="q.color" type="color" class="ob-color" />
            <input v-model="q.name" class="ob-input ob-input-flex" placeholder="Nome da fila (ex: Vendas)" />
            <button class="ob-icon-btn" @click="queues.splice(i, 1)"><v-icon icon="mdi-close" size="16" /></button>
          </div>
          <button class="ob-add-btn" @click="queues.push({ localId: uid(), name: '', color: randomColor() })">
            <v-icon icon="mdi-plus" size="14" /> Adicionar fila
          </button>

          <div class="ob-subhead" style="margin-top:28px">Pessoas da equipe</div>
          <p class="ob-sub" style="margin:0 0 14px">Você já tem acesso de administrador — aqui é só o resto do time (opcional).</p>

          <div v-for="(m, i) in team" :key="m.localId" class="ob-member">
            <div class="ob-member-top">
              <input v-model="m.name" class="ob-input ob-input-flex" placeholder="Nome" />
              <input v-model="m.email" type="email" class="ob-input ob-input-flex" placeholder="E-mail" />
              <select v-model="m.role" class="ob-input ob-select">
                <option value="agent">Atendente</option>
                <option value="admin">Administrador</option>
              </select>
              <button class="ob-icon-btn" @click="team.splice(i, 1)"><v-icon icon="mdi-close" size="16" /></button>
            </div>
            <div v-if="queues.length" class="ob-member-queues">
              <button
                v-for="q in queues" :key="q.localId"
                class="ob-chip" :class="{ active: m.queueIds.includes(q.localId) }"
                @click="toggleQueue(m, q.localId)"
              >{{ q.name || 'Sem nome' }}</button>
            </div>
          </div>
          <button class="ob-add-btn" @click="team.push({ localId: uid(), name: '', email: '', role: 'agent', queueIds: [] })">
            <v-icon icon="mdi-plus" size="14" /> Adicionar pessoa
          </button>
        </section>

        <!-- 3. ATENDIMENTO -->
        <section v-if="step === 2">
          <h2 class="ob-title">Atendimento automático</h2>
          <p class="ob-sub">Escolha como as primeiras mensagens do seu WhatsApp serão respondidas.</p>

          <div class="ob-mode-select">
            <button class="ob-mode-card" :class="{ active: attendanceMode === 'chatbot' }" @click="attendanceMode = 'chatbot'">
              <v-icon icon="mdi-sitemap-outline" size="22" />
              <div class="ob-mode-title">Chatbot simples</div>
              <div class="ob-mode-text">Um menu de opções fixo — você define as respostas.</div>
            </button>
            <button class="ob-mode-card" :class="{ active: attendanceMode === 'ia' }" @click="attendanceMode = 'ia'">
              <v-icon icon="mdi-robot-outline" size="22" />
              <div class="ob-mode-title">Inteligência Artificial</div>
              <div class="ob-mode-text">Um agente de IA conversa naturalmente com o cliente.</div>
            </button>
          </div>

          <!-- CHATBOT -->
          <div v-if="attendanceMode === 'chatbot'" class="ob-mode-body">
            <div class="ob-field">
              <label class="ob-label">Mensagem de boas-vindas</label>
              <textarea v-model="chatbot.welcomeMsg" class="ob-textarea" rows="3" />
            </div>

            <label class="ob-label" style="margin-bottom:8px;display:block">Opções do menu</label>
            <div v-for="(o, i) in chatbot.options" :key="i" class="ob-option">
              <div class="ob-option-row">
                <input v-model="o.texto" class="ob-input ob-input-flex" placeholder="Texto da opção (ex: 1 - Vendas)" />
                <select v-model="o.acao" class="ob-input ob-select">
                  <option value="transferir">Transferir p/ atendente</option>
                  <option value="encerrar">Encerrar conversa</option>
                </select>
                <button class="ob-icon-btn" @click="chatbot.options.splice(i, 1)"><v-icon icon="mdi-close" size="16" /></button>
              </div>
              <textarea v-model="o.resposta" class="ob-textarea" rows="2" placeholder="Resposta enviada quando o cliente escolher essa opção" />
              <select v-if="o.acao === 'transferir' && createdQueues.length" v-model="o.queueLocalId" class="ob-input ob-select" style="margin-top:8px">
                <option :value="null">Sem fila específica</option>
                <option v-for="q in createdQueues" :key="q.localId" :value="q.localId">{{ q.name }}</option>
              </select>
            </div>
            <button class="ob-add-btn" @click="chatbot.options.push({ texto: '', resposta: '', acao: 'transferir', queueLocalId: null })">
              <v-icon icon="mdi-plus" size="14" /> Adicionar opção
            </button>
          </div>

          <!-- IA -->
          <div v-if="attendanceMode === 'ia'" class="ob-mode-body">
            <div class="ob-field">
              <label class="ob-label">Nome da IA</label>
              <input v-model="ai.name" class="ob-input" placeholder="Ex: Ana" />
            </div>
            <div class="ob-field">
              <label class="ob-label">Personalidade e tom de voz</label>
              <textarea v-model="ai.system_prompt" class="ob-textarea" rows="4" />
            </div>
            <div class="ob-field">
              <label class="ob-label">Contexto do negócio (produtos, preços, diferenciais)</label>
              <textarea v-model="ai.main_prompt" class="ob-textarea" rows="4" />
            </div>

            <div class="ob-openai-box">
              <div class="ob-openai-title"><v-icon icon="mdi-key-outline" size="16" /> Sua própria chave da OpenAI</div>
              <p class="ob-sub" style="margin:0 0 12px">
                A IA roda com a chave da <strong>sua</strong> conta OpenAI (não é compartilhada com outros clientes). Passo a passo:
              </p>
              <ol class="ob-steps-list">
                <li>Crie uma conta em <a href="https://platform.openai.com/signup" target="_blank" rel="noopener">platform.openai.com/signup</a></li>
                <li>Cadastre um cartão em <a href="https://platform.openai.com/settings/organization/billing" target="_blank" rel="noopener">platform.openai.com → Billing</a></li>
                <li>Gere uma chave em <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a></li>
              </ol>
              <div class="ob-field" style="margin-top:12px">
                <label class="ob-label">Cole sua chave da API aqui</label>
                <div class="ob-field-wrap">
                  <input v-model="ai.openaiKey" :type="showKey ? 'text' : 'password'" class="ob-input" placeholder="sk-..." />
                  <button class="ob-icon-btn" @click="showKey = !showKey">
                    <v-icon :icon="showKey ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 4. HORÁRIO -->
        <section v-if="step === 3">
          <h2 class="ob-title">Horário de atendimento</h2>
          <p class="ob-sub">Fora desse horário, o atendimento avisa o cliente e responde só no próximo expediente.</p>

          <div class="ob-hours-toggle">
            <label class="ob-switch">
              <input type="checkbox" v-model="hours.enabled" />
              <span class="ob-switch-slider" />
            </label>
            <span>Ativar horário de atendimento</span>
          </div>

          <div v-if="hours.enabled" class="ob-hours-grid">
            <div class="ob-field">
              <label class="ob-label">Abre</label>
              <input v-model="hours.start" type="time" class="ob-input" />
            </div>
            <div class="ob-field">
              <label class="ob-label">Fecha</label>
              <input v-model="hours.end" type="time" class="ob-input" />
            </div>
          </div>

          <div v-if="hours.enabled" class="ob-field">
            <label class="ob-label">Mensagem fora do horário</label>
            <textarea v-model="hours.off_message" class="ob-textarea" rows="3" />
          </div>
        </section>

        <!-- 5. REVISÃO -->
        <section v-if="step === 4">
          <h2 class="ob-title">Tudo pronto!</h2>
          <p class="ob-sub">Confira o resumo — você pode ajustar tudo depois dentro da plataforma.</p>

          <div class="ob-review">
            <div class="ob-review-item"><v-icon icon="mdi-domain" size="16" /> {{ business.name || 'Negócio sem nome' }}</div>
            <div class="ob-review-item">
              <v-icon icon="mdi-robot-outline" size="16" />
              Atendimento: {{ attendanceMode === 'ia' ? `IA (${ai.name || 'sem nome'})` : attendanceMode === 'chatbot' ? 'Chatbot simples' : 'não configurado' }}
            </div>
            <div class="ob-review-item"><v-icon icon="mdi-clock-outline" size="16" /> Horário: {{ hours.enabled ? `${hours.start} às ${hours.end}` : 'sempre ativo' }}</div>
          </div>

          <div v-if="createdTeam.length" class="ob-review-team">
            <div class="ob-subhead">Acessos criados — copie e repasse à equipe</div>
            <p class="ob-sub" style="margin:0 0 10px">Essas senhas só aparecem aqui uma vez.</p>
            <div v-for="m in createdTeam" :key="m.id" class="ob-credential">
              <div>
                <div class="ob-credential-name">{{ m.name }}</div>
                <div class="ob-credential-email">{{ m.email }}</div>
              </div>
              <code class="ob-credential-pass">{{ m.password }}</code>
            </div>
          </div>

          <div class="ob-notice">
            <v-icon icon="mdi-whatsapp" size="16" />
            Nosso time vai entrar em contato para conectar o seu número de WhatsApp.
          </div>
        </section>

        <div v-if="error" class="ob-error">
          <v-icon icon="mdi-alert-circle-outline" size="15" />
          {{ error }}
        </div>

        <!-- NAV -->
        <div class="ob-nav">
          <button v-if="step > 0" class="ob-btn ob-btn-ghost" @click="back">Voltar</button>
          <span v-else />
          <button v-if="step < stepLabels.length - 1" class="ob-btn ob-btn-primary" :disabled="saving" @click="next">
            <v-progress-circular v-if="saving" size="16" width="2" indeterminate color="white" />
            <span v-else>Continuar</span>
          </button>
          <button v-else class="ob-btn ob-btn-primary" :disabled="saving" @click="finish">
            <v-progress-circular v-if="saving" size="16" width="2" indeterminate color="white" />
            <span v-else>Ir para o painel</span>
          </button>
        </div>
      </div>

      <button class="ob-skip" @click="finish">Pular configuração e ir direto pro painel</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, http } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const stepLabels = ['Negócio', 'Equipe', 'Atendimento', 'Horário', 'Concluir']
const step = ref(0)
const saving = ref(false)
const error = ref('')
const showKey = ref(false)

function uid() { return Math.random().toString(36).slice(2) }
const PALETTE = ['#6366F1', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#0EA5E9']
function randomColor() { return PALETTE[Math.floor(Math.random() * PALETTE.length)] }
function gerarSenha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(10)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

const business = reactive({ name: auth.user?.tenantName || '', segment: '', description: '' })

const queues = reactive([{ localId: uid(), name: 'Atendimento Geral', color: '#6366F1' }])
const team = reactive([])
function toggleQueue(member, queueLocalId) {
  const idx = member.queueIds.indexOf(queueLocalId)
  if (idx === -1) member.queueIds.push(queueLocalId)
  else member.queueIds.splice(idx, 1)
}
const createdTeam = ref([])
const createdQueues = ref([])

const attendanceMode = ref(null)
const chatbot = reactive({
  welcomeMsg: 'Olá! 👋 Como posso te ajudar hoje?',
  options: [
    { texto: '1 - Falar com um vendedor', resposta: 'Perfeito! Já vou te encaminhar para um vendedor.', acao: 'transferir', queueLocalId: null },
    { texto: '2 - Encerrar', resposta: 'Tudo bem, qualquer coisa é só chamar. Até logo!', acao: 'encerrar', queueLocalId: null },
  ],
})
const ai = reactive({
  name: 'Ana',
  system_prompt: 'Você é uma atendente simpática, objetiva e consultiva. Fale em português, de forma natural e sem soar robótica.',
  main_prompt: '',
  openaiKey: '',
})

const hours = reactive({ enabled: false, start: '08:00', end: '18:00', off_message: 'Estamos fora do horário de atendimento. Retornaremos em breve!' })

function buildSchedule() {
  const day = { open: hours.enabled, start: hours.start, end: hours.end }
  return { 0: { ...day, open: false }, 1: day, 2: day, 3: day, 4: day, 5: day, 6: { ...day, open: false } }
}

async function saveTeamStep() {
  const validQueues = queues.filter((q) => q.name.trim())
  for (const q of validQueues) {
    const { queue } = await api.createQueue({ name: q.name.trim(), color: q.color })
    createdQueues.value.push({ localId: q.localId, id: queue.id, name: queue.name, color: queue.color })
  }

  const validMembers = team.filter((m) => m.name.trim() && m.email.trim())
  for (const m of validMembers) {
    const password = gerarSenha()
    const { operator } = await api.createOperator({ name: m.name.trim(), email: m.email.trim(), password, role: m.role })
    createdTeam.value.push({ id: operator.id, name: operator.name, email: operator.email, password, queueIds: m.queueIds })
  }

  for (const cq of createdQueues.value) {
    const operatorIds = createdTeam.value.filter((m) => m.queueIds.includes(cq.localId)).map((m) => m.id)
    // sempre manda name/color junto — um PATCH só com operator_ids vira um update
    // vazio pro Supabase (nenhuma coluna de "queues" no payload) e quebra com
    // "Cannot coerce the result to a single JSON object" (0 linhas no .single()).
    if (operatorIds.length) await api.updateQueue(cq.id, { name: cq.name, color: cq.color, operator_ids: operatorIds })
  }
}

async function saveAttendanceStep() {
  if (attendanceMode.value === 'chatbot') {
    if (!chatbot.welcomeMsg.trim()) throw new Error('Escreva a mensagem de boas-vindas.')
    const channel = await api.createChannel(business.name || 'Canal Principal')
    const flow = await api.createFlow({ name: 'Atendimento automático', channel_id: channel.id, trigger_keywords: [] })
    const options = chatbot.options.filter((o) => o.texto.trim())
    const nodes = [
      {
        id: 'n1', tipo: 'passo', mensagem: chatbot.welcomeMsg, saida: 'aguardar',
        respostas: options.map((o, i) => ({ texto: o.texto, destino: `n${i + 2}` })),
        padrao: '__transfer__',
      },
      ...options.map((o, i) => {
        const queue = createdQueues.value.find((q) => q.localId === o.queueLocalId)
        return {
          id: `n${i + 2}`, tipo: 'passo', mensagem: o.resposta,
          saida: o.acao === 'transferir' ? 'transferir' : 'encerrar',
          ...(o.acao === 'transferir' ? { msg_transferencia: 'Já te encaminho para um atendente.', ...(queue ? { queue_id: queue.id } : {}) } : {}),
        }
      }),
    ]
    await api.updateFlow(flow.id, { nodes, edges: [], status: 'active' })
    await api.toggleAI(false)
  } else if (attendanceMode.value === 'ia') {
    if (!ai.name.trim()) throw new Error('Dê um nome para a IA.')
    if (!ai.openaiKey.trim()) throw new Error('Cole sua chave da API OpenAI para continuar.')
    await api.saveAIConfig({ name: ai.name, system_prompt: ai.system_prompt, main_prompt: ai.main_prompt, openai_api_key: ai.openaiKey })
    await api.toggleAI(true)
  } else {
    throw new Error('Escolha Chatbot simples ou Inteligência Artificial.')
  }
}

async function next() {
  error.value = ''
  saving.value = true
  try {
    if (step.value === 0) {
      ai.main_prompt = [business.segment && `Segmento: ${business.segment}.`, business.description].filter(Boolean).join('\n')
    }
    if (step.value === 1) {
      await saveTeamStep()
    }
    if (step.value === 2) {
      await saveAttendanceStep()
    }
    if (step.value === 3) {
      await http.put('/business-hours', {
        enabled: hours.enabled,
        timezone: 'America/Sao_Paulo',
        off_message: hours.off_message,
        schedule: buildSchedule(),
      })
    }
    step.value++
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

function back() { error.value = ''; step.value-- }

async function finish() {
  saving.value = true
  error.value = ''
  try {
    await auth.completeOnboarding()
    router.push('/dashboard')
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.ob-bg {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background:
    radial-gradient(900px 500px at 85% -10%, var(--glow-1), transparent 60%),
    radial-gradient(700px 400px at -5% 110%, var(--glow-2), transparent 60%),
    var(--app-bg);
  padding: 32px 20px;
}
.ob-wrap { width: 620px; max-width: 100%; }

.ob-progress { display: flex; justify-content: space-between; margin-bottom: 24px; }
.ob-progress-item { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
.ob-progress-dot {
  width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #6B7C88;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
}
.ob-progress-item.active .ob-progress-dot { background: linear-gradient(135deg, #6366F1, #8B5CF6); color: white; border-color: transparent; }
.ob-progress-item.done .ob-progress-dot { background: rgba(16,185,129,0.25); color: #10B981; border-color: rgba(16,185,129,0.4); }
.ob-progress-label { font-size: 10.5px; color: #6B7C88; text-align: center; }
.ob-progress-item.active .ob-progress-label { color: #C7D2DA; font-weight: 600; }

.ob-card {
  background: rgba(13,17,23,0.85); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px; padding: 36px; backdrop-filter: blur(20px);
  max-height: 72vh; overflow-y: auto;
}
.ob-title { font-size: 20px; font-weight: 700; color: #F1F5F9; margin: 0 0 6px; }
.ob-sub { font-size: 13px; color: #6B7C88; margin: 0 0 24px; line-height: 1.5; }
.ob-subhead { font-size: 13px; font-weight: 700; color: #C7D2DA; margin-bottom: 12px; }

.ob-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.ob-field-wrap { display: flex; align-items: center; gap: 8px; }
.ob-field-wrap .ob-input { flex: 1; }
.ob-label { font-size: 12px; font-weight: 600; color: #9FB0BC; }
.ob-input, .ob-textarea, .ob-select {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 11px; padding: 12px 14px; font-size: 14px; color: #F1F5F9;
  outline: none; transition: border-color .15s; font-family: inherit; resize: vertical;
}
.ob-input:focus, .ob-textarea:focus, .ob-select:focus { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.04); }
.ob-input::placeholder, .ob-textarea::placeholder { color: #3A4A55; }
.ob-select { appearance: auto; }
.ob-input-flex { flex: 1; }
.ob-color { width: 38px; height: 38px; padding: 2px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); cursor: pointer; flex-shrink: 0; }

.ob-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.ob-icon-btn {
  width: 34px; height: 34px; flex-shrink: 0; border-radius: 9px; border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04); color: #9FB0BC; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.ob-icon-btn:hover { color: #F87171; border-color: rgba(239,68,68,0.3); }

.ob-add-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: 1px dashed rgba(255,255,255,0.15); border-radius: 10px;
  color: #A5B4FC; font-size: 12.5px; font-weight: 600; padding: 8px 14px; cursor: pointer;
}
.ob-add-btn:hover { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.06); }

.ob-member { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; margin-bottom: 10px; }
.ob-member-top { display: flex; gap: 8px; margin-bottom: 10px; }
.ob-member-queues { display: flex; flex-wrap: wrap; gap: 6px; }
.ob-chip {
  font-size: 11.5px; font-weight: 600; padding: 5px 11px; border-radius: 999px; cursor: pointer;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #9FB0BC;
}
.ob-chip.active { background: rgba(99,102,241,0.22); border-color: rgba(99,102,241,0.5); color: #C7D2FE; }

.ob-mode-select { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.ob-mode-card {
  text-align: left; padding: 18px; border-radius: 14px; cursor: pointer;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #9FB0BC;
}
.ob-mode-card.active { background: rgba(99,102,241,0.12); border-color: rgba(99,102,241,0.5); color: #F1F5F9; }
.ob-mode-title { font-size: 14px; font-weight: 700; margin: 10px 0 4px; color: #F1F5F9; }
.ob-mode-text { font-size: 12px; color: #9FB0BC; line-height: 1.5; }
.ob-mode-body { border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; }

.ob-option { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px; margin-bottom: 10px; }
.ob-option-row { display: flex; gap: 8px; margin-bottom: 8px; }

.ob-openai-box { margin-top: 20px; background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.2); border-radius: 14px; padding: 16px; }
.ob-openai-title { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; color: #F1F5F9; margin-bottom: 8px; }
.ob-steps-list { margin: 0 0 0 18px; padding: 0; font-size: 12.5px; color: #9FB0BC; line-height: 1.9; }
.ob-steps-list a { color: #A5B4FC; }

.ob-hours-toggle { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #C7D2DA; margin-bottom: 20px; }
.ob-switch { position: relative; display: inline-block; width: 38px; height: 22px; }
.ob-switch input { opacity: 0; width: 0; height: 0; }
.ob-switch-slider { position: absolute; inset: 0; background: rgba(255,255,255,0.12); border-radius: 999px; cursor: pointer; transition: .2s; }
.ob-switch-slider::before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px; background: white; border-radius: 50%; transition: .2s; }
.ob-switch input:checked + .ob-switch-slider { background: #6366F1; }
.ob-switch input:checked + .ob-switch-slider::before { transform: translateX(16px); }
.ob-hours-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.ob-review { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.ob-review-item { display: flex; align-items: center; gap: 10px; font-size: 13.5px; color: #C7D2DA; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 12px 14px; }
.ob-review-team { margin-bottom: 16px; }
.ob-credential { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; }
.ob-credential-name { font-size: 13px; font-weight: 600; color: #F1F5F9; }
.ob-credential-email { font-size: 12px; color: #6B7C88; }
.ob-credential-pass { font-size: 13px; color: #A5B4FC; background: rgba(99,102,241,0.12); padding: 4px 10px; border-radius: 7px; }
.ob-notice { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #34D399; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 10px; padding: 10px 14px; }

.ob-error {
  display: flex; align-items: center; gap: 8px; margin-top: 16px;
  background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
  color: #F87171; font-size: 13px; border-radius: 10px; padding: 10px 14px;
}

.ob-nav { display: flex; align-items: center; justify-content: space-between; margin-top: 28px; }
.ob-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 22px; border-radius: 11px; cursor: pointer; border: none;
  font-size: 13.5px; font-weight: 700; transition: all .2s;
}
.ob-btn-primary { color: white; background: linear-gradient(135deg, #6366F1, #8B5CF6); box-shadow: 0 4px 20px rgba(99,102,241,0.35); }
.ob-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
.ob-btn-ghost { color: #9FB0BC; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); }

.ob-skip { display: block; margin: 18px auto 0; background: none; border: none; cursor: pointer; font-size: 12px; color: #3A4A55; }
.ob-skip:hover { color: #6B7C88; }
</style>
