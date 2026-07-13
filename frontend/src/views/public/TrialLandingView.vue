<template>
  <div class="tl-bg">

    <!-- Partículas -->
    <div class="particles" aria-hidden="true">
      <div v-for="i in 18" :key="i" class="particle" :style="particleStyle(i)" />
    </div>

    <div class="tl-content">

      <!-- ══ HERO ══ -->
      <header class="tl-hero">
        <div class="tl-logo">
          <div class="tl-logo-icon"><v-icon icon="mdi-robot-happy-outline" color="white" size="24" /></div>
          <span class="tl-logo-name">SDR IA</span>
        </div>

        <h1 class="tl-headline">
          Coloque um vendedor com IA no seu WhatsApp<br class="tl-br" />
          <span class="tl-headline-accent">e teste 7 dias sem compromisso</span>
        </h1>
        <p class="tl-subheadline">
          Atendimento automático, qualificação de leads e agendamento de reuniões — funcionando no seu número
          em minutos. Pague apenas a mensalidade de hoje e use a plataforma por 7 dias completos.
        </p>

        <button class="tl-cta" @click="openForm">
          <v-icon icon="mdi-rocket-launch-outline" size="18" />
          Quero testar por 7 dias
        </button>
        <p class="tl-cta-note">
          <v-icon icon="mdi-shield-check-outline" size="14" />
          Cobrança única de R$ {{ priceLabel }} hoje — sem taxas escondidas
        </p>
      </header>

      <!-- ══ MISSÃO ══ -->
      <section class="tl-section tl-mission">
        <h2 class="tl-section-title">O que a SDR IA faz por você</h2>
        <p class="tl-mission-lede">
          A SDR IA é o vendedor virtual do seu WhatsApp: atende cada contato, descobre o que ele precisa,
          organiza tudo em um CRM visual e marca a reunião — sem você precisar digitar uma mensagem.
        </p>
        <div class="tl-mission-grid">
          <div v-for="m in missionPillars" :key="m.title" class="tl-mission-card">
            <div class="tl-mission-icon"><v-icon :icon="m.icon" size="20" /></div>
            <div class="tl-mission-title">{{ m.title }}</div>
            <div class="tl-mission-text">{{ m.text }}</div>
          </div>
        </div>
      </section>

      <!-- ══ BENEFÍCIOS ══ -->
      <section class="tl-section">
        <h2 class="tl-section-title">Tudo que você precisa pra vender mais no WhatsApp</h2>
        <div class="tl-grid">
          <div v-for="f in features" :key="f.icon" class="tl-card">
            <div class="tl-card-icon"><v-icon :icon="f.icon" color="white" size="20" /></div>
            <div class="tl-card-title">{{ f.title }}</div>
            <div class="tl-card-text">{{ f.text }}</div>
          </div>
        </div>
      </section>

      <!-- ══ NOSSO PROCESSO ══ -->
      <section class="tl-section">
        <h2 class="tl-section-title">Nosso processo</h2>
        <p class="tour-sub">Do primeiro "oi" no WhatsApp até a reunião marcada — tudo automático.</p>
        <div class="tl-process-grid">
          <div v-for="(p, i) in process" :key="p.title" class="tl-process-card">
            <div class="tl-process-num">{{ i + 1 }}</div>
            <div class="tl-process-title">{{ p.title }}</div>
            <ul class="tl-process-list">
              <li v-for="item in p.items" :key="item">{{ item }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- ══ VEJA POR DENTRO ══ -->
      <section class="tl-section">
        <h2 class="tl-section-title">Veja por dentro</h2>
        <p class="tour-sub">Assim fica sua operação depois de conectar o WhatsApp. (dados de demonstração)</p>

        <div class="tour-tabs">
          <button
            v-for="t in tourTabs" :key="t.key"
            type="button"
            class="tour-tab" :class="{ active: activeTour === t.key }"
            @click="activeTour = t.key"
          >
            <v-icon :icon="t.icon" size="15" />{{ t.label }}
          </button>
        </div>

        <div class="tour-frame">
          <div class="tour-bar">
            <span class="tour-dot" style="background:#EF4444"></span>
            <span class="tour-dot" style="background:#F59E0B"></span>
            <span class="tour-dot" style="background:#10B981"></span>
            <span class="tour-url">app.sdria.com.br</span>
          </div>

          <div class="tour-scroll">
            <!-- Atendimento -->
            <div v-if="activeTour === 'chat'" class="tour-chat">
              <div class="tour-chat-side">
                <div v-for="c in tourConversations" :key="c.name" class="tour-conv" :class="{ active: c.active }">
                  <div class="tour-avatar">{{ c.initials }}</div>
                  <div class="tour-conv-body">
                    <div class="tour-conv-top"><span>{{ c.name }}</span><span class="tour-conv-time">{{ c.time }}</span></div>
                    <div class="tour-conv-msg">{{ c.lastMessage }}</div>
                  </div>
                </div>
              </div>
              <div class="tour-chat-main">
                <div class="tour-chat-head">
                  <div class="tour-avatar">RS</div>
                  <div>
                    <div class="tour-chat-name">Rafael Souza</div>
                    <div class="tour-chat-sub">Reunião Agendada · WhatsApp</div>
                  </div>
                </div>
                <div class="tour-msgs">
                  <div v-for="(m, i) in tourMessages" :key="i" class="tour-msg-row" :class="{ out: m.role === 'ai' }">
                    <div class="tour-bubble" :class="m.role">{{ m.text }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Kanban -->
            <div v-else-if="activeTour === 'kanban'" class="tour-kanban">
              <div v-for="col in tourKanban" :key="col.stage" class="tour-col">
                <div class="tour-col-head" :style="`border-top:3px solid ${col.color}`">
                  <span class="tour-dot-sm" :style="`background:${col.color}`"></span>
                  <span class="tour-col-name">{{ col.stage }}</span>
                  <span class="tour-col-count" :style="`background:${col.color}22;color:${col.color}`">{{ col.leads.length }}</span>
                </div>
                <div class="tour-col-cards">
                  <div v-for="l in col.leads" :key="l.name" class="tour-kcard">
                    <div class="tour-kcard-top">
                      <span class="tour-avatar tour-avatar-sm">{{ l.initials }}</span>
                      <span v-if="l.score" class="tour-score" :style="`background:${scoreColor(l.score)}22;color:${scoreColor(l.score)}`">{{ l.score }}pts</span>
                    </div>
                    <div class="tour-kcard-name">{{ l.name }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Leads -->
            <table v-else class="tour-table">
              <thead>
                <tr><th>Nome</th><th>Telefone</th><th>Etapa</th><th>Score</th></tr>
              </thead>
              <tbody>
                <tr v-for="l in tourLeads" :key="l.name">
                  <td>{{ l.name }}</td>
                  <td class="tour-table-muted">{{ l.phone }}</td>
                  <td><span class="tour-stage-chip" :style="`background:${l.color}22;color:${l.color}`">{{ l.stage }}</span></td>
                  <td><span class="tour-score" :style="`background:${scoreColor(l.score)}22;color:${scoreColor(l.score)}`">{{ l.score }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ══ COMO FUNCIONA ══ -->
      <section class="tl-section">
        <h2 class="tl-section-title">Como funciona</h2>
        <div class="tl-steps">
          <div v-for="(s, i) in steps" :key="s.title" class="tl-step">
            <div class="tl-step-num">{{ i + 1 }}</div>
            <div class="tl-step-title">{{ s.title }}</div>
            <div class="tl-step-text">{{ s.text }}</div>
          </div>
        </div>
      </section>

      <!-- ══ OFERTA ══ -->
      <section class="tl-offer">
        <div class="tl-offer-badge">OFERTA DE ENTRADA</div>
        <div class="tl-offer-price">
          <span class="tl-offer-currency">R$</span>
          <span class="tl-offer-value">{{ priceLabel }}</span>
        </div>
        <p class="tl-offer-desc">
          É o valor normal da mensalidade — só que nos próximos <strong>7 dias</strong> você usa a plataforma
          inteira, sem limitação de recursos, pra ver o resultado na prática. Depois disso, a cobrança segue
          mensal normalmente; cancele quando quiser.
        </p>
        <div class="tl-offer-checklist">
          <div v-for="item in offerChecklist" :key="item" class="tl-offer-check-item">
            <v-icon icon="mdi-check-circle" size="16" />
            <span>{{ item }}</span>
          </div>
        </div>
        <button class="tl-cta tl-cta-light" @click="openForm">
          <v-icon icon="mdi-rocket-launch-outline" size="18" />
          Começar agora
        </button>
      </section>

      <!-- ══ FAQ ══ -->
      <section class="tl-section">
        <h2 class="tl-section-title">Perguntas frequentes</h2>
        <v-expansion-panels variant="accordion" class="tl-faq">
          <v-expansion-panel v-for="f in faq" :key="f.q" :title="f.q" :text="f.a" />
        </v-expansion-panels>
      </section>

      <footer class="tl-footer">
        <button class="tl-cta" @click="openForm">
          <v-icon icon="mdi-rocket-launch-outline" size="18" />
          Quero testar por 7 dias
        </button>
      </footer>
    </div>

    <!-- ══ MODAL — FORM DE CADASTRO ══ -->
    <v-dialog v-model="formOpen" max-width="440" scrollable>
      <div class="tl-form-card">
        <div class="tl-form-head">
          <h3 class="tl-form-title">Vamos começar</h3>
          <p class="tl-form-sub">Preencha seus dados. No próximo passo você paga com Pix ou cartão pela InfinitePay.</p>
        </div>

        <div v-if="error" class="tl-form-error">
          <v-icon icon="mdi-alert-circle-outline" size="15" />
          {{ error }}
        </div>

        <div class="tl-fields">
          <div class="tl-field">
            <label class="tl-field-label">Seu nome</label>
            <input v-model="name" type="text" class="tl-field-input" placeholder="Seu nome completo" />
          </div>
          <div class="tl-field">
            <label class="tl-field-label">Empresa</label>
            <input v-model="companyName" type="text" class="tl-field-input" placeholder="Nome da sua empresa" />
          </div>
          <div class="tl-field">
            <label class="tl-field-label">E-mail</label>
            <input v-model="email" type="email" class="tl-field-input" placeholder="seu@email.com" />
          </div>
          <div class="tl-field">
            <label class="tl-field-label">WhatsApp</label>
            <input v-model="phone" type="tel" class="tl-field-input" placeholder="(11) 99999-9999" />
          </div>
          <div class="tl-field">
            <label class="tl-field-label">Crie uma senha</label>
            <input v-model="password" type="password" class="tl-field-input" placeholder="••••••••" />
          </div>
        </div>

        <button class="tl-submit-btn" :disabled="loading" @click="submit">
          <v-progress-circular v-if="loading" size="16" width="2" indeterminate color="white" />
          <span v-else>Ir para o pagamento</span>
        </button>
        <p class="tl-form-legal">Ao continuar você será redirecionado para o checkout seguro da InfinitePay.</p>
      </div>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '@/services/api'
import { trialSignupSchema } from '@/schemas/billing'
import { validateForm } from '@/composables/useZodValidation'

// mantido em sincronia com backend/src/config/index.js (config.billing.trialPlanPriceCents)
const priceLabel = '397'

const formOpen = ref(false)
const name = ref('')
const companyName = ref('')
const email = ref('')
const phone = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

function openForm() { error.value = ''; formOpen.value = true }

function particleStyle(i) {
  const size = 4 + (i % 5) * 3
  return {
    width: `${size}px`, height: `${size}px`,
    left: `${(i * 37 + 11) % 100}%`, top: `${(i * 53 + 7) % 100}%`,
    animationDelay: `${(i * 0.4) % 4}s`, animationDuration: `${6 + (i % 4) * 2}s`,
  }
}

const missionPillars = [
  { icon: 'mdi-clock-fast',            title: 'Nunca perde um lead',              text: 'Todo contato no WhatsApp é respondido em segundos, 24 horas por dia — mesmo fora do expediente.' },
  { icon: 'mdi-filter-check-outline',  title: 'Qualifica antes de te interromper', text: 'A IA descobre orçamento, intenção e urgência na conversa e só te chama quando o lead está maduro.' },
  { icon: 'mdi-calendar-check-outline', title: 'Fecha mais rápido',                 text: 'Reuniões marcadas direto na sua agenda pela própria IA, sem ida e volta de mensagem.' },
]

const tourTabs = [
  { key: 'chat',   label: 'Atendimento', icon: 'mdi-forum-outline' },
  { key: 'kanban', label: 'Kanban',       icon: 'mdi-view-column-outline' },
  { key: 'leads',  label: 'Leads',        icon: 'mdi-account-group-outline' },
]
const activeTour = ref('chat')

function scoreColor(score) { return score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444' }

const tourConversations = [
  { initials: 'RS', name: 'Rafael Souza',    time: '9min',  lastMessage: 'Sábado de manhã é ótimo',           active: true },
  { initials: 'FE', name: 'Fernando Alves',  time: '55min', lastMessage: 'Qual o valor do condomínio?',       active: false },
  { initials: 'CA', name: 'Camila Rocha',    time: '3h',    lastMessage: 'Obrigada! Até sábado então',        active: false },
  { initials: 'PA', name: 'Patrícia Gomes',  time: '3d',    lastMessage: 'Vou pensar e retorno essa semana',  active: false },
]

const tourMessages = [
  { role: 'lead', text: 'Oi, vi o anúncio do apartamento de 2 quartos no Jardim América. Ainda está disponível?' },
  { role: 'ai',   text: 'Oi Rafael! Sim, ainda está disponível — 2 quartos, 68m², sacada e 1 vaga. Você já tem uma faixa de valor ou data pra visitar?' },
  { role: 'lead', text: 'Pensando em algo até 350 mil, e queria visitar ainda essa semana' },
  { role: 'ai',   text: 'Esse imóvel está em R$ 335.000. Tenho horário quinta às 14h ou sábado de manhã — qual funciona melhor?' },
  { role: 'lead', text: 'Sábado de manhã é ótimo' },
  { role: 'ai',   text: 'Combinado! Visita agendada pra sábado, 10h. Te aviso um dia antes.' },
]

const tourKanban = [
  { stage: 'Novo Lead',        color: '#6366F1', leads: [{ initials: 'DI', name: 'Diego Fontes',   score: 62 }] },
  { stage: 'Em Qualificação',  color: '#38BDF8', leads: [{ initials: 'FE', name: 'Fernando Alves',  score: 55 }, { initials: 'CA', name: 'Camila Rocha', score: 48 }] },
  { stage: 'Qualificado',      color: '#10B981', leads: [{ initials: 'JU', name: 'Juliana Martins', score: 78 }, { initials: 'BR', name: 'Bruno Lima',   score: 71 }] },
  { stage: 'Reunião Agendada', color: '#F59E0B', leads: [{ initials: 'RA', name: 'Rafael Souza',    score: 84 }, { initials: 'PA', name: 'Patrícia Gomes', score: 66 }] },
  { stage: 'Vendido',          color: '#A855F7', leads: [{ initials: 'RE', name: 'Renata Cunha',    score: 92 }] },
]

const tourLeads = [
  { name: 'Rafael Souza',    phone: '5511 90000-0001', stage: 'Reunião Agendada', color: '#F59E0B', score: 84 },
  { name: 'Juliana Martins', phone: '5511 90000-0002', stage: 'Qualificado',      color: '#10B981', score: 78 },
  { name: 'Fernando Alves',  phone: '5511 90000-0003', stage: 'Em Qualificação',  color: '#38BDF8', score: 55 },
  { name: 'Renata Cunha',    phone: '5511 90000-0009', stage: 'Vendido',          color: '#A855F7', score: 92 },
  { name: 'Marcos Teixeira', phone: '5511 90000-0008', stage: 'Perdido',         color: '#EF4444', score: 30 },
]

const process = [
  {
    title: 'Captação',
    items: [
      'Todo contato que chega no seu WhatsApp — de anúncio, indicação ou perfil — é atendido no mesmo instante, 24 horas por dia.',
      'Sem fila de espera: nenhum lead fica esfriando enquanto ninguém responde.',
    ],
  },
  {
    title: 'Qualificação pela IA',
    items: [
      'A IA conversa naturalmente e descobre orçamento, intenção e urgência — sem formulário, sem interrogatório.',
      'Cada lead recebe um score automático de 0 a 100, pra você saber quem está pronto pra comprar.',
    ],
  },
  {
    title: 'Agendamento',
    items: [
      'Quando o lead está maduro, a própria IA propõe horários e marca a reunião direto no Google Calendar.',
      'Lembretes automáticos ajudam a reduzir faltas, sem esforço nenhum da sua parte.',
    ],
  },
  {
    title: 'Acompanhamento',
    items: [
      'Cada lead entra automaticamente no CRM Kanban, organizado por estágio do funil.',
      'Sua equipe assume a conversa quando quiser, com um clique, sem perder nada do que a IA já conversou.',
      'Acompanhamentos automáticos reengajam quem ainda não decidiu.',
    ],
  },
]

const offerChecklist = [
  'Agente com IA respondendo 24/7 no seu WhatsApp',
  'Qualificação automática com score de cada lead',
  'CRM Kanban completo',
  'Agendamento direto no Google Calendar',
  'Central de atendimento com histórico e assunção humana',
  'Acompanhamentos automáticos (follow-up)',
  'Disparo em massa e templates de mensagem',
  'Base de conhecimento com seu catálogo',
]

const features = [
  { icon: 'mdi-robot-outline',       title: 'Agente com IA',        text: 'Responde, qualifica e negocia com seus leads 24h por dia, no seu tom de voz.' },
  { icon: 'mdi-whatsapp',            title: 'WhatsApp integrado',   text: 'Conecte seu número via QR Code em minutos — sem depender de aprovação da Meta.' },
  { icon: 'mdi-calendar-check',      title: 'Agendamento automático', text: 'A IA marca reuniões direto na sua agenda quando o lead está pronto.' },
  { icon: 'mdi-chart-line',          title: 'CRM com Kanban',       text: 'Acompanhe cada conversa e o funil de vendas em um painel visual.' },
  { icon: 'mdi-forum-outline',       title: 'Central de atendimento', text: 'Sua equipe assume a conversa quando precisar, sem perder o histórico.' },
  { icon: 'mdi-file-document-outline', title: 'Base de conhecimento', text: 'Envie seu catálogo e a IA responde com base nos seus produtos reais.' },
]

const steps = [
  { title: 'Cadastre-se e pague',   text: 'Preencha seus dados e finalize o pagamento pela InfinitePay (Pix ou cartão).' },
  { title: 'Conecte seu WhatsApp',  text: 'Escaneie um QR Code — sem burocracia, sem esperar aprovação.' },
  { title: 'Configure sua IA',      text: 'Um assistente guiado te ajuda a configurar o agente com as informações do seu negócio.' },
]

const faq = [
  { q: 'A cobrança de R$ 397 é o teste grátis mesmo?', a: 'É o valor da mensalidade cheia, cobrado no ato — os primeiros 7 dias de uso ficam por nossa conta enquanto você testa a plataforma sem restrição de recursos.' },
  { q: 'Como funciona o pagamento?', a: 'Pelo checkout da InfinitePay, com Pix ou cartão de crédito (parcelamento disponível). É o mesmo valor da próxima cobrança mensal.' },
  { q: 'Posso cancelar depois?', a: 'Sim, a qualquer momento entrando em contato com o suporte.' },
  { q: 'Preciso saber programar para configurar?', a: 'Não. Depois do pagamento você passa por um onboarding guiado, passo a passo, para conectar o WhatsApp e configurar a IA.' },
]

async function submit() {
  error.value = ''
  const check = validateForm(trialSignupSchema, {
    name: name.value,
    companyName: companyName.value,
    email: email.value,
    phone: phone.value,
    password: password.value,
  })
  if (!check.success) { error.value = check.error; return }
  loading.value = true
  try {
    const { checkoutUrl } = await api.trialSignup(check.data)
    window.location.href = checkoutUrl
  } catch (e) {
    error.value = e.message
    loading.value = false
  }
}
</script>

<style scoped>
.tl-bg {
  min-height: 100vh;
  background:
    radial-gradient(900px 500px at 85% -10%, var(--glow-1), transparent 60%),
    radial-gradient(700px 400px at -5% 30%, var(--glow-2), transparent 60%),
    var(--app-bg);
  position: relative; overflow: hidden;
}

.particle {
  position: absolute; border-radius: 50%;
  background: rgba(99,102,241,0.2);
  animation: float linear infinite;
  pointer-events: none;
}
@keyframes float {
  0%,100% { transform: translateY(0) scale(1); opacity: .3 }
  50%      { transform: translateY(-20px) scale(1.1); opacity: .7 }
}

.tl-content { position: relative; z-index: 1; max-width: 980px; margin: 0 auto; padding: 56px 24px 80px; }

/* ── HERO ── */
.tl-hero { text-align: center; padding: 24px 0 64px; }
.tl-logo { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 40px; }
.tl-logo-icon {
  width: 40px; height: 40px; border-radius: 12px;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 24px rgba(99,102,241,0.4);
}
.tl-logo-name { font-size: 18px; font-weight: 800; color: #F1F5F9; letter-spacing: -0.3px; }

.tl-headline { font-size: 40px; font-weight: 800; color: #F1F5F9; letter-spacing: -0.8px; line-height: 1.25; margin: 0 0 20px; }
.tl-headline-accent {
  background: linear-gradient(135deg, #A5B4FC, #C4B5FD);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.tl-subheadline { font-size: 16px; color: #9FB0BC; max-width: 640px; margin: 0 auto 32px; line-height: 1.6; }

.tl-cta {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 15px 28px; border: none; border-radius: 14px; cursor: pointer;
  font-size: 15px; font-weight: 700; color: white;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  box-shadow: 0 8px 28px rgba(99,102,241,0.4);
  transition: all .2s;
}
.tl-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 36px rgba(99,102,241,0.5); }
.tl-cta-light { background: rgba(255,255,255,0.95); color: #4338CA; box-shadow: 0 8px 28px rgba(0,0,0,0.25); }
.tl-cta-light:hover { background: white; }

.tl-cta-note { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12.5px; color: #6B7C88; margin: 16px 0 0; }

/* ── SEÇÕES ── */
.tl-section { padding: 40px 0; }
.tl-section-title { font-size: 24px; font-weight: 800; color: #F1F5F9; text-align: center; margin: 0 0 32px; letter-spacing: -0.4px; }

.tl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.tl-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px; padding: 24px; backdrop-filter: blur(10px);
}
.tl-card-icon {
  width: 40px; height: 40px; border-radius: 11px; margin-bottom: 14px;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  display: flex; align-items: center; justify-content: center;
}
.tl-card-title { font-size: 15px; font-weight: 700; color: #F1F5F9; margin-bottom: 6px; }
.tl-card-text { font-size: 13px; color: #9FB0BC; line-height: 1.55; }

.tl-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.tl-step { text-align: center; }
.tl-step-num {
  width: 36px; height: 36px; border-radius: 50%; margin: 0 auto 14px;
  background: rgba(99,102,241,0.18); border: 1px solid rgba(99,102,241,0.35);
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 800; color: #A5B4FC;
}
.tl-step-title { font-size: 14px; font-weight: 700; color: #F1F5F9; margin-bottom: 6px; }
.tl-step-text { font-size: 13px; color: #9FB0BC; line-height: 1.55; max-width: 260px; margin: 0 auto; }

/* ── MISSÃO ── */
.tl-mission-lede { font-size: 15px; color: #9FB0BC; text-align: center; max-width: 620px; margin: -12px auto 32px; line-height: 1.65; }
.tl-mission-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.tl-mission-card { text-align: center; padding: 0 8px; }
.tl-mission-icon {
  width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 14px;
  background: rgba(99,102,241,0.14); border: 1px solid rgba(99,102,241,0.35); color: #A5B4FC;
  display: flex; align-items: center; justify-content: center;
}
.tl-mission-title { font-size: 14.5px; font-weight: 700; color: #F1F5F9; margin-bottom: 6px; }
.tl-mission-text { font-size: 13px; color: #9FB0BC; line-height: 1.6; }

/* ── PROCESSO ── */
.tl-process-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.tl-process-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px; padding: 22px 24px; position: relative;
}
.tl-process-num {
  width: 30px; height: 30px; border-radius: 50%; margin-bottom: 12px;
  background: rgba(99,102,241,0.18); border: 1px solid rgba(99,102,241,0.35);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 800; color: #A5B4FC;
}
.tl-process-title { font-size: 15px; font-weight: 700; color: #F1F5F9; margin-bottom: 10px; }
.tl-process-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.tl-process-list li { font-size: 13px; color: #9FB0BC; line-height: 1.55; }

/* ── TOUR (veja por dentro) ── */
.tour-sub { font-size: 13.5px; color: #6B7C88; text-align: center; margin: -20px 0 24px; }
.tour-tabs { display: flex; justify-content: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.tour-tab {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12.5px; font-weight: 700; color: #9FB0BC;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 8px 14px; cursor: pointer; transition: all .15s;
}
.tour-tab:hover { color: #F1F5F9; border-color: rgba(255,255,255,0.16); }
.tour-tab.active { color: #C7D2FE; background: rgba(99,102,241,0.16); border-color: rgba(99,102,241,0.4); }

.tour-frame { border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: #0c121d; box-shadow: 0 24px 60px rgba(0,0,0,0.4); }
.tour-bar { display: flex; align-items: center; gap: 7px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.07); }
.tour-dot { width: 8px; height: 8px; border-radius: 50%; }
.tour-url { margin-left: 8px; font-size: 10.5px; color: #3A4A55; font-family: ui-monospace, Consolas, monospace; }
.tour-scroll { overflow-x: auto; }

.tour-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; font-size: 11px; font-weight: 700; color: #C7D2FE;
  background: linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.35));
  display: flex; align-items: center; justify-content: center;
}
.tour-avatar-sm { width: 22px; height: 22px; font-size: 9.5px; }

/* chat */
.tour-chat { display: flex; min-width: 640px; height: 380px; }
.tour-chat-side { width: 220px; flex-shrink: 0; border-right: 1px solid rgba(255,255,255,0.07); overflow-y: auto; }
.tour-conv { display: flex; gap: 9px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.07); }
.tour-conv.active { background: rgba(255,255,255,0.035); }
.tour-conv-body { min-width: 0; flex: 1; }
.tour-conv-top { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; font-weight: 600; color: #F1F5F9; }
.tour-conv-time { font-size: 10px; color: #3A4A55; font-weight: 400; flex-shrink: 0; }
.tour-conv-msg { font-size: 11px; color: #6B7C88; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.tour-chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.tour-chat-head { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-bottom: 1px solid rgba(255,255,255,0.07); }
.tour-chat-name { font-size: 13px; font-weight: 700; color: #F1F5F9; }
.tour-chat-sub { font-size: 10.5px; color: #6B7C88; }
.tour-msgs { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 9px; overflow-y: auto; }
.tour-msg-row { display: flex; }
.tour-msg-row.out { justify-content: flex-end; }
.tour-bubble { max-width: 68%; padding: 8px 12px; font-size: 12.5px; line-height: 1.5; color: #F1F5F9; }
.tour-bubble.lead { background: rgba(255,255,255,0.08); border-radius: 4px 14px 14px 14px; }
.tour-bubble.ai { background: rgba(99,102,241,0.22); border-radius: 14px 4px 14px 14px; }

/* kanban */
.tour-kanban { display: flex; gap: 10px; padding: 18px; min-width: 900px; }
.tour-col { width: 168px; flex-shrink: 0; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; }
.tour-col-head { display: flex; align-items: center; gap: 6px; padding: 10px; border-radius: 14px 14px 0 0; }
.tour-dot-sm { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.tour-col-name { font-size: 10.5px; font-weight: 700; color: #F1F5F9; line-height: 1.2; }
.tour-col-count { margin-left: auto; font-size: 10px; font-weight: 700; border-radius: 999px; padding: 1px 6px; flex-shrink: 0; }
.tour-col-cards { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.tour-kcard { background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 9px; }
.tour-kcard-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.tour-kcard-name { font-size: 11px; font-weight: 600; color: #F1F5F9; }
.tour-score { font-size: 9.5px; font-weight: 700; border-radius: 999px; padding: 2px 6px; }

/* leads table */
.tour-table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 12.5px; }
.tour-table th { text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: .4px; color: #6B7C88; padding: 14px 20px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.tour-table td { padding: 11px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); color: #F1F5F9; }
.tour-table-muted { color: #6B7C88; }
.tour-stage-chip { font-size: 10.5px; font-weight: 700; border-radius: 999px; padding: 3px 10px; }

/* ── OFERTA ── */
.tl-offer {
  text-align: center; padding: 48px 32px; margin: 16px 0;
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(99,102,241,0.18), rgba(139,92,246,0.1));
  border: 1px solid rgba(255,255,255,0.1);
}
.tl-offer-badge {
  display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: 1px;
  color: #A5B4FC; background: rgba(99,102,241,0.2); border-radius: 999px;
  padding: 5px 14px; margin-bottom: 16px;
}
.tl-offer-price { display: flex; align-items: flex-start; justify-content: center; gap: 4px; margin-bottom: 16px; }
.tl-offer-currency { font-size: 22px; font-weight: 700; color: #F1F5F9; margin-top: 8px; }
.tl-offer-value { font-size: 56px; font-weight: 800; color: #F1F5F9; letter-spacing: -1.5px; }
.tl-offer-desc { font-size: 14px; color: #C7D2DA; max-width: 480px; margin: 0 auto 28px; line-height: 1.6; }

.tl-offer-checklist {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 20px;
  max-width: 560px; margin: 0 auto 28px; text-align: left;
}
.tl-offer-check-item { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #E5EAF0; }
.tl-offer-check-item .v-icon { color: #6EE7B7; margin-top: 1px; flex-shrink: 0; }

/* ── FAQ ── */
.tl-faq { background: transparent; }
.tl-faq :deep(.v-expansion-panel) {
  background: rgba(255,255,255,0.04) !important; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px !important; margin-bottom: 10px; overflow: hidden;
}
.tl-faq :deep(.v-expansion-panel-title) { color: #F1F5F9; font-size: 14px; font-weight: 600; }
.tl-faq :deep(.v-expansion-panel-text__wrapper) { color: #9FB0BC; font-size: 13.5px; line-height: 1.6; }

.tl-footer { text-align: center; padding: 32px 0 0; }

/* ── MODAL FORM ── */
.tl-form-card {
  background: rgba(13,17,23,0.97); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px; padding: 32px; backdrop-filter: blur(20px);
}
.tl-form-head { margin-bottom: 20px; }
.tl-form-title { font-size: 19px; font-weight: 700; color: #F1F5F9; margin: 0 0 6px; }
.tl-form-sub { font-size: 13px; color: #6B7C88; margin: 0; line-height: 1.5; }

.tl-form-error {
  display: flex; align-items: center; gap: 8px;
  background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
  color: #F87171; font-size: 13px; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;
}

.tl-fields { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
.tl-field { display: flex; flex-direction: column; gap: 6px; }
.tl-field-label { font-size: 12px; font-weight: 600; color: #9FB0BC; }
.tl-field-input {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 11px; padding: 12px 14px; font-size: 14px; color: #F1F5F9;
  outline: none; transition: border-color .15s; font-family: inherit;
}
.tl-field-input:focus { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.04); }
.tl-field-input::placeholder { color: #3A4A55; }

.tl-submit-btn {
  width: 100%; padding: 14px;
  border: none; border-radius: 12px; cursor: pointer;
  font-size: 14px; font-weight: 700; color: white;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  box-shadow: 0 4px 20px rgba(99,102,241,0.35);
  transition: all .2s; display: flex; align-items: center; justify-content: center;
}
.tl-submit-btn:disabled { opacity: .6; cursor: not-allowed; }
.tl-form-legal { font-size: 11px; color: #3A4A55; text-align: center; margin: 12px 0 0; line-height: 1.5; }

/* ── MOBILE ── */
@media (max-width: 720px) {
  .tl-headline { font-size: 28px; }
  .tl-grid, .tl-steps, .tl-mission-grid, .tl-process-grid, .tl-offer-checklist { grid-template-columns: 1fr; }
  .tl-offer-value { font-size: 44px; }
}
</style>
