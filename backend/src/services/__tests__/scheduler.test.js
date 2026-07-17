import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const POLL_MS = 20_000

const mockState = vi.hoisted(() => ({ box: {}, sendText: null, sendMedia: null, markSentByPlatform: null, logUsage: null, processBroadcast: null, dnsLookup: null, buildDailyReport: null, sendEmail: null }))

vi.mock('node:dns/promises', () => ({
  default: { lookup: (...args) => mockState.dnsLookup(...args) },
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../whatsapp/index.js', () => ({
  sendText: (...args) => mockState.sendText(...args),
  sendMedia: (...args) => mockState.sendMedia(...args),
}))

vi.mock('../orchestrator.js', () => ({
  markSentByPlatform: (...args) => mockState.markSentByPlatform(...args),
}))

vi.mock('../usage.js', () => ({
  logUsage: (...args) => mockState.logUsage(...args),
}))

vi.mock('../../routes/broadcast.js', () => ({
  processBroadcast: (...args) => mockState.processBroadcast(...args),
}))

vi.mock('../../routes/reports.js', () => ({
  buildDailyReport: (...args) => mockState.buildDailyReport(...args),
}))

vi.mock('../email.js', () => ({
  sendEmail: (...args) => mockState.sendEmail(...args),
}))

const { startScheduler } = await import('../scheduler.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

function updateCallsFor(table) {
  return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update')
}
function insertCallsFor(table) {
  return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert')
}

const emptyOtherQueues = {
  broadcast_campaigns: [{ data: [], error: null }],
  scheduled_messages: [{ data: [], error: null }],
  followup_enrollment_messages: [{ data: [], error: null }],
  appointment_reminders: [{ data: [], error: null }],
  webhook_deliveries: [{ data: [], error: null }],
  report_schedules: [{ data: [], error: null }],
}

describe('scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockState.sendText = vi.fn().mockResolvedValue(undefined)
    mockState.sendMedia = vi.fn().mockResolvedValue(undefined)
    mockState.markSentByPlatform = vi.fn()
    mockState.logUsage = vi.fn().mockResolvedValue(undefined)
    mockState.processBroadcast = vi.fn().mockResolvedValue(undefined)
    mockState.dnsLookup = vi.fn().mockResolvedValue({ address: '93.184.216.34' })
    mockState.buildDailyReport = vi.fn().mockResolvedValue({
      date: '2026-01-01',
      summary: { newLeads: 1, qualifiedNewLeads: 1, conversationsResolved: 1, appointmentsScheduled: 1, messages: { total: 5 } },
      byUser: [], funnel: [],
    })
    mockState.sendEmail = vi.fn().mockResolvedValue({ sent: true })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  async function runOneTick() {
    startScheduler()
    await vi.advanceTimersByTimeAsync(POLL_MS)
  }

  describe('campanhas de disparo em massa agendadas', () => {
    it('reivindica a campanha devida e dispara o processamento em background', async () => {
      setSupabase({
        ...emptyOtherQueues,
        broadcast_campaigns: [
          { data: [{ id: 'camp-1', tenant_id: 'tenant-1', content: 'Promoção!' }], error: null },
          { data: { id: 'camp-1' }, error: null }, // claim bem-sucedido
        ],
      })

      await runOneTick()

      expect(mockState.processBroadcast).toHaveBeenCalledWith('tenant-1', { id: 'camp-1', tenant_id: 'tenant-1', content: 'Promoção!' })
    })

    it('não dispara o processamento quando outro tick já reivindicou a campanha', async () => {
      setSupabase({
        ...emptyOtherQueues,
        broadcast_campaigns: [
          { data: [{ id: 'camp-2', tenant_id: 'tenant-1', content: 'Promoção!' }], error: null },
          { data: null, error: null }, // claim falhou (outro processo já pegou)
        ],
      })

      await runOneTick()

      expect(mockState.processBroadcast).not.toHaveBeenCalled()
    })
  })

  describe('mensagens agendadas (scheduled_messages)', () => {
    it('envia a mensagem agendada devida e registra o uso', async () => {
      setSupabase({
        ...emptyOtherQueues,
        scheduled_messages: [
          { data: [{ id: 'sched-1', tenant_id: 'tenant-1', lead_id: 'lead-1', text: 'Oi, tudo bem?' }], error: null },
          { data: { id: 'sched-1' }, error: null }, // claim
        ],
        leads: [{ data: [{ id: 'lead-1', phone: '5511988887777', human_takeover: false }], error: null }],
      })

      await runOneTick()

      expect(mockState.markSentByPlatform).toHaveBeenCalledWith('tenant-1', '5511988887777', 'Oi, tudo bem?')
      expect(mockState.sendText).toHaveBeenCalledWith('tenant-1', '5511988887777', 'Oi, tudo bem?')
      expect(mockState.logUsage).toHaveBeenCalledWith('tenant-1', null, 'message_sent', { by: 'scheduled' })
      const msgInsert = insertCallsFor('messages')[0]
      expect(msgInsert.args[0]).toMatchObject({ tenant_id: 'tenant-1', lead_id: 'lead-1', role: 'agent', text: 'Oi, tudo bem?' })
    })

    it('marca como failed quando o lead não tem telefone', async () => {
      setSupabase({
        ...emptyOtherQueues,
        scheduled_messages: [
          { data: [{ id: 'sched-2', tenant_id: 'tenant-1', lead_id: 'lead-2', text: 'Oi' }], error: null },
          { data: { id: 'sched-2' }, error: null },
        ],
        leads: [{ data: [{ id: 'lead-2', phone: null }], error: null }],
      })

      await runOneTick()

      expect(mockState.sendText).not.toHaveBeenCalled()
      const failUpdate = updateCallsFor('scheduled_messages').find((c) => c.args[0]?.status === 'failed')
      expect(failUpdate).toBeTruthy()
      expect(failUpdate.args[0].error).toBe('Lead sem telefone.')
    })

    it('não processa quando a reivindicação falha (já enviada por outro tick)', async () => {
      setSupabase({
        ...emptyOtherQueues,
        scheduled_messages: [
          { data: [{ id: 'sched-3', tenant_id: 'tenant-1', lead_id: 'lead-3', text: 'Oi' }], error: null },
          { data: null, error: null },
        ],
      })

      await runOneTick()

      expect(mockState.sendText).not.toHaveBeenCalled()
    })
  })

  describe('mensagens de acompanhamento (followup_enrollment_messages)', () => {
    it('envia mensagem de texto e marca o enrollment como completed quando não há mais pendentes', async () => {
      setSupabase({
        ...emptyOtherQueues,
        followup_enrollment_messages: [
          { data: [{ id: 'fm-1', tenant_id: 'tenant-1', lead_id: 'lead-1', enrollment_id: 'enr-1', text: 'Passando para lembrar!' }], error: null },
          { data: { id: 'fm-1' }, error: null }, // claim
          { data: [], error: null }, // checagem de pendentes restantes: nenhuma
        ],
        leads: [{ data: [{ id: 'lead-1', phone: '5511988887777', human_takeover: false }], error: null }],
      })

      await runOneTick()

      expect(mockState.sendText).toHaveBeenCalledWith('tenant-1', '5511988887777', 'Passando para lembrar!')
      expect(mockState.sendMedia).not.toHaveBeenCalled()
      const enrollmentUpdate = updateCallsFor('followup_enrollments').find((c) => c.args[0]?.status === 'completed')
      expect(enrollmentUpdate).toBeTruthy()
    })

    it('não marca o enrollment como completed quando ainda há mensagens pendentes', async () => {
      setSupabase({
        ...emptyOtherQueues,
        followup_enrollment_messages: [
          { data: [{ id: 'fm-2', tenant_id: 'tenant-1', lead_id: 'lead-1', enrollment_id: 'enr-2', text: 'Oi de novo' }], error: null },
          { data: { id: 'fm-2' }, error: null },
          { data: [{ id: 'fm-3' }], error: null }, // ainda há 1 pendente
        ],
        leads: [{ data: [{ id: 'lead-1', phone: '5511988887777', human_takeover: false }], error: null }],
      })

      await runOneTick()

      const enrollmentUpdate = updateCallsFor('followup_enrollments').find((c) => c.args[0]?.status === 'completed')
      expect(enrollmentUpdate).toBeFalsy()
    })

    it('envia mídia via fetch+sendMedia quando a mensagem tem media_url', async () => {
      setSupabase({
        ...emptyOtherQueues,
        followup_enrollment_messages: [
          { data: [{ id: 'fm-4', tenant_id: 'tenant-1', lead_id: 'lead-1', enrollment_id: 'enr-3', text: 'Confira o catálogo', media_url: 'https://cdn.exemplo.com/catalogo.pdf', media_type: 'document', media_mimetype: 'application/pdf', media_filename: 'catalogo.pdf' }], error: null },
          { data: { id: 'fm-4' }, error: null },
          { data: [], error: null },
        ],
        leads: [{ data: [{ id: 'lead-1', phone: '5511988887777', human_takeover: false }], error: null }],
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new TextEncoder().encode('conteudo-pdf').buffer }))

      await runOneTick()

      expect(mockState.markSentByPlatform).toHaveBeenCalledWith('tenant-1', '5511988887777', '[document]')
      expect(mockState.sendMedia).toHaveBeenCalledTimes(1)
      const mediaArgs = mockState.sendMedia.mock.calls[0][2]
      expect(mediaArgs.mimetype).toBe('application/pdf')
      expect(mediaArgs.filename).toBe('catalogo.pdf')
      expect(mockState.sendText).not.toHaveBeenCalled()

      vi.unstubAllGlobals()
    })

    it('marca a mensagem de acompanhamento como failed quando o lead não tem telefone', async () => {
      setSupabase({
        ...emptyOtherQueues,
        followup_enrollment_messages: [
          { data: [{ id: 'fm-5', tenant_id: 'tenant-1', lead_id: 'lead-2', enrollment_id: 'enr-4', text: 'Oi' }], error: null },
          { data: { id: 'fm-5' }, error: null },
        ],
        leads: [{ data: [{ id: 'lead-2', phone: null }], error: null }],
      })

      await runOneTick()

      const failUpdate = updateCallsFor('followup_enrollment_messages').find((c) => c.args[0]?.status === 'failed')
      expect(failUpdate).toBeTruthy()
      expect(failUpdate.args[0].error).toBe('Lead sem telefone.')
    })
  })

  describe('aviso de vencimento de mensalidade (billing reminder)', () => {
    it('não faz nada quando o horário atual não bate com o configurado', async () => {
      vi.setSystemTime(new Date('2026-07-14T11:00:00.000Z')) // 08:00 em São Paulo, config é 09:00
      setSupabase({
        ...emptyOtherQueues,
        platform_settings: [{ data: [{ billing_reminder_days_before: 3, billing_reminder_time: '09:00' }], error: null }],
      })

      await runOneTick()

      expect(insertCallsFor('notifications')).toHaveLength(0)
    })

    it('cria o aviso quando o vencimento cai exatamente N dias à frente, no horário configurado', async () => {
      vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z')) // 09:00 em São Paulo
      setSupabase({
        ...emptyOtherQueues,
        platform_settings: [{ data: [{ billing_reminder_days_before: 3, billing_reminder_time: '09:00' }], error: null }],
        tenants: [{ data: [{ id: 'tenant-1', name: 'Empresa X', next_billing_at: '2026-07-17T15:00:00.000Z', billing_notify_user_id: 'user-1' }], error: null }],
        notifications: [{ data: [], error: null }], // nenhum aviso pendente hoje ainda
      })

      await runOneTick()

      const insert = insertCallsFor('notifications')[0]
      expect(insert.args[0]).toMatchObject({ tenant_id: 'tenant-1', user_id: 'user-1', type: 'billing_reminder' })
    })

    it('não duplica quando já existe um aviso não resolvido criado hoje', async () => {
      vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'))
      setSupabase({
        ...emptyOtherQueues,
        platform_settings: [{ data: [{ billing_reminder_days_before: 3, billing_reminder_time: '09:00' }], error: null }],
        tenants: [{ data: [{ id: 'tenant-1', name: 'Empresa X', next_billing_at: '2026-07-17T15:00:00.000Z', billing_notify_user_id: 'user-1' }], error: null }],
        notifications: [{ data: [{ id: 'notif-1' }], error: null }],
      })

      await runOneTick()

      expect(insertCallsFor('notifications')).toHaveLength(0)
    })

    it('ignora tenants cujo vencimento não cai no dia alvo', async () => {
      vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'))
      setSupabase({
        ...emptyOtherQueues,
        platform_settings: [{ data: [{ billing_reminder_days_before: 3, billing_reminder_time: '09:00' }], error: null }],
        tenants: [{ data: [{ id: 'tenant-1', name: 'Empresa X', next_billing_at: '2026-08-01T15:00:00.000Z', billing_notify_user_id: 'user-1' }], error: null }],
      })

      await runOneTick()

      expect(insertCallsFor('notifications')).toHaveLength(0)
    })
  })

  describe('relatório semanal por e-mail (report_schedules)', () => {
    it('não envia quando o horário atual não bate com o configurado', async () => {
      vi.setSystemTime(new Date('2026-07-14T11:00:00.000Z')) // 08:00 em SP, config é 09:00
      setSupabase({
        ...emptyOtherQueues,
        report_schedules: [{ data: [{ tenant_id: 'tenant-1', recipients: ['dono@ex.com'], day_of_week: 2, hour: 9, minute: 0, timezone: 'America/Sao_Paulo', last_sent_at: null }], error: null }],
      })

      await runOneTick()

      expect(mockState.sendEmail).not.toHaveBeenCalled()
    })

    it('não envia quando o dia da semana não bate', async () => {
      vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z')) // terça (2) em SP
      setSupabase({
        ...emptyOtherQueues,
        report_schedules: [{ data: [{ tenant_id: 'tenant-1', recipients: ['dono@ex.com'], day_of_week: 1, hour: 9, minute: 0, timezone: 'America/Sao_Paulo', last_sent_at: null }], error: null }],
      })

      await runOneTick()

      expect(mockState.sendEmail).not.toHaveBeenCalled()
    })

    it('não envia quando não há destinatários configurados', async () => {
      vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'))
      setSupabase({
        ...emptyOtherQueues,
        report_schedules: [{ data: [{ tenant_id: 'tenant-1', recipients: [], day_of_week: 2, hour: 9, minute: 0, timezone: 'America/Sao_Paulo', last_sent_at: null }], error: null }],
      })

      await runOneTick()

      expect(mockState.sendEmail).not.toHaveBeenCalled()
    })

    it('não duplica quando já foi enviado hoje (last_sent_at)', async () => {
      vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'))
      setSupabase({
        ...emptyOtherQueues,
        report_schedules: [{ data: [{ tenant_id: 'tenant-1', recipients: ['dono@ex.com'], day_of_week: 2, hour: 9, minute: 0, timezone: 'America/Sao_Paulo', last_sent_at: '2026-07-14T09:00:05.000Z' }], error: null }],
      })

      await runOneTick()

      expect(mockState.sendEmail).not.toHaveBeenCalled()
    })

    it('monta e envia o relatório somando 7 dias, e atualiza last_sent_at', async () => {
      vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'))
      setSupabase({
        ...emptyOtherQueues,
        report_schedules: [{ data: [{ tenant_id: 'tenant-1', recipients: ['dono@ex.com'], day_of_week: 2, hour: 9, minute: 0, timezone: 'America/Sao_Paulo', last_sent_at: null }], error: null }],
        tenants: [{ data: [{ name: 'Empresa X' }], error: null }],
      })

      await runOneTick()

      expect(mockState.buildDailyReport).toHaveBeenCalledTimes(7)
      expect(mockState.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'dono@ex.com', subject: expect.stringContaining('Empresa X'),
      }))
      const scheduleUpdate = updateCallsFor('report_schedules').find((c) => c.args[0]?.last_sent_at)
      expect(scheduleUpdate).toBeTruthy()
    })
  })

  describe('lembretes de agendamento (appointment_reminders)', () => {
    it('cria a notificação pro responsável e marca o lembrete como disparado', async () => {
      setSupabase({
        ...emptyOtherQueues,
        appointment_reminders: [
          { data: [{ id: 'rem-1', tenant_id: 'tenant-1', appointment_id: 'appt-1' }], error: null },
          { data: { id: 'rem-1' }, error: null }, // claim
        ],
        appointments: [{ data: [{ tenant_id: 'tenant-1', title: 'Demo', lead_name: 'Ana', start_time: '2026-07-14T13:00:00.000Z', assignee_id: 'user-1', status: 'scheduled' }], error: null }],
        notifications: [{ data: [{ id: 'notif-1' }], error: null }],
      })

      await runOneTick()

      const insert = insertCallsFor('notifications')[0]
      expect(insert.args[0]).toMatchObject({ tenant_id: 'tenant-1', user_id: 'user-1', type: 'appointment_reminder' })
      const claimUpdate = updateCallsFor('appointment_reminders').find((c) => c.args[0]?.fired === true)
      expect(claimUpdate).toBeTruthy()
    })

    it('não notifica quando o agendamento foi cancelado', async () => {
      setSupabase({
        ...emptyOtherQueues,
        appointment_reminders: [
          { data: [{ id: 'rem-2', tenant_id: 'tenant-1', appointment_id: 'appt-2' }], error: null },
          { data: { id: 'rem-2' }, error: null },
        ],
        appointments: [{ data: [{ tenant_id: 'tenant-1', title: 'Demo', assignee_id: 'user-1', status: 'cancelled' }], error: null }],
      })

      await runOneTick()

      expect(insertCallsFor('notifications')).toHaveLength(0)
    })

    it('não processa quando outro tick já reivindicou o lembrete', async () => {
      setSupabase({
        ...emptyOtherQueues,
        appointment_reminders: [
          { data: [{ id: 'rem-3', tenant_id: 'tenant-1', appointment_id: 'appt-3' }], error: null },
          { data: null, error: null }, // claim falhou
        ],
      })

      await runOneTick()

      expect(insertCallsFor('notifications')).toHaveLength(0)
    })
  })
})
