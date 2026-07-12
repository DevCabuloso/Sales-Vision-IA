import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listChannels: null, createChannel: null }))

vi.mock('@/services/api', () => ({
  api: {
    listChannels: (...a) => mockState.listChannels(...a),
    createChannel: (...a) => mockState.createChannel(...a),
    renameChannel: vi.fn(),
    setDefaultChannel: vi.fn(),
    closeChannelTickets: vi.fn(),
    revalidateChannelWebhook: vi.fn(),
    getChannelStatus: vi.fn(),
    disconnectChannel: vi.fn(),
    getChannelQR: vi.fn(),
    deleteChannel: vi.fn(),
    listOperators: vi.fn().mockResolvedValue({ operators: [] }),
    listQueues: vi.fn().mockResolvedValue({ queues: [] }),
    updateChannelSettings: vi.fn(),
  },
  http: { get: vi.fn().mockResolvedValue({ data: {} }) },
}))

const ChannelsView = (await import('../ChannelsView.vue')).default

describe('ChannelsView', () => {
  beforeEach(() => {
    mockState.listChannels = vi.fn().mockResolvedValue([])
    mockState.createChannel = vi.fn()
  })

  it('carrega e lista os canais existentes', async () => {
    mockState.listChannels.mockResolvedValue([{ id: 'ch1', name: 'Principal', instance_name: 'sdr_x', is_default: true, status: 'connected' }])
    const wrapper = mount(ChannelsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Principal')
  })

  it('cria um novo canal ao preencher o nome e confirmar', async () => {
    mockState.createChannel.mockResolvedValue({ id: 'ch-novo', name: 'Novo Canal' })
    const wrapper = mount(ChannelsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    document.body.querySelector('.ch-new-btn').click()
    await flushPromises()

    const nameInput = document.body.querySelector('.v-dialog input')
    nameInput.value = 'Novo Canal'
    nameInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const confirmBtn = [...document.body.querySelectorAll('.v-dialog button')].find((b) => /criar|conectar|adicionar/i.test(b.textContent))
    confirmBtn?.click()
    await flushPromises()

    expect(mockState.createChannel).toHaveBeenCalledWith('Novo Canal')
    wrapper.unmount()
  })
})
