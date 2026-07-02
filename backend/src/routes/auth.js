import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config/index.js'
import { supabase, unwrap } from '../db/supabase.js'
import { verifyPassword, hashPassword, signToken } from '../services/auth.js'
import { logUsage } from '../services/usage.js'
import { requireAuth } from '../middleware/auth.js'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
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
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.'),
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
      return res.status(401).json({ error: 'Credenciais inválidas.' })
    }

    // resolve o tenant (se houver) para nome/slug e checagem de suspensão
    let tenant = null
    if (user.tenant_id) {
      const t = unwrap(
        await supabase.from('tenants')
          .select('name, slug, status, feat_meta_api, feat_evolution_api, feat_hybrid, feat_google_cal, feat_broadcast, feat_kanban, feat_agenda, feat_contacts, feat_ia_config, feat_operators, feat_custom_apis')
          .eq('id', user.tenant_id).limit(1)
      )
      tenant = t?.[0] || null
    }
    if (user.role !== 'owner' && tenant?.status === 'suspended') {
      return res.status(403).json({ error: 'Conta suspensa. Contate o suporte.' })
    }

    const ok = await verifyPassword(parsed.data.password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas.' })

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
    const users = unwrap(
      await supabase
        .from('users')
        .insert({ tenant_id: tenant.id, email: normalizedEmail, password_hash, name, role: 'admin' })
        .select()
    )
    const user = users?.[0]
    if (!user) return res.status(500).json({ error: 'Erro ao criar usuário. Tente novamente.' })

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
      },
    })
  } catch (e) {
    console.error('[register]', e.message)
    res.status(500).json({ error: e.message || 'Erro interno. Tente novamente.' })
  }
})

// POST /api/auth/logout — limpa o cookie de sessão
authRouter.post('/logout', (req, res) => {
  res.clearCookie('sdr_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' })
  res.json({ ok: true })
})

// POST /api/auth/change-password
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Dados inválidos.' })
  }
  try {
    const users = unwrap(
      await supabase.from('users').select('password_hash').eq('id', req.user.id).limit(1)
    )
    if (!users.length) return res.status(404).json({ error: 'Usuário não encontrado.' })
    const ok = await verifyPassword(currentPassword, users[0].password_hash)
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta.' })
    await supabase.from('users').update({ password_hash: await hashPassword(newPassword) }).eq('id', req.user.id)
    res.json({ changed: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
