import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/impersonate',
    name: 'impersonate',
    component: () => import('@/views/ImpersonateView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard',   name: 'dashboard',   component: () => import('@/views/app/DashboardView.vue') },
      { path: 'kanban',      name: 'kanban',       component: () => import('@/views/app/KanbanView.vue') },
      { path: 'chat',        name: 'chat',         component: () => import('@/views/app/ChatView.vue') },
      { path: 'chat/:id',    name: 'chat-lead',    component: () => import('@/views/app/ChatView.vue'), props: true },
      { path: 'grupos',      name: 'grupos',       component: () => import('@/views/app/InternalGroupsView.vue') },
      { path: 'leads',       name: 'leads',        component: () => import('@/views/app/LeadsView.vue') },
      { path: 'agenda',      name: 'agenda',       component: () => import('@/views/app/AgendaView.vue') },
      { path: 'templates',   name: 'templates',    component: () => import('@/views/app/TemplatesView.vue') },
      { path: 'broadcast',   name: 'broadcast',    component: () => import('@/views/app/BroadcastView.vue') },
      { path: 'operadores',  name: 'operadores',   component: () => import('@/views/app/OperatorsView.vue') },
      { path: 'ia-config',   name: 'ia-config',    component: () => import('@/views/app/AIConfigView.vue') },
      { path: 'apis',        name: 'custom-apis',  component: () => import('@/views/app/CustomApisView.vue') },
      { path: 'canais',      name: 'canais',       component: () => import('@/views/app/ChannelsView.vue') },
      { path: 'contatos',    name: 'contatos',     component: () => import('@/views/app/ContactsView.vue') },
      { path: 'integracoes', name: 'integracoes',  component: () => import('@/views/app/IntegrationsView.vue') },
      { path: 'configuracoes', name: 'config',     component: () => import('@/views/app/TenantSettingsView.vue') },
      { path: 'atendimento',  name: 'atendimento', component: () => import('@/views/app/AttendanceConfigView.vue') },
      { path: 'operacao',     name: 'operacao',    component: () => import('@/views/app/OperationalSettingsView.vue') },
      { path: 'flows',        name: 'flows',        component: () => import('@/views/app/FlowsView.vue') },
      { path: 'flows/:id',    name: 'flow-editor',  component: () => import('@/views/app/FlowEditorView.vue'), props: true },
    ],
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresOwner: true },
    children: [
      { path: '', redirect: '/admin/overview' },
      { path: 'overview', name: 'admin-overview', component: () => import('@/views/admin/OverviewView.vue') },
      { path: 'clientes', name: 'admin-clients', component: () => import('@/views/admin/ClientsView.vue') },
      { path: 'clientes/:id', name: 'admin-client', component: () => import('@/views/admin/ClientDetailView.vue'), props: true },
      { path: 'usuarios', name: 'admin-users', component: () => import('@/views/admin/UsersView.vue') },
      { path: 'monitoramento', name: 'admin-monitoring', component: () => import('@/views/admin/MonitoringView.vue') },
      { path: 'configuracoes', name: 'admin-settings', component: () => import('@/views/admin/SettingsView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  // Root URL: limpa a sessão da aba atual e vai sempre para login
  if (to.path === '/') {
    auth.clearSession()
    auth.logout().catch(() => {}) // limpa cookie em background
    return { name: 'login' }
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // owner não acessa rotas de cliente
  if (auth.isOwner && !to.path.startsWith('/admin') && !to.meta.public) {
    return { name: 'admin-overview' }
  }

  // não-owner não acessa rotas de admin
  if (to.meta.requiresOwner && !auth.isOwner) {
    return { name: 'dashboard' }
  }

  // já autenticado na tela de login
  if (to.name === 'login' && auth.isAuthenticated) {
    return auth.isOwner ? { name: 'admin-overview' } : { name: 'dashboard' }
  }
})

export default router
