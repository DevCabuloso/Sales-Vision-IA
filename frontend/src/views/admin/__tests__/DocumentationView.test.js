import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DocumentationView from '../DocumentationView.vue'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

describe('DocumentationView', () => {
  it('renderiza sem quebrar', () => {
    const wrapper = mount(DocumentationView, pluginOptions())
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text().length).toBeGreaterThan(0)
  })

  it('expande/recolhe um item do acordeão (banco de dados) no lugar, sem v-if', async () => {
    const wrapper = mount(DocumentationView, pluginOptions())
    const item = wrapper.findAll('.doc-acc-item')[0]
    expect(item.classes()).not.toContain('open')

    await item.find('.doc-acc-head').trigger('click')
    expect(item.classes()).toContain('open')

    await item.find('.doc-acc-head').trigger('click')
    expect(item.classes()).not.toContain('open')
  })

  it('"Expandir tudo" abre todos os itens da seção e "Recolher tudo" fecha todos', async () => {
    const wrapper = mount(DocumentationView, pluginOptions())
    const dbSection = wrapper.find('#banco-de-dados')
    const buttons = dbSection.findAll('button')
    const expandBtn = buttons.find((b) => b.text() === 'Expandir tudo')
    const collapseBtn = buttons.find((b) => b.text() === 'Recolher tudo')

    await expandBtn.trigger('click')
    const items = dbSection.findAll('.doc-acc-item')
    expect(items.length).toBeGreaterThan(0)
    items.forEach((it) => expect(it.classes()).toContain('open'))

    await collapseBtn.trigger('click')
    dbSection.findAll('.doc-acc-item').forEach((it) => expect(it.classes()).not.toContain('open'))
  })
})
