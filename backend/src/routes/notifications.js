import { Router } from 'express'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth, requireTenant)

notificationsRouter.get('/', async (req, res) => {
  try {
    const minutes = Math.max(1, parseInt(req.query.minutes) || 30)
    const tenantId = req.user.tenantId

    // Busca mensagens das últimas 48h ordenadas por mais recente
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const messages = unwrap(
      await supabase
        .from('messages')
        .select('lead_id, role, text, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
    )

    // Última mensagem por lead (client-side grouping)
    const lastByLead = {}
    for (const msg of messages || []) {
      if (!lastByLead[msg.lead_id]) lastByLead[msg.lead_id] = msg
    }

    // Filtra: última mensagem é do lead e passou do tempo configurado
    const thresholdMs = minutes * 60 * 1000
    const now = Date.now()
    const unanswered = Object.values(lastByLead).filter(msg => {
      const age = now - new Date(msg.created_at).getTime()
      return msg.role === 'lead' && age >= thresholdMs
    })

    if (!unanswered.length) return res.json({ notifications: [] })

    // Busca dados dos leads
    const leadIds = unanswered.map(m => m.lead_id)
    const leads = unwrap(
      await supabase
        .from('leads')
        .select('id, name, phone')
        .in('id', leadIds)
        .eq('tenant_id', tenantId)
    )

    const leadMap = {}
    for (const l of leads || []) leadMap[l.id] = l

    const notifications = unanswered
      .map(msg => ({
        lead_id:     msg.lead_id,
        lead_name:   leadMap[msg.lead_id]?.name || null,
        lead_phone:  leadMap[msg.lead_id]?.phone || '—',
        last_message: (msg.text || '').slice(0, 120),
        minutes_ago: Math.floor((now - new Date(msg.created_at).getTime()) / 60000),
        created_at:  msg.created_at,
      }))
      .sort((a, b) => b.minutes_ago - a.minutes_ago)

    res.json({ notifications })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
