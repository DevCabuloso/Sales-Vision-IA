import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant, invalidateUserCache } from '../middleware/auth.js'
import { hashPassword } from '../services/auth.js'
import { passwordSchema } from '../utils/passwordSchema.js'
import { logAudit } from '../services/usage.js'

export const operatorsRouter = Router()
operatorsRouter.use(requireAuth, requireTenant)

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  }
  next()
}

// Cada área controla 4 ações independentes (ver/criar/editar/excluir) — ver
// middleware/auth.js requirePermission() e migration_permissions_by_action.sql
// (conversão do formato antigo, boolean único por área).
const FULL_ACCESS = { view: true, create: true, edit: true, delete: true }

const DEFAULT_PERMISSIONS = {
  chat: { ...FULL_ACCESS }, kanban: { ...FULL_ACCESS }, contatos: { ...FULL_ACCESS },
  leads: { ...FULL_ACCESS }, agenda: { ...FULL_ACCESS }, templates: { ...FULL_ACCESS }, broadcast: { ...FULL_ACCESS },
}

const areaPermSchema = z.object({
  view:   z.boolean().optional(),
  create: z.boolean().optional(),
  edit:   z.boolean().optional(),
  delete: z.boolean().optional(),
})

const schema = z.object({
  name:          z.string().min(1).max(100),
  email:         z.string().email(),
  password:      passwordSchema.optional(),
  role:          z.enum(['admin', 'agent']).default('agent'),
  active:        z.boolean().optional().default(true),
  phone:         z.string().max(30).optional().nullable(),
  is_restricted: z.boolean().optional().default(false),
  permissions:   z.record(areaPermSchema).optional(),
})

const SELECT_COLS = 'id, name, email, phone, role, active, is_restricted, permissions, last_login_at, created_at'

// GET /api/operators
operatorsRouter.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT ${SELECT_COLS} FROM users WHERE tenant_id = $1 AND role != 'owner' ORDER BY created_at DESC`,
        [req.user.tenantId]
      )
      return r.rows
    })
    res.json({ operators: users })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/operators/dashboard
operatorsRouter.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const { users, events } = await withTenant(req.user.tenantId, async (client) => {
      const from = new Date()
      from.setDate(from.getDate() - 30)

      const [usersR, eventsR] = await Promise.all([
        client.query(
          "SELECT id, name, email, role, active FROM users WHERE tenant_id = $1 AND role != 'owner'",
          [req.user.tenantId]
        ),
        client.query(
          `SELECT user_id, event_type, created_at FROM usage_events
           WHERE tenant_id = $1 AND created_at >= $2
           AND event_type = ANY($3::text[])`,
          [req.user.tenantId, from.toISOString(), ['message_sent', 'lead_created', 'appointment_created', 'human_takeover']]
        ),
      ])
      return { users: usersR.rows, events: eventsR.rows }
    })

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
    // Checagem GLOBAL (todos os tenants) — users.email tem UNIQUE constraint
    // no banco sem escopo de tenant, então precisa do client service_role
    // (RLS restringiria essa leitura só ao tenant atual, mascarando conflito
    // com e-mail de outro cliente até o INSERT falhar de forma menos clara).
    const existing = unwrap(
      await supabase.from('users').select('id').eq('email', parsed.data.email).limit(1)
    )
    if (existing.length) return res.status(409).json({ error: 'E-mail já cadastrado.' })

    const perms = parsed.data.role === 'admin'
      ? DEFAULT_PERMISSIONS
      : (parsed.data.permissions ?? DEFAULT_PERMISSIONS)

    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO users (tenant_id, name, email, password_hash, role, active, phone, is_restricted, permissions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING ${SELECT_COLS}`,
        [
          req.user.tenantId,
          parsed.data.name,
          parsed.data.email.toLowerCase(),
          await hashPassword(parsed.data.password),
          parsed.data.role,
          parsed.data.active,
          parsed.data.phone || null,
          parsed.data.is_restricted ?? false,
          JSON.stringify(perms),
        ]
      )
      return r.rows[0]
    })
    await logAudit(req.user.tenantId, req.user.id, 'operator', 'create', row.id, { role: row.role })
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
      // Mesma checagem global do POST / — ver comentário acima.
      const existing = unwrap(
        await supabase.from('users').select('id').eq('email', update.email).neq('id', req.params.id).limit(1)
      )
      if (existing.length) return res.status(409).json({ error: 'Este e-mail já está em uso.' })
    }

    const row = await withTenant(req.user.tenantId, async (client) => {
      const columns = Object.keys(update)
      const setClauses = columns.map((c, i) => c === 'permissions' ? `${c} = $${i + 1}::jsonb` : `${c} = $${i + 1}`)
      const values = columns.map((c) => c === 'permissions' ? JSON.stringify(update[c]) : update[c])
      values.push(req.params.id, req.user.tenantId)
      const r = await client.query(
        `UPDATE users SET ${setClauses.join(', ')}
         WHERE id = $${columns.length + 1} AND tenant_id = $${columns.length + 2} AND role != 'owner'
         RETURNING ${SELECT_COLS}`,
        values
      )
      return r.rows[0]
    })

    // Evento de segurança/auditoria: mudança de permissão/role/status de outro
    // usuário é sensível o bastante para registrar quem mudou o quê, mesmo sem
    // um sistema de auditoria completo — cobre só os campos realmente sensíveis.
    const sensitiveChange = {}
    for (const key of ['role', 'permissions', 'is_restricted', 'active']) {
      if (key in update) sensitiveChange[key] = update[key]
    }
    if (Object.keys(sensitiveChange).length) {
      await logAudit(req.user.tenantId, req.user.id, 'operator', 'update', req.params.id, sensitiveChange)
      // sem isso, requireAuth continuaria usando o req.user cacheado (role/
      // permissions/is_restricted antigos) por até 30s após a mudança.
      invalidateUserCache(req.params.id)
    }

    res.json({ operator: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const resetPasswordSchema = z.object({ password: passwordSchema })

// POST /api/operators/:id/reset-password
operatorsRouter.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  try {
    const passwordHash = await hashPassword(parsed.data.password)
    await withTenant(req.user.tenantId, (client) =>
      client.query(
        "UPDATE users SET password_hash = $1 WHERE id = $2 AND tenant_id = $3 AND role != 'owner'",
        [passwordHash, req.params.id, req.user.tenantId]
      )
    )
    await logAudit(req.user.tenantId, req.user.id, 'operator', 'password_reset', req.params.id)
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
    await withTenant(req.user.tenantId, (client) =>
      client.query(
        "DELETE FROM users WHERE id = $1 AND tenant_id = $2 AND role != 'owner'",
        [req.params.id, req.user.tenantId]
      )
    )
    invalidateUserCache(req.params.id)
    await logAudit(req.user.tenantId, req.user.id, 'operator', 'delete', req.params.id)
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
