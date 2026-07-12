import { z } from 'zod'

// Espelha backend/src/routes/op-settings.js (DEFAULTS + settingsSchema).
// Mantém as duas cópias em sincronia manualmente — se DEFAULTS ganhar uma
// chave nova no backend, replique aqui também.
export const DEFAULTS = {
  auto_close_enabled:           false,
  auto_close_minutes:           30,
  auto_close_message:           'Encerramos seu atendimento por inatividade. Estamos à disposição caso precise.',
  post_close_grace_minutes:     5,
  force_close_reason:           false,
  reopen_takes_ownership:       true,
  transfer_offline_tickets:     false,
  allow_pause:                  true,
  unpause_on_client_reply:      false,
  offline_on_tab_close:         false,
  sound_notifications:          true,
  limit_push_to_owner:          false,
  hide_other_tickets:           false,
  hide_chatbot_tickets:         false,
  show_unassigned_tickets:      true,
  supervisor_as_agent:          false,
  kanban_private:               false,
  show_message_history:         true,
  preserve_contact_name:        false,
  list_by_last_message:         true,
  reverse_ticket_order:         false,
  show_tab_counters:            true,
  filter_old_tickets_days:      0,
  ignore_group_messages:        true,
  show_groups_to_all:           true,
  show_closed_to_all:           false,
  force_agent_on_status_change: false,
  call_message_enabled:         false,
  call_message_text:            'No momento não estamos aceitando ligações. Por favor, envie uma mensagem de texto.',
  waba_validate_contact:        false,
  waba_out_of_window:           false,
}

// Schema derivado dinamicamente de DEFAULTS, no mesmo espírito do backend:
// cada chave é validada com o tipo primitivo do seu próprio default.
export const opSettingsSchema = z.object(
  Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, def]) => {
      const type = typeof def === 'boolean' ? z.boolean() : typeof def === 'number' ? z.number() : z.string()
      return [key, type.optional()]
    })
  )
)
