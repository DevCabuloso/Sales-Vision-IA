import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { createEvent, cancelEvent, listEvents } from '../services/googleCalendar.js'
import { logUsage } from '../services/usage.js'

export const appointmentsRouter = Router()
appointmentsRouter.use(requireAuth, requireTenant)

// ─── GET /api/appointments ───
appointmentsRouter.get('/', async (req, res) => {
  const rows = unwrap(
    await supabase.from('appointments')
      .select('id, lead_id, lead_name, title, provider, external_id, start_time, end_time, meeting_link, status')
      .eq('tenant_id', req.user.tenantId)
      .order('start_time', { ascending: false })
  )
  res.json({ appointments: rows })
})

// ─── POST /api/appointments/sync ─── importa eventos do Google Calendar
appointmentsRouter.post('/sync', async (req, res) => {
  try {
    const timeMin = new Date()
    timeMin.setMonth(timeMin.getMonth() - 1) // 1 mês atrás
    const timeMax = new Date()
    timeMax.setMonth(timeMax.getMonth() + 3) // 3 meses à frente

    const events = await listEvents(req.user.tenantId, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 200,
      showDeleted: true,
    })

    // busca external_ids já existentes para não duplicar
    const existing = unwrap(
      await supabase.from('appointments').select('id, external_id, status')
        .eq('tenant_id', req.user.tenantId).not('external_id', 'is', null)
    )
    const existingMap = Object.fromEntries(existing.map((r) => [r.external_id, r]))

    let synced = 0
    for (const ev of events) {
      if (!ev.externalId) continue
      const status = ev.status === 'cancelled' ? 'cancelled' : 'scheduled'

      if (existingMap[ev.externalId]) {
        // atualiza dados que podem ter mudado
        unwrap(
          await supabase.from('appointments').update({
            title: ev.title || '(sem título)',
            start_time: ev.start,
            end_time: ev.end,
            meeting_link: ev.meetingLink || null,
            status,
          }).eq('id', existingMap[ev.externalId].id)
        )
      } else {
        // insere novo evento vindo do Google Calendar
        unwrap(
          await supabase.from('appointments').insert({
            tenant_id: req.user.tenantId,
            title: ev.title || '(sem título)',
            provider: 'google',
            external_id: ev.externalId,
            start_time: ev.start,
            end_time: ev.end,
            meeting_link: ev.meetingLink || null,
            status,
          })
        )
      }
      synced++
    }

    res.json({ synced })
  } catch (e) {
    const msg = e.message || ''
    console.error('[appointments/sync] erro:', msg)
    if (msg.includes('não conectado') || msg.includes('Google OAuth não configurado'))
      return res.json({ synced: 0, warning: 'Google Calendar não conectado. Reconecte em Integrações.' })
    if (msg.includes('invalid_grant') || msg.includes('Token has been expired') || msg.includes('token expired'))
      return res.json({ synced: 0, warning: 'Acesso ao Google Calendar expirado. Reconecte em Integrações.' })
    if (msg.includes('ENCRYPTION_KEY'))
      return res.status(500).json({ error: 'ENCRYPTION_KEY não configurada no servidor.' })
    res.status(500).json({ error: 'Falha ao sincronizar com Google Calendar: ' + msg })
  }
})

// ─── POST /api/appointments ───
const createSchema = z.object({
  title: z.string().min(1),
  leadName: z.string().optional(),
  leadId: z.string().uuid().optional(),
  start: z.string(),
  end: z.string(),
})

appointmentsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
  const d = parsed.data

  try {
    const ev = await createEvent(req.user.tenantId, {
      summary: d.title,
      description: 'Agendado pelo painel SDR IA.',
      start: d.start,
      end: d.end,
    })
    const row = unwrap(
      await supabase.from('appointments').insert({
        tenant_id: req.user.tenantId,
        lead_id: d.leadId || null,
        lead_name: d.leadName || null,
        title: d.title,
        provider: 'google',
        external_id: ev.externalId,
        start_time: d.start,
        end_time: d.end,
        meeting_link: ev.meetingLink,
        status: 'scheduled',
      }).select().single()
    )
    await logUsage(req.user.tenantId, req.user.id, 'appointment_created')
    res.status(201).json({ appointment: row, meetingLink: ev.meetingLink })
  } catch (e) {
    res.status(502).json({ error: 'Falha ao criar evento: ' + e.message })
  }
})

// ─── POST /api/appointments/:id/cancel ───
appointmentsRouter.post('/:id/cancel', async (req, res) => {
  const rows = unwrap(
    await supabase.from('appointments').select('external_id')
      .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
  )
  if (!rows.length) return res.status(404).json({ error: 'Reunião não encontrada.' })

  if (rows[0].external_id) {
    try {
      await cancelEvent(req.user.tenantId, rows[0].external_id)
    } catch (e) {
      console.warn('[appts] falha ao cancelar no Google:', e.message)
    }
  }
  unwrap(
    await supabase.from('appointments').update({ status: 'cancelled' })
      .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
  )
  res.json({ cancelled: true })
})
