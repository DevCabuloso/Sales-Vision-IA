import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockState = vi.hoisted(() => ({ get: null, patch: null }))

vi.mock('@/services/api', () => ({
  http: { get: (...a) => mockState.get(...a), patch: (...a) => mockState.patch(...a) },
}))

const { useNotificationsStore } = await import('../notifications.js')

describe('stores/notifications.js', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockState.get = vi.fn().mockResolvedValue({ data: { notifications: [] } })
    mockState.patch = vi.fn().mockResolvedValue({ data: { read: true } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetch() busca notificações usando o timeout salvo (ou 30 por padrão) e preenche items/visible/count', async () => {
    localStorage.setItem('sdr_unanswered_timeout', '45')
    mockState.get.mockResolvedValue({ data: { notifications: [{ lead_id: 'l1', name: 'Ana' }] } })
    const store = useNotificationsStore()
    await store.fetch()
    expect(mockState.get).toHaveBeenCalledWith('/notifications?minutes=45')
    expect(store.items).toHaveLength(1)
    expect(store.visible).toHaveLength(1)
    expect(store.count).toBe(1)
    expect(store.loading).toBe(false)
  })

  it('usa o timeout padrão de 30 minutos quando não há configuração salva', async () => {
    const store = useNotificationsStore()
    await store.fetch()
    expect(mockState.get).toHaveBeenCalledWith('/notifications?minutes=30')
  })

  it('fetch() silencia erros e não quebra a UI', async () => {
    mockState.get.mockRejectedValue(new Error('falhou'))
    const store = useNotificationsStore()
    await expect(store.fetch()).resolves.toBeUndefined()
    expect(store.loading).toBe(false)
    expect(store.items).toEqual([])
  })

  it('dismiss(leadId) remove da lista visível e persiste em localStorage', async () => {
    mockState.get.mockResolvedValue({ data: { notifications: [{ lead_id: 'l1' }, { lead_id: 'l2' }] } })
    const store = useNotificationsStore()
    await store.fetch()
    store.dismiss('l1')
    expect(store.visible.map((n) => n.lead_id)).toEqual(['l2'])
    expect(store.count).toBe(1)
    expect(JSON.parse(localStorage.getItem('sdr_dismissed_notifs'))).toEqual(['l1'])
  })

  it('dismissAll() esconde todas as notificações atuais e persiste', async () => {
    mockState.get.mockResolvedValue({ data: { notifications: [{ lead_id: 'l1' }, { lead_id: 'l2' }] } })
    const store = useNotificationsStore()
    await store.fetch()
    store.dismissAll()
    expect(store.visible).toHaveLength(0)
    expect(store.count).toBe(0)
    const dismissed = JSON.parse(localStorage.getItem('sdr_dismissed_notifs'))
    expect(dismissed.sort()).toEqual(['l1', 'l2'])
  })

  it('dismissed carrega o estado persistido de localStorage na criação do store', async () => {
    localStorage.setItem('sdr_dismissed_notifs', JSON.stringify(['l1']))
    mockState.get.mockResolvedValue({ data: { notifications: [{ lead_id: 'l1' }, { lead_id: 'l2' }] } })
    const store = useNotificationsStore()
    await store.fetch()
    expect(store.visible.map((n) => n.lead_id)).toEqual(['l2'])
  })

  it('startPolling() busca imediatamente e depois a cada intervalo', async () => {
    vi.useFakeTimers()
    const store = useNotificationsStore()
    store.startPolling(1000)
    await vi.advanceTimersByTimeAsync(0)
    expect(mockState.get).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockState.get).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(mockState.get).toHaveBeenCalledTimes(4)
    store.stopPolling()
  })

  it('fetch() preenche alerts e soma no count', async () => {
    mockState.get.mockResolvedValue({ data: { notifications: [], alerts: [{ id: 'a1', title: 'Vencimento', message: 'Vence em 3 dias.' }] } })
    const store = useNotificationsStore()
    await store.fetch()
    expect(store.alerts).toHaveLength(1)
    expect(store.count).toBe(1)
  })

  it('dismissAlert(id) remove localmente e chama PATCH /notifications/:id/read', async () => {
    mockState.get.mockResolvedValue({ data: { notifications: [], alerts: [{ id: 'a1', title: 'Vencimento' }] } })
    const store = useNotificationsStore()
    await store.fetch()
    await store.dismissAlert('a1')
    expect(store.alerts).toHaveLength(0)
    expect(mockState.patch).toHaveBeenCalledWith('/notifications/a1/read')
  })

  it('dismissAlert(id) não quebra quando o PATCH falha', async () => {
    mockState.get.mockResolvedValue({ data: { notifications: [], alerts: [{ id: 'a1' }] } })
    mockState.patch.mockRejectedValue(new Error('falhou'))
    const store = useNotificationsStore()
    await store.fetch()
    await expect(store.dismissAlert('a1')).resolves.toBeUndefined()
    expect(store.alerts).toHaveLength(0)
  })

  it('stopPolling() interrompe o polling', async () => {
    vi.useFakeTimers()
    const store = useNotificationsStore()
    store.startPolling(1000)
    await vi.advanceTimersByTimeAsync(0)
    store.stopPolling()
    const callsBefore = mockState.get.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(mockState.get.mock.calls.length).toBe(callsBefore)
  })
})
