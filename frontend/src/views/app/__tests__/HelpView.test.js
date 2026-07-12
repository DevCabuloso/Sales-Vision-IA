import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HelpView from '../HelpView.vue'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

describe('HelpView', () => {
  it('mostra a primeira categoria (Primeiros passos) por padrão', () => {
    const wrapper = mount(HelpView, pluginOptions())
    expect(wrapper.text()).toContain('Primeiros passos')
    expect(wrapper.text()).toContain('O que é a plataforma?')
  })

  it('troca de categoria ao clicar em outro item da barra lateral', async () => {
    const wrapper = mount(HelpView, pluginOptions())
    const canaisBtn = wrapper.findAll('.help-cat-item').find((b) => b.text().includes('Canais & WhatsApp'))
    await canaisBtn.trigger('click')
    expect(wrapper.text()).toContain('Como conecto um número de WhatsApp?')
  })

  it('filtra os artigos de todas as categorias pela busca', async () => {
    const wrapper = mount(HelpView, pluginOptions())
    await wrapper.find('input').setValue('score de qualificação')
    expect(wrapper.text()).toContain('resultado(s) para')
    expect(wrapper.text()).toContain('O que é o "score de qualificação"?')
  })

  it('mostra estado vazio quando a busca não encontra nada', async () => {
    const wrapper = mount(HelpView, pluginOptions())
    await wrapper.find('input').setValue('xyzxyz_termo_inexistente')
    expect(wrapper.text()).toContain('Nenhum artigo encontrado')
  })

  it('expande/recolhe a resposta no lugar ao clicar na pergunta (classe "open", sem v-if)', async () => {
    const wrapper = mount(HelpView, pluginOptions())
    const card = wrapper.findAll('.faq-card')[0]
    expect(card.classes()).not.toContain('open')

    await card.find('.faq-head').trigger('click')
    expect(card.classes()).toContain('open')

    await card.find('.faq-head').trigger('click')
    expect(card.classes()).not.toContain('open')
  })

  it('fecha as perguntas abertas ao trocar de categoria', async () => {
    const wrapper = mount(HelpView, pluginOptions())
    const card = wrapper.findAll('.faq-card')[0]
    await card.find('.faq-head').trigger('click')
    expect(card.classes()).toContain('open')

    const canaisBtn = wrapper.findAll('.help-cat-item').find((b) => b.text().includes('Canais & WhatsApp'))
    await canaisBtn.trigger('click')

    expect(wrapper.findAll('.faq-card.open')).toHaveLength(0)
  })
})
