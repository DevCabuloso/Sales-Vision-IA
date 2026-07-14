import { onBeforeUnmount, onMounted } from 'vue'

// Sem isso, a sessão (cookie httpOnly de 7 dias) ficava válida indefinidamente
// enquanto a aba permanecesse aberta — um dispositivo compartilhado ou
// perdido com a plataforma aberta continuava com acesso total sem nenhum
// limite de inatividade.
const DEFAULT_IDLE_MS = 30 * 60 * 1000 // 30 minutos
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']

/** Chama onIdle() depois de idleMs sem nenhuma interação do usuário na página. */
export function useIdleLogout(onIdle, idleMs = DEFAULT_IDLE_MS) {
  let timer = null

  function reset() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onIdle, idleMs)
  }

  onMounted(() => {
    reset()
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, reset, { passive: true })
  })

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
    for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, reset)
  })
}
