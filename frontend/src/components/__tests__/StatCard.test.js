import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatCard from '../StatCard.vue'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

describe('StatCard', () => {
  it('renderiza label, valor, ícone e cor padrão', () => {
    const wrapper = mount(StatCard, { props: { label: 'Leads hoje', value: 42 }, ...pluginOptions() })
    expect(wrapper.text()).toContain('Leads hoje')
    expect(wrapper.text()).toContain('42')
    expect(wrapper.find('.v-icon').attributes('class')).toContain('mdi-chart-line')
  })

  it('não renderiza o hint quando não fornecido', () => {
    const wrapper = mount(StatCard, { props: { label: 'x', value: 1 }, ...pluginOptions() })
    expect(wrapper.find('.text-caption').exists()).toBe(false)
  })

  it('renderiza o hint quando fornecido', () => {
    const wrapper = mount(StatCard, { props: { label: 'x', value: 1, hint: 'desde ontem' }, ...pluginOptions() })
    expect(wrapper.text()).toContain('desde ontem')
  })

  it('usa o ícone e a cor customizados quando fornecidos', () => {
    const wrapper = mount(StatCard, { props: { label: 'x', value: 1, icon: 'mdi-account', color: 'error' }, ...pluginOptions() })
    expect(wrapper.find('.v-icon').attributes('class')).toContain('mdi-account')
  })

  it('aceita valor em formato string', () => {
    const wrapper = mount(StatCard, { props: { label: 'Taxa', value: '87%' }, ...pluginOptions() })
    expect(wrapper.text()).toContain('87%')
  })
})
