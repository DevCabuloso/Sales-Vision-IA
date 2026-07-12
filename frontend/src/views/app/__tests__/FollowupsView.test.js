import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listFollowupSequences: null, createFollowupSequence: null, duplicateFollowupSequence: null }))

vi.mock('@/services/api', () => ({
  api: {
    listFollowupSequences: (...a) => mockState.listFollowupSequences(...a),
    getFollowupSequence: vi.fn(),
    createFollowupSequence: (...a) => mockState.createFollowupSequence(...a),
    updateFollowupSequence: vi.fn(),
    deleteFollowupSequence: vi.fn(),
    duplicateFollowupSequence: (...a) => mockState.duplicateFollowupSequence(...a),
    uploadFollowupStepMedia: vi.fn(),
  },
}))

const FollowupsView = (await import('../FollowupsView.vue')).default

describe('FollowupsView', () => {
  beforeEach(() => {
    mockState.listFollowupSequences = vi.fn().mockResolvedValue([])
    mockState.createFollowupSequence = vi.fn()
    mockState.duplicateFollowupSequence = vi.fn().mockResolvedValue({})
  })

  it('mostra o estado vazio quando não há acompanhamentos', async () => {
    const wrapper = mount(FollowupsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhum acompanhamento cadastrado.')
  })

  it('lista os acompanhamentos existentes com contagem de etapas e contatos', async () => {
    mockState.listFollowupSequences.mockResolvedValue([{ id: 's1', name: 'Pós-venda', steps_count: 3, active_count: 2 }])
    const wrapper = mount(FollowupsView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Pós-venda')
    expect(wrapper.text()).toContain('3 mensagem(ns)')
    expect(wrapper.text()).toContain('2 contato(s)')
  })

  it('exige nome ao tentar salvar uma nova sequência', async () => {
    const wrapper = mount(FollowupsView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    await wrapper.find('button').trigger('click') // "Novo Acompanhamento"
    await flushPromises()

    const salvarBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Salvar')
    salvarBtn.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Informe um nome')
    expect(mockState.createFollowupSequence).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('duplica uma sequência existente', async () => {
    mockState.listFollowupSequences.mockResolvedValue([{ id: 's1', name: 'Pós-venda', steps_count: 1, active_count: 0 }])
    const wrapper = mount(FollowupsView, pluginOptions())
    await flushPromises()

    await wrapper.find('button[title="Duplicar"]').trigger('click')
    await flushPromises()

    expect(mockState.duplicateFollowupSequence).toHaveBeenCalledWith('s1')
  })
})
