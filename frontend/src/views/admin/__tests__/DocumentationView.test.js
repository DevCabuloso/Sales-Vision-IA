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
})
