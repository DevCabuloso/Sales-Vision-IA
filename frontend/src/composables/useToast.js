import { reactive } from 'vue'

const state = reactive({ show: false, text: '', color: 'success' })
let timer = null

export function useToast() {
  function show(text, color = 'success') {
    clearTimeout(timer)
    state.text = text
    state.color = color
    state.show = true
    timer = setTimeout(() => { state.show = false }, 3500)
  }

  return {
    state,
    success: (t) => show(t, 'success'),
    error: (t) => show(t, 'error'),
    info: (t) => show(t, 'info'),
    warning: (t) => show(t, 'warning'),
  }
}
