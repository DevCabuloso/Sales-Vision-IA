import { Router } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import { getAuthUrl, handleCallback, disconnect } from '../services/googleCalendar.js'
import { saveCredentials, getCredentials, disconnectProvider } from '../services/integrations.js'
import { encrypt } from '../services/crypto.js'
import { assertPublicUrl } from '../utils/ssrfGuard.js'

export const integrationsRouter = Router()

// ════════════════════════════════════════════════
// GOOGLE CALENDAR (OAuth)
// ════════════════════════════════════════════════

// GET /api/integrations/google/setup → { configured, clientId }
integrationsRouter.get('/google/setup', requireAuth, requireTenant, async (req, res) => {
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        "SELECT meta FROM integrations WHERE tenant_id = $1 AND provider = 'google_calendar' LIMIT 1",
        [req.user.tenantId]
      )
      return r.rows[0]
    })
    const setup = row?.meta?.setup
    res.json({
      configured: !!(setup?.client_id && setup?.client_secret_enc),
      clientId: setup?.client_id || null,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const googleSetupSchema = z.object({
  clientId: z.string().min(10, 'Client ID inválido'),
  clientSecret: z.string().min(10, 'Client Secret inválido'),
})

// POST /api/integrations/google/setup — salva credenciais OAuth do tenant
integrationsRouter.post('/google/setup', requireAuth, requireTenant, async (req, res) => {
  const parsed = googleSetupSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { clientId, clientSecret } = parsed.data

  await withTenant(req.user.tenantId, async (client) => {
    const r = await client.query(
      "SELECT meta, status FROM integrations WHERE tenant_id = $1 AND provider = 'google_calendar' LIMIT 1",
      [req.user.tenantId]
    )
    const existing = r.rows[0]
    const existingMeta = existing?.meta || {}
    const newMeta = { ...existingMeta, setup: { client_id: clientId, client_secret_enc: encrypt(clientSecret) } }

    await client.query(
      `INSERT INTO integrations (tenant_id, provider, status, meta, updated_at)
       VALUES ($1, 'google_calendar', $2, $3::jsonb, $4)
       ON CONFLICT (tenant_id, provider) DO UPDATE SET
         status = EXCLUDED.status, meta = EXCLUDED.meta, updated_at = EXCLUDED.updated_at`,
      [req.user.tenantId, existing?.status || 'disconnected', JSON.stringify(newMeta), new Date().toISOString()]
    )
  })

  res.json({ saved: true })
})

// GET /api/integrations/google/connect → { authUrl }
integrationsRouter.get('/google/connect', requireAuth, requireTenant, async (req, res) => {
  try {
    const authUrl = await getAuthUrl(req.user.tenantId)
    res.json({ authUrl })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/integrations/google/callback ← Google redireciona aqui (sem auth header)
integrationsRouter.get('/google/callback', async (req, res) => {
  const { code, state } = req.query
  const back = config.frontendUrl + '/integracoes'
  if (!code || !state) {
    return res.redirect(`${back}?gcal=error&reason=missing_code`)
  }
  let tenantId
  try {
    const decoded = jwt.verify(state, config.jwt.secret)
    tenantId = decoded.tenantId
  } catch {
    return res.redirect(`${back}?gcal=error&reason=invalid_state`)
  }
  try {
    await handleCallback(code, tenantId)
    res.redirect(`${back}?gcal=connected`)
  } catch (e) {
    res.redirect(`${back}?gcal=error&reason=${encodeURIComponent(e.message)}`)
  }
})

// GET /api/integrations/google/status → { connected, email }
integrationsRouter.get('/google/status', requireAuth, requireTenant, async (req, res) => {
  const row = await withTenant(req.user.tenantId, async (client) => {
    const r = await client.query(
      "SELECT status, meta FROM integrations WHERE tenant_id = $1 AND provider = 'google_calendar' LIMIT 1",
      [req.user.tenantId]
    )
    return r.rows[0]
  })
  if (!row || row.status !== 'connected') return res.json({ connected: false })
  res.json({ connected: true, email: row.meta?.email || null })
})

// POST /api/integrations/google/disconnect
integrationsRouter.post('/google/disconnect', requireAuth, requireTenant, async (req, res) => {
  await disconnect(req.user.tenantId)
  res.json({ disconnected: true })
})

// ════════════════════════════════════════════════
// META WHATSAPP (token por tenant)
// ════════════════════════════════════════════════
const metaSchema = z.object({
  accessToken: z.string().min(10),
  phoneNumberId: z.string().min(3),
  wabaId: z.string().optional(),
})

// POST /api/integrations/meta/test — valida credenciais Meta
integrationsRouter.post('/meta/test', requireAuth, requireTenant, async (req, res) => {
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        "SELECT credentials, meta FROM integrations WHERE tenant_id = $1 AND provider = 'meta_whatsapp' LIMIT 1",
        [req.user.tenantId]
      )
      return r.rows[0]
    })
    if (!row) return res.status(404).json({ error: 'Meta WhatsApp não configurado.' })
    const { decryptJSON } = await import('../services/crypto.js')
    const creds = decryptJSON(row.credentials)
    const meta  = row.meta

    const r = await fetch(
      `https://graph.facebook.com/v21.0/${meta.phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${creds.accessToken}` } }
    )
    const data = await r.json()
    if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`)
    res.json({ connected: true, phone: data.display_phone_number, name: data.verified_name })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

integrationsRouter.post('/meta/connect', requireAuth, requireTenant, async (req, res) => {
  const parsed = metaSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Credenciais Meta inválidas.' })
  const { accessToken, phoneNumberId, wabaId } = parsed.data
  await saveCredentials(
    req.user.tenantId, 'meta_whatsapp',
    { accessToken },
    { phoneNumberId, wabaId: wabaId || null }
  )
  res.json({ connected: true })
})

// ════════════════════════════════════════════════
// EVOLUTION API (url+key por tenant)
// ════════════════════════════════════════════════
const evoSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(3),
  instance: z.string().min(1),
})

integrationsRouter.post('/evolution/connect', requireAuth, requireTenant, async (req, res) => {
  const parsed = evoSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Credenciais Evolution inválidas.' })
  const { baseUrl, apiKey, instance } = parsed.data
  try {
    await assertPublicUrl(baseUrl)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
  await saveCredentials(
    req.user.tenantId, 'evolution',
    { apiKey },
    { baseUrl, instance }
  )
  res.json({ connected: true })
})

// GET /api/integrations/status → status de todos os providers do tenant
integrationsRouter.get('/status', requireAuth, requireTenant, async (req, res) => {
  const rows = await withTenant(req.user.tenantId, async (client) => {
    const r = await client.query(
      'SELECT provider, status, meta FROM integrations WHERE tenant_id = $1',
      [req.user.tenantId]
    )
    return r.rows
  })
  res.json({ integrations: rows })
})

// POST /api/integrations/:provider/disconnect (meta_whatsapp | evolution)
integrationsRouter.post('/:provider/disconnect', requireAuth, requireTenant, async (req, res) => {
  const allowed = ['meta_whatsapp', 'evolution']
  if (!allowed.includes(req.params.provider)) {
    return res.status(400).json({ error: 'Provider inválido.' })
  }
  await disconnectProvider(req.user.tenantId, req.params.provider)
  res.json({ disconnected: true })
})
