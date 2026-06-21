<template>
  <v-card class="glass pa-5" border>
    <div class="d-flex align-center justify-space-between mb-3">
      <span class="text-body-2" style="color:#9FB0BC">{{ label }}</span>
      <v-icon :icon="icon" :color="color" size="22" />
    </div>
    <div class="text-h4 font-weight-black">{{ value }}</div>
    <div v-if="hint" class="text-caption mt-1" style="color:#9FB0BC">{{ hint }}</div>
  </v-card>
</template>

<script setup>
defineProps({
  label: String,
  value: [String, Number],
  icon: { type: String, default: 'mdi-chart-line' },
  color: { type: String, default: 'primary' },
  hint: String,
})
</script>
