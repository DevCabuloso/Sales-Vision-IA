import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config/index.js'
import { supabase, unwrap } from '../db/supabase.js'
import { verifyPassword, hashPassword, signToken } from '../services/auth.js'
import { logUsage } from '../services/usage.js'
import { requireAuth } from '../middleware/auth.js'
import { passwordSchema } from '../utils/passwordSchema.js'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
}

export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const registerSchema = z.object({
  name: z.string().min(2),
  companyName: z.string().min(2),
  email: z.string().email(),
  password: passwordSchema,
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: passwordSchema,
})

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'E-mail ou senha inválidos.' })
  }
  const email = parsed.data.email.toLowerCase().trim()

  try {
    // busca o usuário
    const users = unwrap(
      await supabase.from('users').select('*').eq('email', email).limit(1)
    )
    const user = users?.[0]
    if (!user || !user.active) {
      // Evento de segurança: tentativa de login com e-mail inexistente/inativo.
      // Sem tenant/user resolvido ainda, então registra sem tenant_id/user_id —
      // o e-mail informado vai no meta para permitir detectar força-bruta depois.
      await logUsage(null, null, 'login_failed', { email, reason: !user ? 'not_found' : 'inactive' })
      return res.status(401).json({ error: 'Credenciais inválidas.' })
    }

    // resolve o tenant (se houver) para nome/slug e checagem de suspensão
    let tenant = null
    if (user.tenant_id) {
      const t = unwrap(
        await supabase.from('tenants')
          .select('name, slug, status, trial_ends_at, onboarding_completed, feat_meta_api, feat_evolution_api, feat_hybrid, feat_google_cal, feat_broadcast, feat_kanban, feat_agenda, feat_contacts, feat_ia_config, feat_operators, feat_custom_apis')
          .eq('id', user.tenant_id).limit(1)
      )
      tenant = t?.[0] || null
    }

    if (user.role !== 'owner' && tenant?.status === 'pending_payment') {
      return res.status(402).json({ error: 'Pagamento pendente. Finalize o pagamento para ativar sua conta.' })
    }

    // trial vencido: suspende de forma preguiçosa no login, sem depender de cron
    if (tenant?.status === 'trial' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date()) {
      await supabase.from('tenants').update({ status: 'suspended' }).eq('id', user.tenant_id)
      tenant.status = 'suspended'
    }

    if (user.role !== 'owner' && tenant?.status === 'suspended') {
      return res.status(403).json({ error: 'Conta suspensa. Contate o suporte.' })
    }

    const ok = await verifyPassword(parsed.data.password, user.password_hash)
    if (!ok) {
      await logUsage(user.tenant_id, user.id, 'login_failed', { email, reason: 'wrong_password' })
      return res.status(401).json({ error: 'Credenciais inválidas.' })
    }

    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id)
    await logUsage(user.tenant_id, user.id, 'login')

    const token = signToken({ sub: user.id, role: user.role, tenantId: user.tenant_id })
    res.cookie('sdr_token', token, COOKIE_OPTS)
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenant_id,
        tenantName: tenant?.name || null,
        tenantSlug: tenant?.slug || null,
        permissions: user.permissions || null,
        is_restricted: user.is_restricted || false,
        onboardingCompleted: tenant ? (tenant.onboarding_completed ?? true) : true,
        features: tenant ? {
          meta_api:    tenant.feat_meta_api    ?? false,
          evolution:   tenant.feat_evolution_api ?? false,
          hybrid:      tenant.feat_hybrid       ?? false,
          google_cal:  tenant.feat_google_cal   ?? true,
          broadcast:   tenant.feat_broadcast    ?? true,
          kanban:      tenant.feat_kanban       ?? true,
          agenda:      tenant.feat_agenda       ?? true,
          contacts:    tenant.feat_contacts     ?? true,
          ia_config:   tenant.feat_ia_config    ?? true,
          operators:   tenant.feat_operators    ?? true,
          custom_apis: tenant.feat_custom_apis  ?? false,
        } : null,
      },
    })
  } catch (e) {
    console.error('[login]', e.message)
    res.status(500).json({ error: e.message || 'Erro interno. Tente novamente.' })
  }
})

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos. Verifique os campos.' })
  }
  const { name, companyName, email, password } = parsed.data
  const normalizedEmail = email.toLowerCase().trim()

  try {
    // verifica se e-mail já existe
    const existing = unwrap(
      await supabase.from('users').select('id').eq('email', normalizedEmail).limit(1)
    )
    if (existing?.length) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' })
    }

    // gera slug único a partir do nome da empresa
    const baseSlug = companyName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const slugCheck = unwrap(
      await supabase.from('tenants').select('slug').like('slug', `${baseSlug}%`)
    )
    const slug = slugCheck?.length ? `${baseSlug}-${slugCheck.length}` : baseSlug

    // cria tenant
    const tenants = unwrap(
      await supabase
        .from('tenants')
        .insert({ name: companyName, slug, status: 'trial', plan: 'trial' })
        .select()
    )
    const tenant = tenants?.[0]
    if (!tenant) return res.status(500).json({ error: 'Erro ao criar conta. Tente novamente.' })

    // cria usuário admin do tenant
    const password_hash = await hashPassword(password)
    const { data: userRows, error: userErr } = await supabase
      .from('users')
      .insert({ tenant_id: tenant.id, email: normalizedEmail, password_hash, name, role: 'admin' })
      .select()
    const user = userRows?.[0]
    // sem transação multi-tabela via REST: se a criação do usuário falhar, desfaz o
    // tenant recém-criado para não deixar um tenant órfão (sem nenhum usuário) no banco.
    if (userErr || !user) {
      await supabase.from('tenants').delete().eq('id', tenant.id)
      if (userErr?.code === '23505') return res.status(409).json({ error: 'Este e-mail já está cadastrado.' })
      return res.status(500).json({ error: 'Erro ao criar usuário. Tente novamente.' })
    }

    await logUsage(tenant.id, user.id, 'register')

    const token = signToken({ sub: user.id, role: user.role, tenantId: user.tenant_id })
    res.cookie('sdr_token', token, COOKIE_OPTS)
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenant_id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        onboardingCompleted: true,
      },
    })
  } catch (e) {
    console.error('[register]', e.message)
    res.status(500).json({ error: e.message || 'Erro interno. Tente novamente.' })
  }
})

// PATCH /api/auth/onboarding-complete — marca o wizard de onboarding como concluído
authRouter.patch('/onboarding-complete', requireAuth, async (req, res) => {
  if (!req.user.tenantId) return res.status(403).json({ error: 'Esta rota exige um cliente (tenant).' })
  try {
    await supabase.from('tenants').update({ onboarding_completed: true }).eq('id', req.user.tenantId)
    res.json({ onboardingCompleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/auth/logout — limpa o cookie de sessão
authRouter.post('/logout', (req, res) => {
  res.clearCookie('sdr_token', { httpOnly: true, secure: config.env === 'production', sameSite: 'lax', path: '/' })
  res.json({ ok: true })
})

// POST /api/auth/change-password
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const { currentPassword, newPassword } = parsed.data
  try {
    const users = unwrap(
      await supabase.from('users').select('password_hash').eq('id', req.user.id).limit(1)
    )
    if (!users.length) return res.status(404).json({ error: 'Usuário não encontrado.' })
    const ok = await verifyPassword(currentPassword, users[0].password_hash)
    if (!ok) {
      await logUsage(req.user.tenantId, req.user.id, 'password_change_failed')
      return res.status(401).json({ error: 'Senha atual incorreta.' })
    }
    await supabase.from('users').update({ password_hash: await hashPassword(newPassword) }).eq('id', req.user.id)
    await logUsage(req.user.tenantId, req.user.id, 'password_changed')
    res.json({ changed: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
