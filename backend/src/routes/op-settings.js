import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { invalidateTenantCache } from '../services/orchestrator.js'
import { logAudit } from '../services/usage.js'

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

// Schema derivado dinamicamente de DEFAULTS: cada chave é validada com o tipo
// primitivo do seu próprio default (boolean/number/string). Chaves fora de
// DEFAULTS são descartadas automaticamente pelo zod (comportamento padrão,
// não-strict), preservando o "salva só as chaves reconhecidas" de antes.
const settingsSchema = z.object(
  Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, def]) => {
      const type = typeof def === 'boolean' ? z.boolean() : typeof def === 'number' ? z.number() : z.string()
      return [key, type.optional()]
    })
  )
)

opSettingsRouter.get('/', async (req, res) => {
  try {
    const saved = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query('SELECT op_settings FROM tenants WHERE id = $1 LIMIT 1', [req.user.tenantId])
      return r.rows[0]?.op_settings || {}
    })
    res.json({ settings: { ...DEFAULTS, ...saved } })
  } catch {
    // coluna ainda não existe ou outro erro — retorna defaults sem travar
    res.json({ settings: { ...DEFAULTS } })
  }
})

opSettingsRouter.put('/', async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const patch = parsed.data
    await withTenant(req.user.tenantId, (client) =>
      client.query(
        'UPDATE tenants SET op_settings = $1::jsonb, updated_at = $2 WHERE id = $3',
        [JSON.stringify(patch), new Date().toISOString(), req.user.tenantId]
      )
    )
    invalidateTenantCache(req.user.tenantId)
    await logAudit(req.user.tenantId, req.user.id, 'op_settings', 'update', req.user.tenantId, patch)
    res.json({ settings: { ...DEFAULTS, ...patch } })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
