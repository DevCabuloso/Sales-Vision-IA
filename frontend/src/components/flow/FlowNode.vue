<template>
  <div class="fn" :class="[`fn--${nodeType}`, { 'fn--selected': selected }]" :style="borderStyle">
    <Handle type="target" :position="Position.Left" class="fn-handle" />
    <div class="fn-icon" :style="{ background: meta.color + '22', color: meta.color }">
      <v-icon :icon="meta.icon" size="15" />
    </div>
    <div class="fn-body">
      <div class="fn-label">{{ meta.label }}</div>
      <div class="fn-preview">{{ preview }}</div>
    </div>
    <Handle type="source" :position="Position.Right" class="fn-handle fn-handle--out" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps({
  data:     { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false },
})

const NODE_META = {
  start:     { label: 'Início',     icon: 'mdi-play-circle-outline',   color: '#22C55E' },
  message:   { label: 'Mensagem',   icon: 'mdi-message-text-outline',  color: '#6366F1' },
  delay:     { label: 'Aguardar',   icon: 'mdi-clock-outline',         color: '#F59E0B' },
  variable:  { label: 'Capturar',   icon: 'mdi-text-box-outline',      color: '#3B82F6' },
  condition: { label: 'Condição',   icon: 'mdi-source-branch',         color: '#EC4899' },
  transfer:  { label: 'Transferir', icon: 'mdi-account-arrow-right',   color: '#F97316' },
  webhook:   { label: 'Webhook',    icon: 'mdi-webhook',               color: '#8B5CF6' },
  kanban:    { label: 'Kanban',     icon: 'mdi-view-column-outline',   color: '#14B8A6' },
  end:       { label: 'Fim',        icon: 'mdi-stop-circle-outline',   color: '#EF4444' },
}

const nodeType = computed(() => props.data?.nodeType || 'message')
const meta     = computed(() => NODE_META[nodeType.value] || NODE_META.message)

const borderStyle = computed(() => ({
  borderColor: props.selected ? meta.value.color : meta.value.color + '55',
  boxShadow:   props.selected ? `0 0 0 2px ${meta.value.color}66` : 'none',
}))

const preview = computed(() => {
  const d = props.data || {}
  switch (nodeType.value) {
    case 'start':     return 'Início do fluxo'
    case 'message':   return d.text?.slice(0, 38) || 'Sem texto'
    case 'delay':     return `Aguardar ${d.seconds || 1}s`
    case 'variable':  return d.variableName ? `→ {{${d.variableName}}}` : 'Sem variável'
    case 'condition': return d.variableName ? `Se {{${d.variableName}}}` : 'Por resposta'
    case 'transfer':  return d.message?.slice(0, 38) || 'Para humano'
    case 'webhook':   return d.url?.slice(0, 38) || 'Sem URL'
    case 'kanban':    return d.stage || 'Sem estágio'
    case 'end':       return 'Encerrar fluxo'
    default:          return ''
  }
})
</script>

<style scoped>
.fn {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 180px;
  max-width: 240px;
  padding: 8px 10px 8px 8px;
  border-radius: 10px;
  border: 1.5px solid transparent;
  background: #1a2235;
  cursor: default;
  transition: border-color 0.15s, box-shadow 0.15s;
  position: relative;
}

.fn-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.fn-body {
  flex: 1;
  min-width: 0;
}

.fn-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7c93;
  line-height: 1.2;
}

.fn-preview {
  font-size: 12px;
  color: #c8d6e5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.fn-handle {
  width: 10px !important;
  height: 10px !important;
  background: #4b5563 !important;
  border: 2px solid #1a2235 !important;
  border-radius: 50% !important;
}
.fn-handle:hover {
  background: #6366F1 !important;
}
</style>
