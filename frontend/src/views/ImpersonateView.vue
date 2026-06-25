<template>
  <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0F1623">
    <v-progress-circular indeterminate color="primary" size="48" />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

onMounted(() => {
  try {
    const { token, u } = route.query
    if (!token || !u) throw new Error()
    const user = JSON.parse(decodeURIComponent(atob(u)))
    auth.impersonate(token, user)
    router.replace('/dashboard')
  } catch {
    router.replace('/login')
  }
})
</script>
