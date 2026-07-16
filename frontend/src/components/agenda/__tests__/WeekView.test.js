import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const WeekView = (await import('../WeekView.vue')).default

// constrói a data no fuso local (não via parse de string ISO, que o Date
// interpreta como UTC meia-noite e pode "vazar" pro dia anterior em UTC-3)
function dayObj(y, m, d, { isToday = false } = {}) {
  const date = new Date(y, m - 1, d)
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { key, date, num: date.getDate(), dow: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][date.getDay()], isToday }
}

const HOUR_PX = 48

describe('WeekView', () => {
  it('renderiza um cabeçalho de dia por item em days', () => {
    const days = [dayObj(2026,8,3), dayObj(2026,8,4), dayObj(2026,8,5)]
    const wrapper = mount(WeekView, { props: { days, events: [] }, ...pluginOptions() })
    const heads = wrapper.findAll('.week-day-head')
    expect(heads).toHaveLength(3)
    expect(heads[0].text()).toContain('3')
  })

  it('renderiza um evento com horário na coluna do dia correspondente', () => {
    const days = [dayObj(2026,8,3)]
    const events = [{ id: 'e1', title: 'Demo com Ana', all_day: false, status: 'scheduled', start_time: '2026-08-03T10:00:00', end_time: '2026-08-03T10:30:00' }]
    const wrapper = mount(WeekView, { props: { days, events }, ...pluginOptions() })
    expect(wrapper.text()).toContain('Demo com Ana')
    expect(wrapper.find('.week-event').exists()).toBe(true)
  })

  it('não renderiza eventos de outro dia na coluna', () => {
    const days = [dayObj(2026,8,3)]
    const events = [{ id: 'e1', title: 'Outro dia', all_day: false, status: 'scheduled', start_time: '2026-08-10T10:00:00', end_time: '2026-08-10T10:30:00' }]
    const wrapper = mount(WeekView, { props: { days, events }, ...pluginOptions() })
    expect(wrapper.text()).not.toContain('Outro dia')
  })

  it('renderiza eventos de dia inteiro na faixa "Dia todo", não na grade de horas', () => {
    const days = [dayObj(2026,8,3)]
    const events = [{ id: 'e1', title: 'Feriado', all_day: true, status: 'scheduled', start_time: '2026-08-03T12:00:00', end_time: '2026-08-03T12:00:00' }]
    const wrapper = mount(WeekView, { props: { days, events }, ...pluginOptions() })
    expect(wrapper.find('.allday-chip').text()).toContain('Feriado')
    expect(wrapper.find('.week-event').exists()).toBe(false)
  })

  it('emite "edit" ao clicar num evento', async () => {
    const days = [dayObj(2026,8,3)]
    const ev = { id: 'e1', title: 'Demo', all_day: false, status: 'scheduled', start_time: '2026-08-03T10:00:00', end_time: '2026-08-03T10:30:00' }
    const wrapper = mount(WeekView, { props: { days, events: [ev] }, ...pluginOptions() })
    await wrapper.find('.week-event').trigger('click')
    expect(wrapper.emitted('edit')).toBeTruthy()
    expect(wrapper.emitted('edit')[0][0]).toMatchObject({ id: 'e1' })
  })

  it('emite "create-slot" com um horário ao clicar numa área vazia da coluna', async () => {
    const days = [dayObj(2026,8,3)]
    const wrapper = mount(WeekView, { props: { days, events: [] }, ...pluginOptions() })
    const col = wrapper.find('.week-col')
    await col.trigger('click', { clientY: 10 * HOUR_PX }) // ~10h da manhã

    expect(wrapper.emitted('create-slot')).toBeTruthy()
    const emittedDate = wrapper.emitted('create-slot')[0][0]
    expect(emittedDate.getHours()).toBe(10)
  })

  it('arrastar um evento verticalmente emite "reschedule" preservando a duração', async () => {
    const days = [dayObj(2026,8,3)]
    const ev = { id: 'e1', title: 'Demo', all_day: false, status: 'scheduled', start_time: '2026-08-03T10:00:00', end_time: '2026-08-03T10:30:00' }
    const wrapper = mount(WeekView, { props: { days, events: [ev] }, ...pluginOptions() })

    const eventEl = wrapper.find('.week-event').element
    eventEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 0, clientX: 0 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 2 * HOUR_PX, clientX: 0 })) // +2h
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 2 * HOUR_PX, clientX: 0 }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('reschedule')).toBeTruthy()
    const [{ event, start, end }] = wrapper.emitted('reschedule')[0]
      ? [wrapper.emitted('reschedule')[0][0]] : [{}]
    expect(event.id).toBe('e1')
    const durationMs = new Date(end) - new Date(start)
    expect(durationMs).toBe(30 * 60_000)
    expect(new Date(start).getHours()).toBe(12) // 10h + 2h
  })

  it('redimensionar um evento pela borda inferior emite "resize" com nova duração', async () => {
    const days = [dayObj(2026,8,3)]
    const ev = { id: 'e1', title: 'Demo', all_day: false, status: 'scheduled', start_time: '2026-08-03T10:00:00', end_time: '2026-08-03T10:30:00' }
    const wrapper = mount(WeekView, { props: { days, events: [ev] }, ...pluginOptions() })

    const handle = wrapper.find('.resize-handle').element
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 0 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 1 * HOUR_PX })) // +1h de duração
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 1 * HOUR_PX }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('resize')).toBeTruthy()
    const { event, end } = wrapper.emitted('resize')[0][0]
    expect(event.id).toBe('e1')
    expect(new Date(end).getHours()).toBe(11) // 10:30 + 1h = 11:30
    expect(new Date(end).getMinutes()).toBe(30)
  })
})
