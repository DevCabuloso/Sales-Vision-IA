<template>
  <v-menu :close-on-content-click="false" max-height="460">
    <template #activator="{ props }">
      <v-btn v-bind="props" icon="mdi-palette-outline" variant="text" size="small" title="Trocar tema" />
    </template>

    <v-card min-width="220" class="pa-2 glass" border>
      <div class="ts-title">Tema</div>

      <div v-for="(keys, group) in THEME_GROUPS" :key="group">
        <div class="ts-group">{{ group }}</div>
        <button
          v-for="key in keys" :key="key"
          class="ts-item"
          :class="{ active: themeStore.current === key }"
          @click="select(key)"
        >
          <div class="ts-dots">
            <span class="ts-dot" :style="{ background: THEMES[key].preview[0] }" />
            <span class="ts-dot" :style="{ background: THEMES[key].preview[1] }" />
            <span class="ts-dot" :style="{ background: THEMES[key].preview[2] }" />
          </div>
          <span class="ts-label">{{ THEMES[key].label }}</span>
          <v-icon v-if="themeStore.current === key" icon="mdi-check" size="14" color="primary" class="ml-auto" />
        </button>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup>
import { useThemeStore } from '@/stores/theme'
import { THEMES, THEME_GROUPS } from '@/themes'

const themeStore = useThemeStore()
function select(key) { themeStore.apply(key) }
</script>

<style scoped>
.ts-title { font-size: 12px; font-weight: 700; color: var(--text-secondary); padding: 4px 8px 8px; }
.ts-group { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: var(--text-faint); padding: 4px 10px 4px; text-transform: uppercase; }

.ts-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 7px 10px; border-radius: 8px;
  background: none; border: none; cursor: pointer;
  transition: background 0.12s; text-align: left;
  color: var(--text-secondary);
}
.ts-item:hover { background: var(--panel-hover); }
.ts-item.active { background: rgba(99,102,241,0.1); color: var(--text-primary); }

.ts-dots { display: flex; gap: 3px; flex-shrink: 0; }
.ts-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(128,128,128,0.2); }

.ts-label { font-size: 13px; font-weight: 500; flex: 1; }
</style>
