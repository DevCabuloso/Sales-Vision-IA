import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { http } from '@/services/api'

const DISMISSED_KEY = 'sdr_dismissed_notifs'
const TIMEOUT_KEY   = 'sdr_unanswered_timeout'

export const useNotificationsStore = defineStore('notifications', () => {
  const items     = ref([])
  const loading   = ref(false)
  let   _interval = null

  const dismissed = ref(new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')))

  const visible = computed(() =>
    items.value.filter(n => !dismissed.value.has(n.lead_id))
  )

  const count = computed(() => visible.value.length)

  function getTimeout() {
    return parseInt(localStorage.getItem(TIMEOUT_KEY) || '30')
  }

  async function fetch() {
    try {
      loading.value = true
      const { data } = await http.get(`/notifications?minutes=${getTimeout()}`)
      items.value = data.notifications || []
    } catch {
      // silencioso — não quebra a UI se o endpoint falhar
    } finally {
      loading.value = false
    }
  }

  function dismiss(leadId) {
    dismissed.value.add(leadId)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed.value]))
  }

  function dismissAll() {
    for (const n of items.value) dismissed.value.add(n.lead_id)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed.value]))
  }

  function startPolling(intervalMs = 60_000) {
    fetch()
    _interval = setInterval(fetch, intervalMs)
  }

  function stopPolling() {
    if (_interval) { clearInterval(_interval); _interval = null }
  }

  return { items, visible, count, loading, fetch, dismiss, dismissAll, startPolling, stopPolling }
})
