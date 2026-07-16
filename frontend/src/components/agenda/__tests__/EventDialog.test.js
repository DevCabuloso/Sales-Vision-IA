import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ listLeads: null, createAppointment: null, rescheduleAppointment: null, cancelAppointment: null }))

vi.mock('@/services/api', () => ({
  api: {
    listLeads: (...a) => mockState.listLeads(...a),
    createAppointment: (...a) => mockState.createAppointment(...a),
    rescheduleAppointment: (...a) => mockState.rescheduleAppointment(...a),
    cancelAppointment: (...a) => mockState.cancelAppointment(...a),
  },
}))

const EventDialog = (await import('../EventDialog.vue')).default

// v-dialog teleporta seu conteúdo para document.body — buscamos ali direto
// em vez de via wrapper.find, e envolvemos em DOMWrapper pra ter .trigger()/.setValue().
function domButton(text) {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === text)
  return btn ? new DOMWrapper(btn) : undefined
}
function domLabel(text) {
  return Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === text)
}
function domInput(labelText) {
  const label = domLabel(labelText)
  const root = label.closest('.v-input')
  return new DOMWrapper(root.querySelector('input'))
}

async function mountDialog(props = {}) {
  const wrapper = mount(EventDialog, {
    attachTo: document.body,
    props: { modelValue: true, event: null, initialDate: null, ...props },
    ...pluginOptions(),
  })
  await flushPromises()
  return wrapper
}

describe('EventDialog', () => {
  beforeEach(() => {
    mockState.listLeads = vi.fn().mockResolvedValue([])
    mockState.createAppointment = vi.fn().mockResolvedValue({ appointment: { id: 'new-1' } })
    mockState.rescheduleAppointment = vi.fn().mockResolvedValue({ appointment: { id: 'a1' } })
    mockState.cancelAppointment = vi.fn().mockResolvedValue({ cancelled: true })
  })

  afterEach(() => { document.body.innerHTML = '' })

  it('mostra "Novo agendamento" quando não há evento (modo criação)', async () => {
    const wrapper = await mountDialog()
    expect(document.body.textContent).toContain('Novo agendamento')
    wrapper.unmount()
  })

  it('rejeita salvar sem título (validação client-side, não chama a API)', async () => {
    const wrapper = await mountDialog()
    await domButton('Salvar').trigger('click')
    await flushPromises()

    expect(mockState.createAppointment).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Informe um título.')
    wrapper.unmount()
  })

  it('cria um agendamento simples com título preenchido', async () => {
    const wrapper = await mountDialog()
    await domInput('Título').setValue('Reunião com cliente')

    await domButton('Salvar').trigger('click')
    await flushPromises()

    expect(mockState.createAppointment).toHaveBeenCalledTimes(1)
    const payload = mockState.createAppointment.mock.calls[0][0]
    expect(payload.title).toBe('Reunião com cliente')
    expect(wrapper.emitted('saved')).toBeTruthy()
    wrapper.unmount()
  })

  it('pré-preenche o formulário em modo edição', async () => {
    const event = {
      id: 'a1', title: 'Demo existente', description: 'Pauta', location: 'Sala 1', color: 'blue', all_day: false,
      leadId: null, leadName: '', start_time: '2026-08-03T10:00:00.000Z', end_time: '2026-08-03T10:30:00.000Z', guests: [],
    }
    const wrapper = await mountDialog({ event })
    expect(document.body.textContent).toContain('Editar agendamento')
    expect(domInput('Título').element.value).toBe('Demo existente')
    wrapper.unmount()
  })

  it('exclui um evento avulso (sem série) direto, sem diálogo de escopo', async () => {
    const event = {
      id: 'a1', title: 'Demo', description: '', location: '', color: null, all_day: false,
      leadId: null, leadName: '', start_time: '2026-08-03T10:00:00.000Z', end_time: '2026-08-03T10:30:00.000Z', guests: [],
    }
    const wrapper = await mountDialog({ event })
    await domButton('Excluir').trigger('click')
    await flushPromises()

    expect(mockState.cancelAppointment).toHaveBeenCalledWith('a1', { scope: 'this' })
    expect(wrapper.emitted('deleted')).toBeTruthy()
    wrapper.unmount()
  })

  it('pede o escopo antes de excluir um evento que faz parte de uma série', async () => {
    const event = {
      id: 'a2', title: 'Demo recorrente', description: '', location: '', color: null, all_day: false,
      leadId: null, leadName: '', start_time: '2026-08-03T10:00:00.000Z', end_time: '2026-08-03T10:30:00.000Z',
      guests: [], recurrence_parent_id: 'a1',
    }
    const wrapper = await mountDialog({ event })
    await domButton('Excluir').trigger('click')
    await flushPromises()

    expect(mockState.cancelAppointment).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('O que deseja excluir?')

    const allRadioLabel = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Todos os eventos da série')
    await new DOMWrapper(allRadioLabel).trigger('click')
    await domButton('Confirmar').trigger('click')
    await flushPromises()

    expect(mockState.cancelAppointment).toHaveBeenCalledWith('a2', { scope: 'all' })
    wrapper.unmount()
  })

  it('cancelar o diálogo de escopo não exclui nem trava o botão em loading', async () => {
    const event = {
      id: 'a2', title: 'Demo recorrente', description: '', location: '', color: null, all_day: false,
      leadId: null, leadName: '', start_time: '2026-08-03T10:00:00.000Z', end_time: '2026-08-03T10:30:00.000Z',
      guests: [], recurrence_parent_id: 'a1',
    }
    const wrapper = await mountDialog({ event })
    await domButton('Excluir').trigger('click')
    await flushPromises()

    // dois diálogos ficam empilhados (o principal + o de escopo) — o de escopo é o último "Cancelar" no DOM
    const cancelButtons = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Cancelar')
    await new DOMWrapper(cancelButtons[cancelButtons.length - 1]).trigger('click')
    await flushPromises()

    expect(mockState.cancelAppointment).not.toHaveBeenCalled()
    expect(wrapper.emitted('deleted')).toBeFalsy()
    wrapper.unmount()
  })

  it('envia guests e recurrence quando presentes no formulário (via alteração direta de estado interno pelo evento salvo)', async () => {
    const wrapper = await mountDialog()
    await domInput('Título').setValue('Reunião recorrente')
    await domButton('Salvar').trigger('click')
    await flushPromises()

    expect(mockState.createAppointment).toHaveBeenCalledTimes(1)
    const payload = mockState.createAppointment.mock.calls[0][0]
    // sem interação com o seletor de recorrência, o payload não deve incluir uma regra
    expect(payload.recurrence).toBeUndefined()
    expect(payload.guests).toBeUndefined()
    wrapper.unmount()
  })
})
