import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FlowNode from '../FlowNode.vue'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

function mountNode(data, selected = false) {
  return mount(FlowNode, {
    props: { data, selected },
    ...pluginOptions({ stubs: { Handle: true } }),
  })
}

describe('FlowNode', () => {
  it('usa o meta de "message" como fallback quando não há nodeType', () => {
    const wrapper = mountNode({})
    expect(wrapper.text()).toContain('Mensagem')
    expect(wrapper.text()).toContain('Sem texto')
  })

  it('nó "start" mostra o rótulo e a prévia corretos', () => {
    const wrapper = mountNode({ nodeType: 'start' })
    expect(wrapper.text()).toContain('Início')
    expect(wrapper.text()).toContain('Início do fluxo')
  })

  it('nó "message" mostra o texto truncado em 38 caracteres', () => {
    const longText = 'a'.repeat(60)
    const wrapper = mountNode({ nodeType: 'message', text: longText })
    expect(wrapper.find('.fn-preview').text()).toBe(longText.slice(0, 38))
  })

  it('nó "delay" mostra os segundos configurados (ou 1s por padrão)', () => {
    expect(mountNode({ nodeType: 'delay', seconds: 5 }).text()).toContain('Aguardar 5s')
    expect(mountNode({ nodeType: 'delay' }).text()).toContain('Aguardar 1s')
  })

  it('nó "variable" mostra o nome da variável capturada', () => {
    const wrapper = mountNode({ nodeType: 'variable', variableName: 'nome_cliente' })
    expect(wrapper.text()).toContain('{{nome_cliente}}')
  })

  it('nó "variable" sem variável configurada mostra aviso', () => {
    expect(mountNode({ nodeType: 'variable' }).text()).toContain('Sem variável')
  })

  it('nó "condition" mostra a variável testada ou "Por resposta"', () => {
    expect(mountNode({ nodeType: 'condition', variableName: 'interesse' }).text()).toContain('Se {{interesse}}')
    expect(mountNode({ nodeType: 'condition' }).text()).toContain('Por resposta')
  })

  it('nó "transfer" mostra a mensagem de transferência ou o padrão', () => {
    expect(mountNode({ nodeType: 'transfer', message: 'Transferindo você...' }).text()).toContain('Transferindo você...')
    expect(mountNode({ nodeType: 'transfer' }).text()).toContain('Para humano')
  })

  it('nó "webhook" mostra a URL truncada ou aviso de URL ausente', () => {
    expect(mountNode({ nodeType: 'webhook', url: 'https://api.exemplo.com/endpoint' }).text()).toContain('https://api.exemplo.com/endpoint')
    expect(mountNode({ nodeType: 'webhook' }).text()).toContain('Sem URL')
  })

  it('nó "kanban" mostra o estágio configurado ou aviso', () => {
    expect(mountNode({ nodeType: 'kanban', stage: 'Qualificado' }).text()).toContain('Qualificado')
    expect(mountNode({ nodeType: 'kanban' }).text()).toContain('Sem estágio')
  })

  it('nó "end" mostra "Encerrar fluxo"', () => {
    expect(mountNode({ nodeType: 'end' }).text()).toContain('Encerrar fluxo')
  })

  it('aplica a cor de borda cheia (sem alpha) e o box-shadow de destaque quando selecionado', () => {
    const selected = mountNode({ nodeType: 'start' }, true)
    const unselected = mountNode({ nodeType: 'start' }, false)
    expect(selected.find('.fn').attributes('style')).toContain('border-color: rgb(34, 197, 94)')
    expect(selected.find('.fn').attributes('style')).toContain('box-shadow: 0 0 0 2px #22C55E66')
    expect(unselected.find('.fn').attributes('style')).toContain('box-shadow: none')
  })

  it('aplica a classe correspondente ao tipo do nó', () => {
    const wrapper = mountNode({ nodeType: 'webhook' })
    expect(wrapper.find('.fn').classes()).toContain('fn--webhook')
  })
})
