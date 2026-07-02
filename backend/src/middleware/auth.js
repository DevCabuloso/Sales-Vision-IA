import { verifyToken } from '../services/auth.js'
import { supabase, unwrap } from '../db/supabase.js'

/**
 * Valida o token (httpOnly cookie OU Bearer header) e popula
 * req.user = { id, role, tenantId, email }.
 * Bearer header tem prioridade — usado por sessões de impersonação.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const headerToken = header.startsWith('Bearer ') ? header.slice(7) : null
    const cookieToken = req.cookies?.sdr_token || null
    const token = headerToken || cookieToken
    if (!token) return res.status(401).json({ error: 'Token ausente.' })

    const payload = verifyToken(token)
    const rows = unwrap(
      await supabase.from('users')
        .select('id, tenant_id, email, name, role, active')
        .eq('id', payload.sub)
        .limit(1)
    )
    const u = rows?.[0]
    if (!u || !u.active) {
      return res.status(401).json({ error: 'Usuário inválido ou inativo.' })
    }
    req.user = { id: u.id, role: u.role, tenantId: u.tenant_id, email: u.email, name: u.name || u.email }
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' })
  }
}

export function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Acesso restrito ao dono da plataforma.' })
  }
  next()
}

export function requireTenant(req, res, next) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ error: 'Esta rota exige um cliente (tenant).' })
  }
  next()
}
