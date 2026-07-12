import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, reactive, computed, nextTick } from 'vue'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ items: null, dismiss: null, dismissAll: null, push: null }))

// precisa ser reactive() (não um objeto plano) para que storeToRefs() consiga
// desembrulhar os computed refs corretamente, como faria uma store Pinia real
vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => reactive({
    visible: computed(() => mockState.items.value),
    count: computed(() => mockState.items.value.length),
    dismiss: (...a) => mockState.dismiss(...a),
    dismissAll: (...a) => mockState.dismissAll(...a),
  }),
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => ({ push: (...a) => mockState.push(...a) }) }
})

const NotificationBell = (await import('../NotificationBell.vue')).default

describe('NotificationBell', () => {
  beforeEach(() => {
    mockState.items = ref([])
    mockState.dismiss = vi.fn((id) => { mockState.items.value = mockState.items.value.filter((n) => n.lead_id !== id) })
    mockState.dismissAll = vi.fn(() => { mockState.items.value = [] })
    mockState.push = vi.fn()
  })

  it('mostra o sino sem badge quando não há notificações', () => {
    const wrapper = mount(NotificationBell, pluginOptions())
    expect(wrapper.find('.bell-badge').exists()).toBe(false)
    expect(wrapper.find('.v-icon').classes().join(' ')).toContain('mdi-bell-outline')
  })

  it('mostra o badge com a contagem quando há notificações', async () => {
    mockState.items.value = [{ lead_id: 'l1', lead_name: 'Ana', minutes_ago: 40, last_message: 'oi' }]
    const wrapper = mount(NotificationBell, pluginOptions())
    await nextTick()
    expect(wrapper.find('.bell-badge').text()).toBe('1')
    expect(wrapper.find('.v-icon').classes().join(' ')).toContain('mdi-bell-ring')
  })

  it('mostra "9+" quando há mais de 9 notificações', async () => {
    mockState.items.value = Array.from({ length: 12 }, (_, i) => ({ lead_id: `l${i}`, lead_name: `Lead ${i}`, minutes_ago: 40, last_message: 'oi' }))
    const wrapper = mount(NotificationBell, pluginOptions())
    await nextTick()
    expect(wrapper.find('.bell-badge').text()).toBe('9+')
  })

  it('abre o painel ao clicar no sino e mostra estado vazio sem notificações', async () => {
    const wrapper = mount(NotificationBell, pluginOptions())
    await wrapper.find('.bell-btn').trigger('click')
    expect(wrapper.find('.panel-empty').exists()).toBe(true)
  })

  it('lista as notificações e permite dispensar uma individualmente', async () => {
    mockState.items.value = [{ lead_id: 'l1', lead_name: 'Ana', lead_phone: '5511988887777', minutes_ago: 40, last_message: 'Alguém aí?' }]
    const wrapper = mount(NotificationBell, pluginOptions())
    await wrapper.find('.bell-btn').trigger('click')

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Sem resposta há 40 min')

    await wrapper.find('.notif-dismiss').trigger('click')
    expect(mockState.dismiss).toHaveBeenCalledWith('l1')
  })

  it('"Limpar tudo" chama dismissAll', async () => {
    mockState.items.value = [{ lead_id: 'l1', lead_name: 'Ana', minutes_ago: 40, last_message: 'oi' }]
    const wrapper = mount(NotificationBell, pluginOptions())
    await wrapper.find('.bell-btn').trigger('click')
    await wrapper.find('.mark-all-btn').trigger('click')
    expect(mockState.dismissAll).toHaveBeenCalled()
  })

  it('navega para a conversa do lead ao clicar na notificação e fecha o painel', async () => {
    mockState.items.value = [{ lead_id: 'l1', lead_name: 'Ana', minutes_ago: 40, last_message: 'oi' }]
    const wrapper = mount(NotificationBell, pluginOptions())
    await wrapper.find('.bell-btn').trigger('click')
    await wrapper.find('.notif-item').trigger('click')

    expect(mockState.push).toHaveBeenCalledWith('/chat/l1')
    expect(wrapper.find('.notif-panel').exists()).toBe(false)
  })
})
