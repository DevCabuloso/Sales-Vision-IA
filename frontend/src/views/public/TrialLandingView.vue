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
  { q: 'A cobrança de R$ 497 é o teste grátis mesmo?', a: 'É o valor da mensalidade cheia, cobrado no ato — os primeiros 7 dias de uso ficam por nossa conta enquanto você testa a plataforma sem restrição de recursos.' },
  { q: 'Como funciona o pagamento?', a: 'Pelo checkout da InfinitePay, com Pix ou cartão de crédito (parcelamento disponível). É o mesmo valor da próxima cobrança mensal.' },
  { q: 'Posso cancelar depois?', a: 'Sim, a qualquer momento entrando em contato com o suporte.' },
  { q: 'Preciso saber programar para configurar?', a: 'Não. Depois do pagamento você passa por um onboarding guiado, passo a passo, para conectar o WhatsApp e configurar a IA.' },
]

async function submit() {
  error.value = ''
  if (!name.value || !companyName.value || !email.value || !password.value) {
    error.value = 'Preencha nome, empresa, e-mail e senha.'
    return
  }
  if (password.value.length < 8) {
    error.value = 'A senha deve ter pelo menos 8 caracteres.'
    return
  }
  loading.value = true
  try {
    const { checkoutUrl } = await api.trialSignup({
      name: name.value,
      companyName: companyName.value,
      email: email.value,
      phone: phone.value || undefined,
      password: password.value,
    })
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
  .tl-grid, .tl-steps { grid-template-columns: 1fr; }
  .tl-offer-value { font-size: 44px; }
}
</style>
