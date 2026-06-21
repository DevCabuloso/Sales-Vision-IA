<template>
  <v-app :theme="themeStore.current">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <AppToast />
  </v-app>
</template>

<script setup>
import { useThemeStore } from '@/stores/theme'
import AppToast from '@/components/AppToast.vue'

const themeStore = useThemeStore()
themeStore.init()
</script>
