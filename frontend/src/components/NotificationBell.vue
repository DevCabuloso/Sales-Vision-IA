<template>
  <div class="bell-wrapper" @click.stop>
    <!-- Botão do sino -->
    <button class="bell-btn" :class="{ active: open }" @click="toggle">
      <v-icon :icon="count > 0 ? 'mdi-bell-ring' : 'mdi-bell-outline'" size="20" />
      <transition name="badge-pop">
        <span v-if="count > 0" class="bell-badge">{{ count > 9 ? '9+' : count }}</span>
      </transition>
    </button>

    <!-- Painel dropdown -->
    <transition name="panel-drop">
      <div v-if="open" class="notif-panel">
        <!-- Header do painel -->
        <div class="panel-header">
          <span class="panel-title">Notificações</span>
          <button v-if="count > 0" class="mark-all-btn" @click="dismissAll">
            Limpar tudo
          </button>
        </div>

        <!-- Lista vazia -->
        <div v-if="!visible.length" class="panel-empty">
          <v-icon icon="mdi-bell-check-outline" size="36" style="opacity:.25" />
          <p class="text-caption mt-2" style="color:#6B7C88">Tudo em dia! Nenhum lead sem resposta.</p>
        </div>

        <!-- Lista de notificações -->
        <div v-else class="panel-list">
          <div
            v-for="n in visible"
            :key="n.lead_id"
            class="notif-item"
            @click="goToLead(n)"
          >
            <div class="notif-avatar">
              <v-icon icon="mdi-account-outline" size="16" />
            </div>
            <div class="notif-body">
              <div class="notif-name">{{ n.lead_name || n.lead_phone }}</div>
              <div class="notif-time">
                <v-icon icon="mdi-clock-alert-outline" size="12" />
                Sem resposta há {{ n.minutes_ago }} min
              </div>
              <div class="notif-msg">{{ n.last_message }}</div>
            </div>
            <button class="notif-dismiss" title="Dispensar" @click.stop="dismiss(n.lead_id)">
              <v-icon icon="mdi-close" size="14" />
            </button>
          </div>
        </div>

        <!-- Rodapé -->
        <div class="panel-footer">
          <router-link to="/chat" class="panel-link" @click="open = false">
            Ver todos os atendimentos →
          </router-link>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationsStore } from '@/stores/notifications'
import { storeToRefs } from 'pinia'

const router = useRouter()
const store  = useNotificationsStore()
const { visible, count } = storeToRefs(store)
const { dismiss, dismissAll } = store

const open = ref(false)

function toggle() { open.value = !open.value }

function goToLead(n) {
  open.value = false
  router.push(n.lead_id ? `/chat/${n.lead_id}` : '/chat')
}

function onClickOutside() { open.value = false }

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))
</script>

<style scoped>
.bell-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

/* ── Botão ── */
.bell-btn {
  position: relative;
  width: 36px; height: 36px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s;
}
.bell-btn:hover,
.bell-btn.active { background: var(--panel-hover); color: var(--text-primary); }

/* ── Badge ── */
.bell-badge {
  position: absolute;
  top: 4px; right: 4px;
  min-width: 16px; height: 16px;
  background: #EF4444;
  color: white;
  font-size: 9px; font-weight: 700;
  border-radius: 99px;
  display: flex; align-items: center; justify-content: center;
  padding: 0 3px;
  line-height: 1;
  border: 2px solid var(--app-bg);
}

/* ── Painel ── */
.notif-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  background: var(--panel-bg, #1A2332);
  border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  z-index: 1000;
  overflow: hidden;
}

.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
}
.panel-title {
  font-size: 13px; font-weight: 700;
  color: var(--text-primary, #E2E8F0);
}
.mark-all-btn {
  font-size: 11px; color: #6366F1;
  background: none; border: none; cursor: pointer;
  padding: 0; transition: opacity 0.15s;
}
.mark-all-btn:hover { opacity: 0.7; }

/* ── Vazio ── */
.panel-empty {
  padding: 32px 16px;
  text-align: center;
  color: #6B7C88;
}

/* ── Lista ── */
.panel-list {
  max-height: 320px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.notif-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04));
  cursor: pointer;
  transition: background 0.12s;
}
.notif-item:last-child { border-bottom: none; }
.notif-item:hover { background: rgba(255,255,255,0.04); }

.notif-avatar {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  background: rgba(239,68,68,0.12);
  border: 1px solid rgba(239,68,68,0.2);
  display: flex; align-items: center; justify-content: center;
  color: #F87171;
  margin-top: 2px;
}

.notif-body { flex: 1; min-width: 0; }

.notif-name {
  font-size: 12px; font-weight: 600;
  color: var(--text-primary, #E2E8F0);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.notif-time {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; color: #F59E0B;
  margin: 2px 0;
}
.notif-msg {
  font-size: 11px;
  color: var(--text-muted, #6B7C88);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.notif-dismiss {
  width: 22px; height: 22px; flex-shrink: 0;
  border-radius: 6px; background: none; border: none;
  cursor: pointer; color: var(--text-muted, #6B7C88);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s; margin-top: 2px;
}
.notif-dismiss:hover { background: rgba(239,68,68,0.1); color: #F87171; }

/* ── Rodapé ── */
.panel-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  text-align: center;
}
.panel-link {
  font-size: 12px; color: #6366F1; text-decoration: none;
  transition: opacity 0.15s;
}
.panel-link:hover { opacity: 0.75; }

/* ── Animações ── */
.badge-pop-enter-active { animation: pop 0.2s ease; }
.badge-pop-leave-active { animation: pop 0.15s ease reverse; }
@keyframes pop {
  0%   { transform: scale(0); opacity: 0; }
  70%  { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.panel-drop-enter-active { transition: all 0.18s ease; }
.panel-drop-leave-active { transition: all 0.14s ease; }
.panel-drop-enter-from,
.panel-drop-leave-to { opacity: 0; transform: translateY(-6px) scale(0.97); }
</style>
