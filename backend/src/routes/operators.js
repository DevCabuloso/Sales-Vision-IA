import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { hashPassword } from '../services/auth.js'

export const operatorsRouter = Router()
operatorsRouter.use(requireAuth, requireTenant)

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  }
  next()
}

const DEFAULT_PERMISSIONS = {
  chat: true, kanban: true, contatos: true,
  leads: true, agenda: true, templates: true, broadcast: true,
}

const schema = z.object({
  name:          z.string().min(1).max(100),
  email:         z.string().email(),
  password:      z.string().min(6).optional(),
  role:          z.enum(['admin', 'agent']).default('agent'),
  active:        z.boolean().optional().default(true),
  phone:         z.string().max(30).optional().nullable(),
  is_restricted: z.boolean().optional().default(false),
  permissions:   z.record(z.boolean()).optional(),
})

const SELECT_COLS = 'id, name, email, phone, role, active, is_restricted, permissions, last_login_at, created_at'

// GET /api/operators
operatorsRouter.get('/', async (req, res) => {
  try {
    const users = unwrap(
      await supabase.from('users').select(SELECT_COLS)
        .eq('tenant_id', req.user.tenantId)
        .neq('role', 'owner')
        .order('created_at', { ascending: false })
    )
    res.json({ operators: users })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/operators/dashboard
operatorsRouter.get('/dashboard', async (req, res) => {
  try {
    const users = unwrap(
      await supabase.from('users').select('id, name, email, role, active')
        .eq('tenant_id', req.user.tenantId).neq('role', 'owner')
    )

    const from = new Date()
    from.setDate(from.getDate() - 30)

    const events = unwrap(
      await supabase.from('usage_events').select('user_id, event_type, created_at')
        .eq('tenant_id', req.user.tenantId)
        .gte('created_at', from.toISOString())
        .in('event_type', ['message_sent', 'lead_created', 'appointment_created', 'human_takeover'])
    )

    const metrics = users.map((u) => {
      const userEvents = events.filter((e) => e.user_id === u.id)
      return {
        ...u,
        messages_sent: userEvents.filter((e) => e.event_type === 'message_sent').length,
        leads_handled: userEvents.filter((e) => e.event_type === 'lead_created').length,
        appointments:  userEvents.filter((e) => e.event_type === 'appointment_created').length,
        takeovers:     userEvents.filter((e) => e.event_type === 'human_takeover').length,
      }
    })

    res.json({ metrics })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/operators
operatorsRouter.post('/', requireAdmin, async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  if (!parsed.data.password) return res.status(400).json({ error: 'Senha obrigatória.' })

  try {
    const existing = unwrap(
      await supabase.from('users').select('id').eq('email', parsed.data.email).limit(1)
    )
    if (existing.length) return res.status(409).json({ error: 'E-mail já cadastrado.' })

    const perms = parsed.data.role === 'admin'
      ? DEFAULT_PERMISSIONS
      : (parsed.data.permissions ?? DEFAULT_PERMISSIONS)

    const row = unwrap(
      await supabase.from('users').insert({
        tenant_id:     req.user.tenantId,
        name:          parsed.data.name,
        email:         parsed.data.email.toLowerCase(),
        password_hash: await hashPassword(parsed.data.password),
        role:          parsed.data.role,
        active:        parsed.data.active,
        phone:         parsed.data.phone || null,
        is_restricted: parsed.data.is_restricted ?? false,
        permissions:   perms,
      }).select(SELECT_COLS).single()
    )
    res.status(201).json({ operator: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/operators/:id
operatorsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const partial = schema.omit({ password: true }).partial().safeParse(req.body)
  if (!partial.success) return res.status(400).json({ error: partial.error.issues[0].message })

  try {
    const update = { ...partial.data }
    if (update.role === 'admin') update.permissions = DEFAULT_PERMISSIONS

    if (update.email) {
      update.email = update.email.toLowerCase()
      const existing = await supabase.from('users').select('id').eq('email', update.email).neq('id', req.params.id).limit(1)
      if (existing.data?.length) return res.status(409).json({ error: 'Este e-mail já está em uso.' })
    }

    const row = unwrap(
      await supabase.from('users').update(update)
        .eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
        .neq('role', 'owner')
        .select(SELECT_COLS).single()
    )
    res.json({ operator: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/operators/:id/reset-password
operatorsRouter.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres.' })
  }
  try {
    await supabase.from('users').update({ password_hash: await hashPassword(password) })
      .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).neq('role', 'owner')
    res.json({ reset: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/operators/:id
operatorsRouter.delete('/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Você não pode se excluir.' })
  }
  try {
    await supabase.from('users').delete()
      .eq('id', req.params.id).eq('tenant_id', req.user.tenantId).neq('role', 'owner')
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
