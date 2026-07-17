import { Router } from 'express'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const auditRouter = Router()
auditRouter.use(requireAuth, requireTenant)

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  }
  next()
}

// Convenção de logAudit() (services/usage.js): event_type = `audit.<entity>.<action>`.
function parseEventType(eventType) {
  const [, entity, action] = eventType.split('.')
  return { entity: entity || null, action: action || null }
}

// GET /api/audit-log?entity=lead&actorId=...&from=...&to=...&limit=&offset=
auditRouter.get('/', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200)
    const offset = parseInt(req.query.offset, 10) || 0

    const conditions = ['ue.tenant_id = $1', "ue.event_type LIKE 'audit.%'"]
    const values = [req.user.tenantId]

    if (req.query.entity) {
      values.push(`audit.${req.query.entity}.%`)
      conditions.push(`ue.event_type LIKE $${values.length}`)
    }
    if (req.query.actorId) {
      values.push(req.query.actorId)
      conditions.push(`ue.user_id = $${values.length}`)
    }
    if (req.query.from) {
      values.push(req.query.from)
      conditions.push(`ue.created_at >= $${values.length}`)
    }
    if (req.query.to) {
      values.push(req.query.to)
      conditions.push(`ue.created_at <= $${values.length}`)
    }

    values.push(limit, offset)

    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT ue.id, ue.event_type, ue.meta, ue.created_at, ue.user_id,
                u.name AS actor_name, u.email AS actor_email
         FROM usage_events ue
         LEFT JOIN users u ON u.id = ue.user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY ue.created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      )
      return r.rows
    })

    const entries = rows.map((r) => {
      const { entity, action } = parseEventType(r.event_type)
      return {
        id: r.id,
        entity,
        action,
        entityId: r.meta?.entityId ?? null,
        changes: r.meta?.changes ?? {},
        actorId: r.user_id,
        actorName: r.actor_name || r.actor_email || 'Desconhecido',
        createdAt: r.created_at,
      }
    })

    res.json({ entries, limit, offset })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
