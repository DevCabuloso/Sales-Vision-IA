<template>
  <div>
    <v-navigation-drawer
      permanent
      color="transparent"
      style="background:rgba(255,255,255,0.02);border-right:1px solid rgba(255,255,255,0.08)"
    >
      <v-list-item nav>
        <template #prepend>
          <div class="logo-badge d-flex align-center justify-center mr-3">
            <v-icon icon="mdi-shield-crown" color="white" size="20" />
          </div>
        </template>
        <v-list-item-title class="text-subtitle-2 font-weight-bold">Super Admin</v-list-item-title>
        <v-list-item-subtitle class="text-caption">SDR IA Platform</v-list-item-subtitle>
      </v-list-item>

      <v-divider />

      <v-list-subheader>VISÃO GERAL</v-list-subheader>
      <v-list density="compact" nav>
        <v-list-item v-for="item in navMain" :key="item.to" :prepend-icon="item.icon" :title="item.title" :active="isActive(item.to)" active-color="accent" rounded="lg" @click="navigate(item.to)" />
      </v-list>

      <v-list-subheader>GESTÃO</v-list-subheader>
      <v-list density="compact" nav>
        <v-list-item v-for="item in navManagement" :key="item.to" :prepend-icon="item.icon" :title="item.title" :active="isActive(item.to)" active-color="accent" rounded="lg" @click="navigate(item.to)" />
      </v-list>

      <v-list-subheader>SISTEMA</v-list-subheader>
      <v-list density="compact" nav>
        <v-list-item v-for="item in navSystem" :key="item.to" :prepend-icon="item.icon" :title="item.title" :active="isActive(item.to)" active-color="accent" rounded="lg" @click="navigate(item.to)" />
      </v-list>

      <template #append>
        <v-divider />
        <v-list density="compact" nav>
          <v-list-item prepend-icon="mdi-arrow-left" title="Voltar ao app" rounded="lg" @click="navigate('/dashboard')" />
          <v-list-item prepend-icon="mdi-logout" title="Sair" rounded="lg" @click="logout" />
        </v-list>
        <div class="owner-badge mx-3 mb-3 pa-2 rounded-lg d-flex align-center ga-2">
          <v-icon icon="mdi-crown" color="warning" size="16" />
          <span class="text-caption text-warning font-weight-semibold text-truncate">{{ auth.user?.email }}</span>
        </div>
      </template>
    </v-navigation-drawer>

    <v-app-bar :elevation="0" style="border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02)">
      <v-app-bar-title class="text-subtitle-2 font-weight-bold">Administração da Plataforma</v-app-bar-title>
      <template #append>
        <v-chip color="warning" variant="tonal" size="small" prepend-icon="mdi-shield-crown" class="mr-3">Proprietário</v-chip>
      </template>
    </v-app-bar>

    <v-main class="app-bg">
      <v-container fluid class="py-6 px-4">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </v-container>
    </v-main>
  </div>
</template>

<script setup>
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

function navigate(to) { router.push(to) }
function isActive(to) { return route.path === to || route.path.startsWith(to + '/') }

const navMain = [
  { title: 'Visão Geral',   icon: 'mdi-chart-box-outline', to: '/admin/overview' },
  { title: 'Monitoramento', icon: 'mdi-monitor-eye',        to: '/admin/monitoramento' },
]
const navManagement = [
  { title: 'Clientes', icon: 'mdi-domain',              to: '/admin/clientes' },
  { title: 'Usuários', icon: 'mdi-account-group-outline', to: '/admin/usuarios' },
]
const navSystem = [
  { title: 'Configurações', icon: 'mdi-cog-outline', to: '/admin/configuracoes' },
  { title: 'Documentação', icon: 'mdi-book-open-page-variant-outline', to: '/admin/documentacao' },
]

async function logout() { await auth.logout(); router.push('/login') }
</script>

<style scoped>
.logo-badge {
  width: 34px; height: 34px; border-radius: 10px;
  background: linear-gradient(135deg, #F59E0B, #FBBF24);
  flex-shrink: 0;
}
.owner-badge {
  background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.15);
}
</style>
