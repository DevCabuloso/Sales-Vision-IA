import { Router } from 'express'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { invalidateTenantCache } from '../services/orchestrator.js'

export const opSettingsRouter = Router()
opSettingsRouter.use(requireAuth, requireTenant)

const DEFAULTS = {
  // Encerramento automático
  auto_close_enabled:         false,
  auto_close_minutes:         30,
  auto_close_message:         'Encerramos seu atendimento por inatividade. Estamos à disposição caso precise.',
  post_close_grace_minutes:   5,
  force_close_reason:         false,
  reopen_takes_ownership:     true,
  transfer_offline_tickets:   false,
  // Agentes
  allow_pause:                true,
  unpause_on_client_reply:    false,
  offline_on_tab_close:       false,
  sound_notifications:        true,
  limit_push_to_owner:        false,
  // Visibilidade
  hide_other_tickets:         false,
  hide_chatbot_tickets:       false,
  show_unassigned_tickets:    true,
  supervisor_as_agent:        false,
  kanban_private:             false,
  show_message_history:       true,
  preserve_contact_name:      false,
  // Ordenação / display
  list_by_last_message:       true,
  reverse_ticket_order:       false,
  show_tab_counters:          true,
  filter_old_tickets_days:    0,
  // Bot
  ignore_group_messages:      true,
  show_groups_to_all:         true,
  show_closed_to_all:         false,
  force_agent_on_status_change: false,
  call_message_enabled:       false,
  call_message_text:          'No momento não estamos aceitando ligações. Por favor, envie uma mensagem de texto.',
  // WABA
  waba_validate_contact:      false,
  waba_out_of_window:         false,
}

opSettingsRouter.get('/', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('tenants').select('op_settings').eq('id', req.user.tenantId).limit(1)
    )
    const saved = rows[0]?.op_settings || {}
    res.json({ settings: { ...DEFAULTS, ...saved } })
  } catch {
    // coluna ainda não existe ou outro erro — retorna defaults sem travar
    res.json({ settings: { ...DEFAULTS } })
  }
})

opSettingsRouter.put('/', async (req, res) => {
  try {
    const patch = {}
    for (const key of Object.keys(DEFAULTS)) {
      if (key in req.body) patch[key] = req.body[key]
    }
    unwrap(
      await supabase
        .from('tenants')
        .update({ op_settings: patch, updated_at: new Date().toISOString() })
        .eq('id', req.user.tenantId)
    )
    invalidateTenantCache(req.user.tenantId)
    res.json({ settings: { ...DEFAULTS, ...patch } })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
