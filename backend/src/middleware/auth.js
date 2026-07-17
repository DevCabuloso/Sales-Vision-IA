import { verifyToken } from '../services/auth.js'
import { supabase, unwrap } from '../db/supabase.js'

// requireAuth roda em praticamente toda requisição autenticada da plataforma —
// sem cache, isso é uma ida ao Supabase por request só pra confirmar que o
// usuário ainda existe/está ativo, além do que a própria rota já consulta.
// TTL curto: uma desativação/exclusão de usuário demora no máximo isso pra
// valer (trade-off deliberado entre carga no banco e atualização instantânea).
const USER_CACHE_TTL_MS = 30_000
const userCache = new Map() // userId -> { user, expiresAt }

function getCachedUser(userId) {
  const entry = userCache.get(userId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    userCache.delete(userId)
    return null
  }
  return entry.user
}

function setCachedUser(userId, user) {
  userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS })
}

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

    let u = getCachedUser(payload.sub)
    if (!u) {
      const rows = unwrap(
        await supabase.from('users')
          .select('id, tenant_id, email, name, role, active, is_restricted, permissions')
          .eq('id', payload.sub)
          .limit(1)
      )
      u = rows?.[0] || null
      if (u) setCachedUser(payload.sub, u)
    }

    if (!u || !u.active) {
      return res.status(401).json({ error: 'Usuário inválido ou inativo.' })
    }
    req.user = {
      id: u.id, role: u.role, tenantId: u.tenant_id, email: u.email, name: u.name || u.email,
      isRestricted: !!u.is_restricted, permissions: u.permissions || null,
    }
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' })
  }
}

// Chamado por operators.js quando role/permissions/is_restricted/active mudam —
// sem isso, o cache de 30s (USER_CACHE_TTL_MS) deixaria um operador recém
// restringido continuar com acesso total por até 30s.
export function invalidateUserCache(userId) {
  userCache.delete(userId)
}

/**
 * Bloqueia o acesso a uma área da plataforma (chat/kanban/contatos/leads/
 * agenda/templates/broadcast) quando o operador está marcado como restrito
 * (`is_restricted`) e não tem a AÇÃO específica liberada naquela área. Donos
 * e admins do tenant nunca são restringíveis por essa checagem — a restrição
 * é uma ferramenta do admin para limitar agentes, não algo que se autoaplica.
 *
 * `areas` aceita uma string ou um array (ex.: ['leads', 'kanban']) quando a
 * mesma rota atende mais de uma tela do frontend — basta uma delas liberar
 * a ação. `action` é 'view' | 'create' | 'edit' | 'delete'.
 *
 * Compatibilidade: `permissions[area]` pode ainda estar no formato antigo
 * (booleano único, pré-migration_permissions_by_action.sql) para um usuário
 * criado bem no meio do deploy — nesse caso `true` libera qualquer ação.
 */
export function requirePermission(areas, action) {
  const areaList = Array.isArray(areas) ? areas : [areas]
  return (req, res, next) => {
    if (!req.user?.isRestricted) return next()
    if (req.user.role === 'owner' || req.user.role === 'admin') return next()
    const perms = req.user.permissions || {}
    const allowed = areaList.some((area) => {
      const areaPerms = perms[area]
      if (areaPerms === true) return true
      if (areaPerms && typeof areaPerms === 'object') return areaPerms[action] === true
      return false
    })
    if (allowed) return next()
    return res.status(403).json({ error: 'Você não tem permissão para acessar esta área.' })
  }
}

export function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Acesso restrito ao dono da plataforma.' })
  }
  next()
}

// Cache curto do status do tenant (suspenso/trial expirado) — mesmo racional de
// USER_CACHE_TTL_MS: evita ida ao Supabase em toda request, com defasagem pequena
// e aceitável entre o dono suspender um cliente e isso valer de fato.
const TENANT_CACHE_TTL_MS = 30_000
const tenantCache = new Map() // tenantId -> { status, trial_ends_at, expiresAt }

export function invalidateTenantStatusCache(tenantId) {
  tenantCache.delete(tenantId)
}

async function getTenantStatus(tenantId) {
  const cached = tenantCache.get(tenantId)
  if (cached && Date.now() <= cached.expiresAt) return cached
  const rows = unwrap(
    await supabase.from('tenants').select('status, trial_ends_at').eq('id', tenantId).limit(1)
  )
  const entry = { status: rows?.[0]?.status ?? null, trial_ends_at: rows?.[0]?.trial_ends_at ?? null, expiresAt: Date.now() + TENANT_CACHE_TTL_MS }
  tenantCache.set(tenantId, entry)
  return entry
}

export async function requireTenant(req, res, next) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ error: 'Esta rota exige um cliente (tenant).' })
  }
  try {
    const { status, trial_ends_at } = await getTenantStatus(req.user.tenantId)
    if (status === 'suspended') {
      return res.status(402).json({ error: 'Assinatura suspensa. Entre em contato com o suporte.' })
    }
    if (status === 'pending_payment') {
      return res.status(402).json({ error: 'Pagamento pendente. Finalize o checkout para acessar a plataforma.' })
    }
    if (status === 'trial' && trial_ends_at && new Date(trial_ends_at).getTime() < Date.now()) {
      return res.status(402).json({ error: 'Seu período de teste expirou. Entre em contato para continuar usando a plataforma.' })
    }
    next()
  } catch {
    // Falha ao checar status não deve derrubar a plataforma pro cliente — segue.
    next()
  }
}
