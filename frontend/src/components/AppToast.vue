<template>
  <v-snackbar v-model="toast.state.show" :color="toast.state.color" timeout="3500" location="bottom right">
    {{ toast.state.text }}
  </v-snackbar>
</template>

<script setup>
import { useToast } from '@/composables/useToast'
const toast = useToast()
</script>
