import { Router } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { supabase, unwrap } from '../db/supabase.js'
import { hashPassword } from '../services/auth.js'
import { requireAuth, requireOwner, invalidateTenantStatusCache } from '../middleware/auth.js'
import { config } from '../config/index.js'
import { passwordSchema } from '../utils/passwordSchema.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireOwner)

const featuresSchema = z.object({
  feat_meta_api:      z.boolean().optional(),
  feat_evolution_api: z.boolean().optional(),
  feat_hybrid:        z.boolean().optional(),
  feat_google_cal:    z.boolean().optional(),
  feat_broadcast:     z.boolean().optional(),
  feat_kanban:        z.boolean().optional(),
  feat_agenda:        z.boolean().optional(),
  feat_contacts:      z.boolean().optional(),
  feat_ia_config:     z.boolean().optional(),
  feat_operators:     z.boolean().optional(),
  feat_custom_apis:   z.boolean().optional(),
}).partial()

// ── Clientes ──────────────────────────────────────────────────────────────────

adminRouter.get('/clients', async (req, res) => {
  const clients = unwrap(await supabase.rpc('admin_clients_overview'))
  res.json({ clients })
})

adminRouter.get('/clients/:id', async (req, res) => {
  const t = unwrap(
    await supabase.from('tenants').select('*').eq('id', req.params.id).limit(1)
  )
  if (!t.length) return res.status(404).json({ error: 'Cliente não encontrado.' })
  const users = unwrap(
    await supabase.from('users')
      .select('id, email, name, role, active, last_login_at, created_at')
      .eq('tenant_id', req.params.id)
      .order('created_at', { ascending: true })
  )
  const integrations = unwrap(
    await supabase.from('integrations')
      .select('provider, status, connected_at, meta')
      .eq('tenant_id', req.params.id)
  )
  res.json({ client: t[0], users, integrations })
})

const createClientSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'slug: apenas minúsculas, números e hífen'),
  plan: z.enum(['trial', 'starter', 'pro', 'enterprise']).default('trial'),
  adminEmail: z.string().email(),
  adminPassword: passwordSchema,
  adminName: z.string().optional(),
  features: featuresSchema.optional(),
  max_leads: z.number().int().positive().optional(),
})

adminRouter.post('/clients', async (req, res) => {
  const parsed = createClientSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })
  }
  const d = parsed.data
  const f = d.features || {}

  const { data: tenant, error: tErr } = await supabase.from('tenants').insert({
    name: d.name, slug: d.slug, plan: d.plan, status: 'active',
    feat_meta_api:      f.feat_meta_api      ?? false,
    feat_evolution_api: f.feat_evolution_api  ?? false,
    feat_hybrid:        f.feat_hybrid         ?? false,
    feat_google_cal:    f.feat_google_cal     ?? true,
    feat_broadcast:     f.feat_broadcast      ?? true,
    feat_kanban:        f.feat_kanban         ?? true,
    feat_agenda:        f.feat_agenda         ?? true,
    feat_contacts:      f.feat_contacts       ?? true,
    feat_ia_config:     f.feat_ia_config      ?? true,
    feat_operators:     f.feat_operators      ?? true,
    feat_custom_apis:   f.feat_custom_apis    ?? false,
    max_leads: d.max_leads ?? 1000,
  }).select().single()

  if (tErr) {
    if (tErr.code === '23505') return res.status(409).json({ error: 'Slug já existe.' })
    return res.status(500).json({ error: tErr.message })
  }

  const hash = await hashPassword(d.adminPassword)
  const { error: uErr } = await supabase.from('users').insert({
    tenant_id: tenant.id,
    email: d.adminEmail.toLowerCase().trim(),
    password_hash: hash,
    name: d.adminName || d.name,
    role: 'admin',
  })

  if (uErr) {
    await supabase.from('tenants').delete().eq('id', tenant.id)
    if (uErr.code === '23505') return res.status(409).json({ error: 'E-mail já existe.' })
    return res.status(500).json({ error: uErr.message })
  }

  res.status(201).json({ client: tenant })
})

adminRouter.patch('/clients/:id/features', async (req, res) => {
  const parsed = featuresSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Funções inválidas.', details: parsed.error.flatten() })
  }
  if (!Object.keys(parsed.data).length) return res.status(400).json({ error: 'Nenhuma função informada.' })

  const rows = unwrap(
    await supabase.from('tenants')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select()
  )
  if (!rows.length) return res.status(404).json({ error: 'Cliente não encontrado.' })
  res.json({ client: rows[0] })
})

const clientStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'trial']),
})

adminRouter.patch('/clients/:id/status', async (req, res) => {
  const parsed = clientStatusSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Status inválido.' })
  }
  const { status } = parsed.data
  const rows = unwrap(
    await supabase.from('tenants')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select()
  )
  if (!rows.length) return res.status(404).json({ error: 'Cliente não encontrado.' })
  invalidateTenantStatusCache(req.params.id)
  res.json({ client: rows[0] })
})

const renewClientSchema = z.object({
  days: z.number().int().positive().max(366).optional(),
  next_billing_at: z.string().datetime().optional(),
}).refine((d) => d.days || d.next_billing_at, { message: 'Informe "days" ou "next_billing_at".' })

adminRouter.patch('/clients/:id/renew', async (req, res) => {
  const parsed = renewClientSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const { days, next_billing_at } = parsed.data

  let nextBillingAt = next_billing_at
  if (!nextBillingAt) {
    const current = unwrap(
      await supabase.from('tenants').select('next_billing_at').eq('id', req.params.id).limit(1)
    )
    if (!current.length) return res.status(404).json({ error: 'Cliente não encontrado.' })
    const base = current[0].next_billing_at && new Date(current[0].next_billing_at).getTime() > Date.now()
      ? new Date(current[0].next_billing_at)
      : new Date()
    nextBillingAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
  }

  const rows = unwrap(
    await supabase.from('tenants')
      .update({ next_billing_at: nextBillingAt, payment_status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select()
  )
  if (!rows.length) return res.status(404).json({ error: 'Cliente não encontrado.' })
  res.json({ client: rows[0] })
})

adminRouter.patch('/clients/:id', async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    plan: z.enum(['trial', 'starter', 'pro', 'enterprise']).optional(),
    max_leads: z.number().int().positive().optional(),
  }).partial()
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
  if (!Object.keys(parsed.data).length) return res.status(400).json({ error: 'Nada para atualizar.' })

  const rows = unwrap(
    await supabase.from('tenants')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select()
  )
  if (!rows.length) return res.status(404).json({ error: 'Cliente não encontrado.' })
  res.json({ client: rows[0] })
})

adminRouter.delete('/clients/:id', async (req, res) => {
  unwrap(await supabase.from('tenants').delete().eq('id', req.params.id))
  res.json({ deleted: true })
})

// ── Usuários ──────────────────────────────────────────────────────────────────

adminRouter.get('/users', async (req, res) => {
  const { tenant } = req.query
  let q = supabase.from('users')
    .select('id, email, name, role, active, tenant_id, last_login_at, created_at')
    .neq('role', 'owner')
    .order('created_at', { ascending: false })
    .limit(5000)

  if (tenant) q = q.eq('tenant_id', tenant)

  const users = unwrap(await q)

  // enriquecer com nomes dos tenants
  const tenantIds = [...new Set(users.map((u) => u.tenant_id).filter(Boolean))]
  let tenantMap = {}
  if (tenantIds.length) {
    const tenants = unwrap(
      await supabase.from('tenants').select('id, name, slug').in('id', tenantIds)
    )
    tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]))
  }

  const enriched = users.map((u) => ({
    ...u,
    tenant: tenantMap[u.tenant_id] || null,
  }))

  res.json({ users: enriched })
})

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: passwordSchema,
  role: z.enum(['admin', 'agent']).default('agent'),
})

adminRouter.post('/clients/:id/users', async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })
  const d = parsed.data

  const tenant = unwrap(
    await supabase.from('tenants').select('id').eq('id', req.params.id).limit(1)
  )
  if (!tenant.length) return res.status(404).json({ error: 'Cliente não encontrado.' })

  const hash = await hashPassword(d.password)
  const { data, error } = await supabase.from('users').insert({
    tenant_id: req.params.id,
    email: d.email.toLowerCase().trim(),
    password_hash: hash,
    name: d.name,
    role: d.role,
  }).select('id, email, name, role, active, created_at').single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'E-mail já existe.' })
    return res.status(500).json({ error: error.message })
  }
  res.status(201).json({ user: data })
})

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'agent']).optional(),
  active: z.boolean().optional(),
}).partial()

adminRouter.patch('/users/:id', async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
  if (!Object.keys(parsed.data).length) return res.status(400).json({ error: 'Nada para atualizar.' })

  const rows = unwrap(
    await supabase.from('users')
      .update({ ...parsed.data })
      .eq('id', req.params.id)
      .neq('role', 'owner')
      .select('id, email, name, role, active')
  )
  if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' })
  res.json({ user: rows[0] })
})

adminRouter.delete('/users/:id', async (req, res) => {
  unwrap(
    await supabase.from('users').delete().eq('id', req.params.id).neq('role', 'owner')
  )
  res.json({ deleted: true })
})

const resetPasswordSchema = z.object({ password: passwordSchema })

adminRouter.post('/users/:id/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const hash = await hashPassword(parsed.data.password)
  const rows = unwrap(
    await supabase.from('users')
      .update({ password_hash: hash })
      .eq('id', req.params.id)
      .neq('role', 'owner')
      .select('id')
  )
  if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' })
  res.json({ updated: true })
})

// ── Superadmins (owners) ──────────────────────────────────────────────────────

adminRouter.get('/owners', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('users')
        .select('id, email, name, active, created_at, last_login_at')
        .eq('role', 'owner')
        .order('created_at', { ascending: true })
    )
    res.json({ owners: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const createOwnerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: passwordSchema,
})

adminRouter.post('/owners', async (req, res) => {
  const parsed = createOwnerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })
  const { email, name, password } = parsed.data
  const hash = await hashPassword(password)
  const { data, error } = await supabase.from('users').insert({
    email: email.toLowerCase().trim(),
    name,
    password_hash: hash,
    role: 'owner',
    active: true,
    tenant_id: null,
  }).select('id, email, name, active, created_at').single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'E-mail já cadastrado.' })
    return res.status(500).json({ error: error.message })
  }
  res.status(201).json({ owner: data })
})

adminRouter.post('/owners/:id/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const hash = await hashPassword(parsed.data.password)
  const rows = unwrap(
    await supabase.from('users')
      .update({ password_hash: hash })
      .eq('id', req.params.id).eq('role', 'owner').select('id')
  )
  if (!rows.length) return res.status(404).json({ error: 'Superadmin não encontrado.' })
  res.json({ updated: true })
})

adminRouter.delete('/owners/:id', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Não é possível excluir a própria conta.' })
  }
  unwrap(
    await supabase.from('users').delete().eq('id', req.params.id).eq('role', 'owner')
  )
  res.json({ deleted: true })
})

// ── Impersonation ─────────────────────────────────────────────────────────────

const TENANT_FEATURE_COLUMNS = 'name, slug, feat_meta_api, feat_evolution_api, feat_hybrid, feat_google_cal, feat_broadcast, feat_kanban, feat_agenda, feat_contacts, feat_ia_config, feat_operators, feat_custom_apis'

function buildImpersonationPayload(tenant, tenantId, targetUser) {
  const token = jwt.sign(
    { sub: targetUser.id, role: targetUser.role, tenantId },
    config.jwt.secret,
    { expiresIn: '1h' }
  )

  return {
    token,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
      tenantId,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      permissions: targetUser.permissions || null,
      is_restricted: targetUser.is_restricted || false,
      features: {
        meta_api:    tenant.feat_meta_api      ?? false,
        evolution:   tenant.feat_evolution_api ?? false,
        hybrid:      tenant.feat_hybrid        ?? false,
        google_cal:  tenant.feat_google_cal    ?? true,
        broadcast:   tenant.feat_broadcast     ?? true,
        kanban:      tenant.feat_kanban        ?? true,
        agenda:      tenant.feat_agenda        ?? true,
        contacts:    tenant.feat_contacts      ?? true,
        ia_config:   tenant.feat_ia_config     ?? true,
        operators:   tenant.feat_operators     ?? true,
        custom_apis: tenant.feat_custom_apis   ?? false,
      },
    },
  }
}

adminRouter.post('/clients/:id/impersonate', async (req, res) => {
  const tenantId = req.params.id

  const tenants = unwrap(
    await supabase.from('tenants').select(TENANT_FEATURE_COLUMNS).eq('id', tenantId).limit(1)
  )
  if (!tenants.length) return res.status(404).json({ error: 'Cliente não encontrado.' })
  const tenant = tenants[0]

  const admins = unwrap(
    await supabase.from('users')
      .select('id, email, name, role, permissions, is_restricted')
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .eq('active', true)
      .limit(1)
  )
  if (!admins.length) return res.status(404).json({ error: 'Nenhum administrador ativo encontrado para este cliente.' })

  res.json(buildImpersonationPayload(tenant, tenantId, admins[0]))
})

adminRouter.post('/users/:id/impersonate', async (req, res) => {
  const users = unwrap(
    await supabase.from('users')
      .select('id, email, name, role, permissions, is_restricted, active, tenant_id')
      .eq('id', req.params.id)
      .limit(1)
  )
  if (!users.length) return res.status(404).json({ error: 'Usuário não encontrado.' })
  const targetUser = users[0]
  if (!targetUser.active) return res.status(400).json({ error: 'Usuário está inativo.' })

  const tenants = unwrap(
    await supabase.from('tenants').select(TENANT_FEATURE_COLUMNS).eq('id', targetUser.tenant_id).limit(1)
  )
  if (!tenants.length) return res.status(404).json({ error: 'Cliente não encontrado.' })

  res.json(buildImpersonationPayload(tenants[0], targetUser.tenant_id, targetUser))
})

// ── Monitoramento ─────────────────────────────────────────────────────────────

adminRouter.get('/monitoring', async (req, res) => {
  const { tenant, from, to, limit = '100' } = req.query
  const lim = Math.min(parseInt(limit, 10) || 100, 500)

  try {
    let leadsQ = supabase.from('leads')
      .select('id, name, phone, stage, score, tenant_id, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(lim)

    let messagesQ = supabase.from('messages')
      .select('id, role, provider, tenant_id, lead_id, created_at')
      .order('created_at', { ascending: false })
      .limit(lim)

    let appointmentsQ = supabase.from('appointments')
      .select('id, title, tenant_id, lead_name, status, start_time, provider, created_at')
      .order('created_at', { ascending: false })
      .limit(lim)

    if (tenant) {
      leadsQ = leadsQ.eq('tenant_id', tenant)
      messagesQ = messagesQ.eq('tenant_id', tenant)
      appointmentsQ = appointmentsQ.eq('tenant_id', tenant)
    }
    if (from) {
      leadsQ = leadsQ.gte('created_at', from)
      messagesQ = messagesQ.gte('created_at', from)
      appointmentsQ = appointmentsQ.gte('created_at', from)
    }
    if (to) {
      leadsQ = leadsQ.lte('created_at', to)
      messagesQ = messagesQ.lte('created_at', to)
      appointmentsQ = appointmentsQ.lte('created_at', to)
    }

    const [leads, messages, appointments, tenantsRaw] = await Promise.all([
      leadsQ,
      messagesQ,
      appointmentsQ,
      supabase.from('tenants').select('id, name, slug'),
    ])

    const tenantMap = Object.fromEntries(
      unwrap(tenantsRaw).map((t) => [t.id, t])
    )

    const enrich = (rows) =>
      unwrap(rows).map((r) => ({ ...r, tenant: tenantMap[r.tenant_id] || null }))

    res.json({
      leads: enrich(leads),
      messages: enrich(messages),
      appointments: enrich(appointments),
      tenants: unwrap(tenantsRaw),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Configurações ─────────────────────────────────────────────────────────────

adminRouter.get('/settings', async (req, res) => {
  res.json({
    settings: {
      env: config.env,
      openai: {
        model: config.openai.model,
        configured: !!config.openai.apiKey,
      },
      google: {
        configured: !!(config.google.clientId && config.google.clientSecret),
        redirectUri: config.google.redirectUri,
      },
      meta: {
        graphVersion: config.meta.graphVersion,
        verifyTokenConfigured: !!config.meta.verifyToken,
      },
      jwt: {
        expiresIn: config.jwt.expiresIn,
      },
      supabase: {
        configured: !!(config.supabase.url && config.supabase.serviceKey),
      },
    },
  })
})

// ── Overview ──────────────────────────────────────────────────────────────────

adminRouter.get('/overview', async (req, res) => {
  const data = unwrap(await supabase.rpc('admin_overview'))
  res.json({ overview: Array.isArray(data) ? data[0] : data })
})
