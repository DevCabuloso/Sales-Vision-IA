import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AudioPlayer from '../AudioPlayer.vue'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

function mountPlayer(props) {
  return mount(AudioPlayer, { props, ...pluginOptions() })
}

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  it('usa a duração enviada pelo servidor em vez da nativa do <audio>', async () => {
    const wrapper = mountPlayer({ src: 'blob:audio', duration: 65 })
    // simula o navegador reportando uma duração nativa errada (bug do WebM)
    Object.defineProperty(wrapper.find('audio').element, 'duration', { value: 999, configurable: true })
    await wrapper.find('audio').trigger('loadedmetadata')

    expect(wrapper.find('.audio-player-time').text()).toBe('1:05')
    expect(wrapper.find('.audio-player-seek').element.max).toBe('65')
  })

  it('cai para a duração nativa quando não há duração do servidor', async () => {
    const wrapper = mountPlayer({ src: 'blob:audio', duration: null })
    Object.defineProperty(wrapper.find('audio').element, 'duration', { value: 42, configurable: true })
    await wrapper.find('audio').trigger('loadedmetadata')

    expect(wrapper.find('.audio-player-time').text()).toBe('0:42')
  })

  it('alterna play/pause ao clicar no botão', async () => {
    const wrapper = mountPlayer({ src: 'blob:audio', duration: 10 })
    const playSpy = vi.spyOn(wrapper.find('audio').element, 'play').mockResolvedValue()
    const pauseSpy = vi.spyOn(wrapper.find('audio').element, 'pause').mockImplementation(() => {})

    await wrapper.find('.audio-player-toggle').trigger('click')
    expect(playSpy).toHaveBeenCalled()

    await wrapper.find('.audio-player-toggle').trigger('click')
    expect(pauseSpy).toHaveBeenCalled()
  })

  it('atualiza o tempo exibido conforme o áudio toca', async () => {
    const wrapper = mountPlayer({ src: 'blob:audio', duration: 30 })
    const audioEl = wrapper.find('audio').element
    Object.defineProperty(audioEl, 'currentTime', { value: 5, configurable: true })
    await wrapper.find('audio').trigger('timeupdate')

    expect(wrapper.find('.audio-player-time').text()).toBe('0:05')
  })

  it('reseta ao terminar a reprodução', async () => {
    const wrapper = mountPlayer({ src: 'blob:audio', duration: 30 })
    const audioEl = wrapper.find('audio').element
    Object.defineProperty(audioEl, 'currentTime', { value: 30, configurable: true })
    await wrapper.find('audio').trigger('timeupdate')
    await wrapper.find('audio').trigger('ended')

    expect(wrapper.find('.audio-player-time').text()).toBe('0:30')
  })
})
