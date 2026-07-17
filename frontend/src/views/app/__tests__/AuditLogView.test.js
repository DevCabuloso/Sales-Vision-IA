import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listAuditLog: null }))

vi.mock('@/services/api', () => ({
  api: {
    listAuditLog: (...a) => mockState.listAuditLog(...a),
  },
}))

const AuditLogView = (await import('../AuditLogView.vue')).default

describe('AuditLogView', () => {
  beforeEach(() => {
    mockState.listAuditLog = vi.fn().mockResolvedValue({ entries: [] })
  })

  it('carrega e lista as entradas de auditoria', async () => {
    mockState.listAuditLog.mockResolvedValue({
      entries: [
        { id: '1', entity: 'lead', action: 'update', entityId: 'l1', changes: { stage: 'Qualificado' }, actorName: 'Ana', createdAt: '2026-07-17T10:00:00Z' },
      ],
    })
    const wrapper = mount(AuditLogView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Lead')
  })

  it('mostra o estado vazio quando não há eventos', async () => {
    const wrapper = mount(AuditLogView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhum evento de auditoria encontrado.')
  })

  it('reenvia a chamada com os filtros ao clicar em Filtrar', async () => {
    const wrapper = mount(AuditLogView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()
    mockState.listAuditLog.mockClear()

    const dateInputs = document.body.querySelectorAll('input[type="date"]')
    dateInputs[0].value = '2026-07-01'
    dateInputs[0].dispatchEvent(new Event('input'))
    await flushPromises()

    const filterBtn = [...document.body.querySelectorAll('button')].find((b) => /filtrar/i.test(b.textContent))
    filterBtn?.click()
    await flushPromises()

    expect(mockState.listAuditLog).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-07-01' }))
    wrapper.unmount()
  })

  it('abre o dialog de detalhes com as alterações em JSON', async () => {
    mockState.listAuditLog.mockResolvedValue({
      entries: [
        { id: '1', entity: 'lead', action: 'update', entityId: 'l1', changes: { stage: 'Qualificado' }, actorName: 'Ana', createdAt: '2026-07-17T10:00:00Z' },
      ],
    })
    const wrapper = mount(AuditLogView, { attachTo: document.body, ...pluginOptions() })
    await flushPromises()

    const detailsBtn = [...document.body.querySelectorAll('button')].find((b) => /ver detalhes/i.test(b.textContent))
    detailsBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Qualificado')
    wrapper.unmount()
  })
})
