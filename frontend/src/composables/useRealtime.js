import { onMounted, onUnmounted, ref } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'

/**
 * Assina mudanças (INSERT/UPDATE/DELETE) de uma tabela, filtrando por tenant,
 * e chama onChange() a cada evento. Faz cleanup automático ao desmontar.
 */
export function useRealtime(table, tenantId, onChange) {
  let channel = null

  onMounted(() => {
    if (!supabase) return
    const filter = tenantId ? { event: '*', schema: 'public', table, filter: `tenant_id=eq.${tenantId}` }
                            : { event: '*', schema: 'public', table }
    channel = supabase
      .channel(`rt:${table}:${tenantId || 'all'}`)
      .on('postgres_changes', filter, (payload) => {
        try { onChange(payload) } catch (e) { console.warn('[realtime]', e.message) }
      })
      .subscribe()
  })

  onUnmounted(() => {
    if (channel && supabase) supabase.removeChannel(channel)
  })
}

/**
 * Composable para o ChatView: escuta novas mensagens em tempo real.
 * Expõe onMessage(cb) para registrar callbacks.
 */
export function useMessageRealtime() {
  const auth = useAuthStore()
  const callbacks = ref([])
  let channel = null

  onMounted(() => {
    if (!supabase || !auth.user?.tenantId) return
    channel = supabase
      .channel(`rt:messages:${auth.user.tenantId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `tenant_id=eq.${auth.user.tenantId}`,
      }, (payload) => {
        for (const cb of callbacks.value) {
          try { cb(payload.new) } catch (e) { console.warn('[realtime:messages]', e.message) }
        }
      })
      .subscribe()
  })

  onUnmounted(() => {
    if (channel && supabase) supabase.removeChannel(channel)
  })

  function onMessage(cb) { callbacks.value.push(cb) }

  return { onMessage }
}
