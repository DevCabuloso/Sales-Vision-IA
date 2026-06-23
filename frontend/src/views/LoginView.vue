<template>
  <div class="login-bg">

    <!-- Partículas (mantidas) -->
    <div class="particles" aria-hidden="true">
      <div v-for="i in 18" :key="i" class="particle" :style="particleStyle(i)" />
    </div>

    <!-- Card -->
    <div class="login-card">

      <!-- ══ LADO ESQUERDO — BRANDING ══ -->
      <div class="brand-side">
        <div class="brand-logo">
          <v-icon icon="mdi-robot-happy-outline" color="white" size="32" />
        </div>
        <h2 class="brand-name">SDR IA</h2>
        <p class="brand-desc">Plataforma inteligente de vendas com IA conversacional integrada.</p>

        <div class="feature-list">
          <div v-for="f in features" :key="f.icon" class="feature-item">
            <div class="feature-icon">
              <v-icon :icon="f.icon" color="white" size="15" />
            </div>
            <span class="feature-text">{{ f.text }}</span>
          </div>
        </div>

        <div class="brand-glow" />
      </div>

      <!-- ══ LADO DIREITO — FORM ══ -->
      <div class="form-side">

        <!-- Tipo de acesso -->
        <div class="access-tabs">
          <button
            v-for="t in accessTypes" :key="t.value"
            class="access-tab"
            :class="{ active: accessType === t.value }"
            @click="accessType = t.value; tab = 'login'"
          >
            <v-icon :icon="t.icon" size="14" />
            {{ t.label }}
          </button>
        </div>

        <!-- Título -->
        <div class="form-heading">
          <h3 class="form-title">{{ tab === 'login' ? 'Bem-vindo de volta' : 'Criar conta' }}</h3>
          <p class="form-sub">{{ tab === 'login' ? 'Entre na sua conta para continuar' : 'Preencha os dados abaixo' }}</p>
        </div>

        <!-- Login / Registro toggle -->
        <div v-if="accessType === 'user'" class="form-toggle">
          <button class="toggle-btn" :class="{ active: tab === 'login' }" @click="tab = 'login'">Entrar</button>
          <button class="toggle-btn" :class="{ active: tab === 'register' }" @click="tab = 'register'">Registrar</button>
        </div>

        <!-- Conta suspensa -->
        <div v-if="suspended" class="form-suspended">
          <v-icon icon="mdi-lock-outline" size="18" />
          <div>
            <div class="suspended-title">Conta suspensa</div>
            <div class="suspended-body">O acesso desta conta foi bloqueado pelo administrador. Entre em contato com o suporte para reativação.</div>
          </div>
        </div>

        <!-- Erro genérico -->
        <div v-else-if="error" class="form-error">
          <v-icon icon="mdi-alert-circle-outline" size="15" />
          {{ error }}
        </div>

        <!-- ─ FORM LOGIN ─ -->
        <div v-if="tab === 'login'" class="fields">
          <div class="field">
            <label class="field-label">E-mail</label>
            <div class="field-wrap">
              <v-icon icon="mdi-email-outline" size="16" class="field-icon" />
              <input v-model="email" type="email" class="field-input" placeholder="seu@email.com" @keydown.enter="submit" />
            </div>
          </div>
          <div class="field">
            <label class="field-label">Senha</label>
            <div class="field-wrap">
              <v-icon icon="mdi-lock-outline" size="16" class="field-icon" />
              <input v-model="password" :type="showPw ? 'text' : 'password'" class="field-input" placeholder="••••••••" @keydown.enter="submit" />
              <button class="field-eye" @click="showPw = !showPw">
                <v-icon :icon="showPw ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" size="16" />
              </button>
            </div>
          </div>
          <button class="submit-btn" :disabled="loading" @click="submit">
            <v-progress-circular v-if="loading" size="16" width="2" indeterminate color="white" />
            <span v-else>Entrar na plataforma</span>
          </button>
        </div>

        <!-- ─ FORM REGISTRO ─ -->
        <div v-else-if="tab === 'register'" class="fields">
          <div class="field">
            <label class="field-label">Nome</label>
            <div class="field-wrap">
              <v-icon icon="mdi-account-outline" size="16" class="field-icon" />
              <input v-model="regName" type="text" class="field-input" placeholder="Seu nome" />
            </div>
          </div>
          <div class="field">
            <label class="field-label">E-mail</label>
            <div class="field-wrap">
              <v-icon icon="mdi-email-outline" size="16" class="field-icon" />
              <input v-model="regEmail" type="email" class="field-input" placeholder="seu@email.com" />
            </div>
          </div>
          <div class="field">
            <label class="field-label">Senha</label>
            <div class="field-wrap">
              <v-icon icon="mdi-lock-outline" size="16" class="field-icon" />
              <input v-model="regPassword" type="password" class="field-input" placeholder="••••••••" />
            </div>
          </div>
          <div class="field">
            <label class="field-label">Slug da empresa</label>
            <div class="field-wrap">
              <v-icon icon="mdi-domain" size="16" class="field-icon" />
              <input v-model="regSlug" type="text" class="field-input" placeholder="minha-empresa" />
            </div>
          </div>
          <button class="submit-btn" :disabled="loading" @click="register">
            <v-progress-circular v-if="loading" size="16" width="2" indeterminate color="white" />
            <span v-else>Criar conta</span>
          </button>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const tab = ref('login')
const accessType = ref('user')
const email = ref('')
const password = ref('')
const showPw = ref(false)
const error     = ref('')
const suspended = ref(false)
const loading   = ref(false)
const regName = ref('')
const regEmail = ref('')
const regPassword = ref('')
const regSlug = ref('')

const accessTypes = [
  { value: 'user',       label: 'Usuário',     icon: 'mdi-account-outline' },
  { value: 'superadmin', label: 'Super Admin', icon: 'mdi-shield-crown-outline' },
]

const features = [
  { icon: 'mdi-robot-outline',  text: 'Agente SDR com IA conversacional' },
  { icon: 'mdi-whatsapp',       text: 'WhatsApp integrado (Meta + Evolution)' },
  { icon: 'mdi-calendar-check', text: 'Agendamento automático de reuniões' },
  { icon: 'mdi-chart-line',     text: 'CRM Kanban com score de leads' },
]

function particleStyle(i) {
  const size = 4 + (i % 5) * 3
  return {
    width: `${size}px`, height: `${size}px`,
    left: `${(i * 37 + 11) % 100}%`, top: `${(i * 53 + 7) % 100}%`,
    animationDelay: `${(i * 0.4) % 4}s`, animationDuration: `${6 + (i % 4) * 2}s`,
  }
}

async function submit() {
  error.value = ''
  suspended.value = false
  if (!email.value || !password.value) { error.value = 'Preencha e-mail e senha.'; return }
  loading.value = true
  try {
    const u = await auth.login(email.value, password.value)
    router.push(u.role === 'owner' ? '/admin/overview' : '/dashboard')
  } catch (e) {
    if (e.message?.toLowerCase().includes('suspens')) {
      suspended.value = true
    } else {
      error.value = e.message
    }
  } finally { loading.value = false }
}

async function register() {
  error.value = ''
  if (!regEmail.value || !regPassword.value || !regSlug.value) { error.value = 'Preencha e-mail, senha e slug.'; return }
  loading.value = true
  try { await auth.register({ name: regName.value, email: regEmail.value, password: regPassword.value, slug: regSlug.value }); router.push('/dashboard') }
  catch (e) { error.value = e.message } finally { loading.value = false }
}
</script>

<style scoped>
/* ══ FUNDO (mantido) ══ */
.login-bg {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background:
    radial-gradient(900px 500px at 85% -10%, var(--glow-1), transparent 60%),
    radial-gradient(700px 400px at -5% 110%, var(--glow-2), transparent 60%),
    var(--app-bg);
  position: relative; overflow: hidden;
  padding: 24px;
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

/* ══ CARD ══ */
.login-card {
  display: flex;
  width: 860px; max-width: 100%;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
  position: relative; z-index: 1;
  backdrop-filter: blur(20px);
  background: rgba(13,17,23,0.85);
}

/* ══ BRANDING ══ */
.brand-side {
  width: 46%;
  flex-shrink: 0;
  padding: 48px 40px;
  background: linear-gradient(145deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 50%, rgba(16,185,129,0.05) 100%);
  border-right: 1px solid rgba(255,255,255,0.06);
  display: flex; flex-direction: column;
  position: relative; overflow: hidden;
}

.brand-glow {
  position: absolute; width: 300px; height: 300px; border-radius: 50%;
  background: radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%);
  bottom: -80px; right: -80px; pointer-events: none;
}

.brand-logo {
  width: 64px; height: 64px; border-radius: 18px; flex-shrink: 0;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 24px rgba(99,102,241,0.4);
  margin-bottom: 24px;
}
.brand-name {
  font-size: 26px; font-weight: 800; color: #F1F5F9;
  margin: 0 0 10px; letter-spacing: -0.5px;
}
.brand-desc {
  font-size: 13px; color: #6B7C88; line-height: 1.6;
  margin: 0 0 32px;
}

.feature-list { display: flex; flex-direction: column; gap: 14px; }
.feature-item { display: flex; align-items: center; gap: 12px; }
.feature-icon {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
  background: rgba(99,102,241,0.2);
  display: flex; align-items: center; justify-content: center;
}
.feature-text { font-size: 13px; color: #9FB0BC; }

/* ══ FORM ══ */
.form-side {
  flex: 1; padding: 48px 44px;
  display: flex; flex-direction: column; gap: 20px;
}

/* Tipo de acesso */
.access-tabs {
  display: flex; gap: 6px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px; padding: 4px;
  width: fit-content;
}
.access-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 7px; font-size: 12px; font-weight: 600;
  background: none; border: none; cursor: pointer;
  color: #6B7C88; transition: all .15s;
}
.access-tab.active {
  background: rgba(99,102,241,0.2); color: #A5B4FC;
}
.access-tab:hover:not(.active) { color: #9FB0BC; }

/* Título */
.form-heading { margin-bottom: -4px; }
.form-title { font-size: 20px; font-weight: 700; color: #F1F5F9; margin: 0 0 4px; }
.form-sub { font-size: 13px; color: #6B7C88; margin: 0; }

/* Toggle login/register */
.form-toggle {
  display: flex;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px; padding: 4px;
}
.toggle-btn {
  flex: 1; padding: 7px 0; border-radius: 7px; font-size: 13px; font-weight: 600;
  background: none; border: none; cursor: pointer;
  color: #6B7C88; transition: all .15s;
}
.toggle-btn.active {
  background: rgba(255,255,255,0.08); color: #F1F5F9;
}

/* Erro */
.form-error {
  display: flex; align-items: center; gap: 8px;
  background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
  color: #F87171; font-size: 13px; border-radius: 10px; padding: 10px 14px;
}

/* Conta suspensa */
.form-suspended {
  display: flex; align-items: flex-start; gap: 12px;
  background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3);
  color: #FCD34D; border-radius: 10px; padding: 14px;
}
.suspended-title { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
.suspended-body  { font-size: 12px; opacity: .85; line-height: 1.5; }

/* Campos */
.fields { display: flex; flex-direction: column; gap: 14px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: #9FB0BC; }

.field-wrap {
  display: flex; align-items: center; gap: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 11px; padding: 0 14px;
  transition: border-color .15s;
}
.field-wrap:focus-within {
  border-color: rgba(99,102,241,0.5);
  background: rgba(99,102,241,0.04);
}

.field-icon { color: #3A4A55; flex-shrink: 0; }

.field-input {
  flex: 1; background: none; border: none; outline: none;
  font-size: 14px; color: #F1F5F9; padding: 12px 0;
  font-family: inherit;
}
.field-input::placeholder { color: #3A4A55; }

.field-eye {
  background: none; border: none; cursor: pointer;
  color: #3A4A55; flex-shrink: 0; padding: 0;
  transition: color .15s; display: flex;
}
.field-eye:hover { color: #9FB0BC; }

/* Botão */
.submit-btn {
  width: 100%; padding: 13px;
  border: none; border-radius: 12px; cursor: pointer;
  font-size: 14px; font-weight: 700; color: white;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  box-shadow: 0 4px 20px rgba(99,102,241,0.35);
  transition: all .2s; display: flex; align-items: center; justify-content: center;
  margin-top: 4px;
}
.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 28px rgba(99,102,241,0.45);
}
.submit-btn:active:not(:disabled) { transform: translateY(0); }
.submit-btn:disabled { opacity: .6; cursor: not-allowed; }

/* Mobile: oculta branding */
@media (max-width: 640px) {
  .brand-side { display: none; }
  .form-side { padding: 36px 28px; }
}
</style>
