<template>
  <div class="app-shell">
    <!-- Backdrop mobile -->
    <transition name="fade-fast">
      <div v-if="drawerOpen && isMobile" class="sidebar-backdrop" @click="drawerOpen = false" />
    </transition>

    <!-- ═══════════════════ SIDEBAR ═══════════════════ -->
    <aside class="sidebar" :class="{ collapsed: rail && !isMobile, 'drawer-open': drawerOpen, mobile: isMobile }">

      <!-- Logo -->
      <div class="sidebar-logo">
        <div class="logo-icon">
          <v-icon icon="mdi-robot-happy-outline" color="white" size="20" />
        </div>
        <transition name="fade-fast">
          <div v-if="!rail" class="logo-text">
            <span class="logo-name">SDR IA</span>
            <span class="logo-sub">{{ tenantName }}</span>
          </div>
        </transition>
        <v-btn
          v-if="!isMobile"
          class="collapse-btn"
          :icon="rail ? 'mdi-chevron-right' : 'mdi-chevron-left'"
          variant="text"
          size="x-small"
          @click="rail = !rail"
        />
        <v-btn
          v-if="isMobile"
          class="collapse-btn"
          icon="mdi-close"
          variant="text"
          size="x-small"
          @click="drawerOpen = false"
        />
      </div>

      <!-- Navegação -->
      <div class="sidebar-nav">

        <!-- Principal -->
        <div class="nav-section">
          <span v-if="!rail" class="nav-label">PRINCIPAL</span>
          <button v-for="item in navMain" :key="item.to" class="nav-item" :class="{ active: isActive(item.to) }" @click="navigate(item.to)">
            <div class="nav-icon" :class="{ 'nav-icon--active': isActive(item.to) }">
              <v-icon :icon="item.icon" size="18" />
            </div>
            <span v-if="!rail" class="nav-title">{{ item.title }}</span>
            <div v-if="isActive(item.to) && !rail" class="active-dot" />
          </button>
        </div>

        <!-- Ferramentas -->
        <div class="nav-section">
          <span v-if="!rail" class="nav-label">FERRAMENTAS</span>
          <button v-for="item in navTools" :key="item.to" class="nav-item" :class="{ active: isActive(item.to) }" @click="navigate(item.to)">
            <div class="nav-icon" :class="{ 'nav-icon--active': isActive(item.to) }">
              <v-icon :icon="item.icon" size="18" />
            </div>
            <span v-if="!rail" class="nav-title">{{ item.title }}</span>
            <div v-if="isActive(item.to) && !rail" class="active-dot" />
          </button>
        </div>

        <!-- Sistema -->
        <div v-if="navSystem.length" class="nav-section">
          <span v-if="!rail" class="nav-label">SISTEMA</span>
          <button v-for="item in navSystem" :key="item.to" class="nav-item" :class="{ active: isActive(item.to) }" @click="navigate(item.to)">
            <div class="nav-icon" :class="{ 'nav-icon--active': isActive(item.to) }">
              <v-icon :icon="item.icon" size="18" />
            </div>
            <span v-if="!rail" class="nav-title">{{ item.title }}</span>
            <div v-if="isActive(item.to) && !rail" class="active-dot" />
          </button>
        </div>

      </div>

      <!-- Rodapé -->
      <div class="sidebar-footer">
        <!-- Toggle IA -->
        <button class="nav-item ai-toggle" :class="{ active: aiEnabled }" @click="toggleAI">
          <div class="nav-icon" :class="aiEnabled ? 'ai-on' : 'ai-off'">
            <v-icon :icon="aiEnabled ? 'mdi-robot' : 'mdi-robot-off'" size="18" />
          </div>
          <transition name="fade-fast">
            <span v-if="!rail" class="nav-title">{{ aiEnabled ? 'IA Ativada' : 'IA Desativada' }}</span>
          </transition>
          <transition name="fade-fast">
            <v-progress-circular v-if="togglingAI && !rail" size="12" width="2" indeterminate class="ml-auto" />
          </transition>
        </button>

        <!-- Painel do dono -->
        <button v-if="auth.isOwner" class="nav-item" @click="navigate('/admin/overview')">
          <div class="nav-icon owner">
            <v-icon icon="mdi-shield-crown-outline" size="18" />
          </div>
          <transition name="fade-fast">
            <span v-if="!rail" class="nav-title">Painel Admin</span>
          </transition>
        </button>

        <div class="footer-divider" />

        <!-- Perfil do usuário -->
        <div class="user-card" :class="{ centered: rail }">
          <div class="user-avatar">{{ initials }}</div>
          <transition name="fade-fast">
            <div v-if="!rail" class="user-info">
              <span class="user-name">{{ auth.user?.name || initials }}</span>
              <span class="user-email">{{ auth.user?.email }}</span>
            </div>
          </transition>
          <transition name="fade-fast">
            <button v-if="!rail" class="logout-btn" title="Sair" @click="logout">
              <v-icon icon="mdi-logout" size="16" />
            </button>
          </transition>
        </div>
      </div>
    </aside>

    <!-- ═══════════════════ APP BAR ═══════════════════ -->
    <div class="main-area">
      <header class="app-bar">
        <button class="menu-btn" @click="isMobile ? (drawerOpen = !drawerOpen) : (rail = !rail)">
          <v-icon icon="mdi-menu" size="20" />
        </button>
        <div class="bar-spacer" />
        <NotificationBell />
        <ThemeSwitcher />
      </header>

      <main class="main-content" :class="{ 'has-bottom-nav': isMobile }">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>

      <!-- Bottom navigation (mobile) -->
      <nav v-if="isMobile" class="bottom-nav">
        <button v-for="item in bottomNavItems" :key="item.to" class="bottom-nav-item" :class="{ active: isActive(item.to) }" @click="navigate(item.to)">
          <v-icon :icon="item.icon" size="22" />
          <span>{{ item.title }}</span>
        </button>
        <button class="bottom-nav-item" @click="drawerOpen = true">
          <v-icon icon="mdi-dots-horizontal" size="22" />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore } from '@/stores/locale.js'
import { api } from '@/services/api'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import NotificationBell from '@/components/NotificationBell.vue'
import { useNotificationsStore } from '@/stores/notifications'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

const isMobile   = ref(window.innerWidth < 768)
const drawerOpen = ref(false)

function onResize() {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) drawerOpen.value = false
}

function navigate(to) {
  router.push(to)
  if (isMobile.value) drawerOpen.value = false
}
function isActive(to) { return route.path === to || route.path.startsWith(to + '/') }

const rail       = ref(false)
const aiEnabled  = ref(true)
const togglingAI = ref(false)

const notifStore = useNotificationsStore()

async function loadAIStatus() { try { const d = await api.getAIStatus(); aiEnabled.value = d.ai_enabled } catch { /* */ } }
async function toggleAI() {
  togglingAI.value = true
  try { const d = await api.toggleAI(); aiEnabled.value = d.ai_enabled } catch { /* */ }
  finally { togglingAI.value = false }
}
onMounted(() => {
  loadAIStatus()
  notifStore.startPolling()
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  notifStore.stopPolling()
  window.removeEventListener('resize', onResize)
})

const isAdmin = computed(() => auth.user?.role === 'admin' || auth.user?.role === 'owner')
const locale  = useLocaleStore()
const t       = (k) => locale.t(k)

function feat(key) {
  const f = auth.user?.features
  if (!f) return true  // owner ou sem features = acesso total
  return f[key] !== false
}

const navMain = computed(() => [
  { title: t('nav.dashboard'),  icon: 'mdi-view-dashboard-outline',  to: '/dashboard' },
  { title: t('nav.kanban'),     icon: 'mdi-view-column-outline',     to: '/kanban',   show: feat('kanban') },
  { title: t('nav.chat'),       icon: 'mdi-chat-outline',            to: '/chat' },
  { title: t('nav.grupos'),     icon: 'mdi-account-group-outline',   to: '/grupos' },
  { title: t('nav.contatos'),   icon: 'mdi-contacts-outline',        to: '/contatos', show: feat('contacts') },
  { title: t('nav.leads'),      icon: 'mdi-account-multiple-outline',to: '/leads' },
  { title: t('nav.agenda'),     icon: 'mdi-calendar-clock-outline',  to: '/agenda',   show: feat('agenda') },
].filter((i) => i.show !== false))

const navTools = computed(() => [
  { title: t('nav.templates'),  icon: 'mdi-file-document-multiple-outline', to: '/templates' },
  { title: t('nav.broadcast'),  icon: 'mdi-bullhorn-outline',               to: '/broadcast',  show: feat('broadcast') },
  { title: t('nav.usuarios'),   icon: 'mdi-account-group-outline',          to: '/operadores', show: feat('operators') },
].filter((i) => i.show !== false))

const navSystem = computed(() => {
  if (!isAdmin.value) return []
  return [
    { title: t('nav.atendimento'),   icon: 'mdi-headset',            to: '/atendimento' },
    { title: t('nav.canais'),        icon: 'mdi-cellphone-wireless', to: '/canais',       show: feat('evolution') || feat('meta_api') },
    { title: t('nav.ia'),            icon: 'mdi-robot-outline',      to: '/ia-config',    show: feat('ia_config') },
    { title: t('nav.apis'),          icon: 'mdi-api',                to: '/apis',         show: feat('custom_apis') },
    { title: t('nav.integracoes'),   icon: 'mdi-puzzle-outline',     to: '/integracoes',  show: feat('google_cal') || feat('meta_api') },
    { title: t('nav.configuracoes'), icon: 'mdi-cog-outline',        to: '/configuracoes' },
  ].filter((i) => i.show !== false)
})

const tenantName = computed(() => auth.user?.tenantName || auth.user?.tenantSlug || 'Minha Operação')
const initials   = computed(() => (auth.user?.email || '?').slice(0, 2).toUpperCase())

const bottomNavItems = computed(() => [
  { title: 'Dashboard', icon: 'mdi-view-dashboard-outline', to: '/dashboard' },
  { title: 'Chat',      icon: 'mdi-chat-outline',           to: '/chat' },
  { title: 'Kanban',    icon: 'mdi-view-column-outline',    to: '/kanban' },
  { title: 'Leads',     icon: 'mdi-account-multiple-outline', to: '/leads' },
])

async function logout() { await auth.logout(); router.push('/login') }
</script>

<style scoped>
/* ═══ SHELL ═══ */
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
}

/* ═══ SIDEBAR ═══ */
.sidebar {
  width: 240px;
  flex-shrink: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--app-bg);
  border-right: 1px solid var(--border-subtle);
  transition: width 0.25s cubic-bezier(.4,0,.2,1);
  overflow: hidden;
  z-index: 10;
}
.sidebar.collapsed { width: 64px; }

/* ─── Logo ─── */
.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 14px 16px;
  flex-shrink: 0;
  position: relative;
}
.logo-icon {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(99,102,241,0.35);
}
.logo-text { flex: 1; min-width: 0; overflow: hidden; }
.logo-name { display: block; font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; }
.logo-sub  { display: block; font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.collapse-btn { margin-left: auto; flex-shrink: 0; color: var(--text-muted) !important; }

/* ─── Navegação ─── */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
  scrollbar-width: none;
}
.sidebar-nav::-webkit-scrollbar { display: none; }

.nav-section { padding: 8px 0 4px; }

.nav-label {
  display: block;
  font-size: 9px; font-weight: 700; letter-spacing: 1px;
  color: var(--text-faint);
  padding: 0 16px 6px;
  white-space: nowrap;
}

/* ─── Item de nav ─── */
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: calc(100% - 12px);
  padding: 7px 12px;
  margin: 1px 6px;
  border-radius: 10px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s ease;
  text-align: left;
  position: relative;
}
.nav-item:hover { background: var(--panel-hover); color: var(--text-primary); }
.nav-item.active { background: rgba(99,102,241,0.12); color: #818CF8; }

.nav-icon {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--panel-bg);
  transition: all 0.15s;
}
.nav-item:hover .nav-icon { background: var(--panel-hover); }
.nav-icon--active { background: rgba(99,102,241,0.2) !important; color: #818CF8; }

.nav-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; flex: 1; }

.active-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #6366F1; margin-left: auto; flex-shrink: 0;
}

/* ─── Toggle IA ─── */
.ai-toggle.active { background: rgba(16,185,129,0.08); color: #34D399; }
.ai-toggle.active:hover { background: rgba(16,185,129,0.12); }
.nav-icon.ai-on  { background: rgba(16,185,129,0.15) !important; color: #34D399; }
.nav-icon.ai-off { background: rgba(239,68,68,0.1)  !important; color: #F87171; }

/* ─── Dono ─── */
.nav-icon.owner { background: rgba(245,158,11,0.12) !important; color: #FBBF24; }

/* ─── Rodapé ─── */
.sidebar-footer {
  flex-shrink: 0;
  padding: 8px 0 10px;
  border-top: 1px solid var(--border-subtle);
}
.footer-divider { height: 1px; background: var(--border-subtle); margin: 8px 12px; }

.user-card {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; margin: 2px 6px; border-radius: 10px;
  background: var(--panel-bg);
}
.user-card.centered { justify-content: center; }

.user-avatar {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: white;
}
.user-info { flex: 1; min-width: 0; overflow: hidden; }
.user-name  { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-email { display: block; font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.logout-btn {
  width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); transition: all 0.15s;
}
.logout-btn:hover { background: rgba(239,68,68,0.1); color: #F87171; }

/* ═══ ÁREA PRINCIPAL ═══ */
.main-area { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }

/* ─── App bar ─── */
.app-bar {
  display: flex; align-items: center; gap: 8px;
  height: 56px; padding: 0 20px; flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--app-bg);
}
.menu-btn {
  width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); transition: all 0.15s;
}
.menu-btn:hover { background: var(--panel-hover); color: var(--text-primary); }
.bar-spacer { flex: 1; }

/* ─── Conteúdo ─── */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background:
    radial-gradient(900px 500px at 85% -10%, var(--glow-1), transparent 60%),
    radial-gradient(700px 400px at -5% 110%, var(--glow-2), transparent 60%),
    var(--app-bg);
}

/* ─── Transições ─── */
.fade-fast-enter-active,
.fade-fast-leave-active { transition: opacity 0.15s ease; }
.fade-fast-enter-from,
.fade-fast-leave-to { opacity: 0; }

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

/* ═══ MOBILE ═══ */
@media (max-width: 767px) {
  .sidebar {
    position: fixed;
    top: 0; left: 0;
    height: 100vh;
    width: 240px !important;
    z-index: 200;
    transform: translateX(-100%);
    transition: transform 0.25s cubic-bezier(.4,0,.2,1);
    box-shadow: 4px 0 24px rgba(0,0,0,0.3);
  }
  .sidebar.drawer-open {
    transform: translateX(0);
  }
  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 199;
  }
  .main-content {
    padding: 12px;
  }
  .main-content.has-bottom-nav {
    padding-bottom: 72px;
  }
}

/* ═══ BOTTOM NAV ═══ */
.bottom-nav {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 60px;
  display: flex;
  align-items: center;
  background: var(--app-bg);
  border-top: 1px solid var(--border-subtle);
  z-index: 100;
  padding: 0 4px;
  padding-bottom: env(safe-area-inset-bottom);
}
.bottom-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 4px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 8px;
  transition: all 0.15s;
  font-size: 10px;
  font-weight: 500;
}
.bottom-nav-item.active { color: #818CF8; }
.bottom-nav-item:active { background: var(--panel-hover); }
</style>
