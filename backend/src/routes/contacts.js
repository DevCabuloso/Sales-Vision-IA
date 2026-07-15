import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant, requirePermission } from '../middleware/auth.js'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { normalizePhone } from '../utils/phone.js'

export const contactsRouter = Router()
contactsRouter.use(requireAuth, requireTenant, requirePermission('contatos'))

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const schema = z.object({
  name:  z.string().min(1).max(200).optional().nullable(),
  phone: z.string().min(6).max(30),
  email: z.string().email().optional().nullable(),
  tags:  z.array(z.string()).optional(),
  stage: z.string().optional(),
})

const updateSchema = schema.partial().omit({ phone: true }).extend({
  phone: z.string().min(6).max(30).optional(),
})

const ARRAY_COLUMNS = new Set(['tags'])
function columnPlaceholder(col, i) { return ARRAY_COLUMNS.has(col) ? `$${i}::text[]` : `$${i}` }

// GET /api/contacts
contactsRouter.get('/', async (req, res) => {
  try {
    const { search, tags } = req.query
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000)
    const offset = parseInt(req.query.offset, 10) || 0

    const conditions = ['tenant_id = $1']
    const values = [req.user.tenantId]

    if (search) {
      values.push(`%${search}%`)
      const i = values.length
      conditions.push(`(name ILIKE $${i} OR phone ILIKE $${i} OR email ILIKE $${i})`)
    }
    if (tags) {
      const tagList = tags.split(',').filter(Boolean)
      if (tagList.length) {
        values.push(tagList)
        conditions.push(`tags && $${values.length}::text[]`)
      }
    }
    values.push(limit, offset)

    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, name, phone, email, tags, stage, score, conversation_status, created_at, updated_at
         FROM leads WHERE ${conditions.join(' AND ')}
         ORDER BY updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      )
      return r.rows
    })
    res.json({ contacts: rows, limit, offset })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/contacts
contactsRouter.post('/', async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const row = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO leads (tenant_id, name, phone, email, tags, stage, conversation_status)
         VALUES ($1, $2, $3, $4, $5::text[], $6, 'pending')
         RETURNING id, name, phone, email, tags, stage, created_at, updated_at`,
        [
          req.user.tenantId,
          parsed.data.name || null,
          parsed.data.phone.trim(),
          parsed.data.email || null,
          parsed.data.tags || [],
          parsed.data.stage || 'Novo Lead',
        ]
      )
      return r.rows[0]
    })
    res.status(201).json({ contact: row })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Já existe um contato com esse telefone.' })
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/contacts/:id
contactsRouter.put('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const update = { ...parsed.data, updated_at: new Date().toISOString() }
    const row = await withTenant(req.user.tenantId, async (client) => {
      const columns = Object.keys(update)
      const setClauses = columns.map((c, i) => `${c} = ${columnPlaceholder(c, i + 1)}`)
      const values = columns.map((c) => update[c])
      values.push(req.params.id, req.user.tenantId)
      const r = await client.query(
        `UPDATE leads SET ${setClauses.join(', ')}
         WHERE id = $${columns.length + 1} AND tenant_id = $${columns.length + 2}
         RETURNING id, name, phone, email, tags, stage, created_at, updated_at`,
        values
      )
      return r.rows[0]
    })
    res.json({ contact: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/contacts/:id
contactsRouter.delete('/:id', async (req, res) => {
  try {
    await withTenant(req.user.tenantId, (client) =>
      client.query('DELETE FROM leads WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])
    )
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/contacts/export — exporta CSV
contactsRouter.get('/export', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT name, phone, email, tags, stage, score, created_at
         FROM leads WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10000`,
        [req.user.tenantId]
      )
      return r.rows
    })
    const header = ['Nome', 'Telefone', 'Email', 'Tags', 'Estágio', 'Score', 'Criado em']
    const lines = [
      header.join(','),
      ...rows.map((r) => [
        `"${r.name || ''}"`,
        `"${r.phone || ''}"`,
        `"${r.email || ''}"`,
        `"${(r.tags || []).join(';')}"`,
        `"${r.stage || ''}"`,
        r.score || 0,
        `"${r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : ''}"`,
      ].join(',')),
    ]
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="contatos.csv"')
    res.send('﻿' + lines.join('\r\n'))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/contacts/import — importa CSV ou XLSX
contactsRouter.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
  try {
    const ext = req.file.originalname.split('.').pop().toLowerCase()
    let rows = []

    if (ext === 'csv' || ext === 'txt') {
      const text = req.file.buffer.toString('utf-8').replace(/^﻿/, '')
      const lines = text.split(/\r?\n/).filter(Boolean)
      const header = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase().replace(/"/g, ''))
      const nameIdx  = header.findIndex((h) => h.includes('nome') || h.includes('name'))
      const phoneIdx = header.findIndex((h) => h.includes('tel') || h.includes('fone') || h.includes('phone') || h.includes('cel') || h.includes('whats'))
      const emailIdx = header.findIndex((h) => h.includes('email') || h.includes('e-mail'))
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ''))
        const phone = phoneIdx >= 0 ? normalizePhone(cols[phoneIdx]) : null
        if (!phone || phone.length < 6) continue
        rows.push({
          name:  nameIdx >= 0 ? cols[nameIdx] || null : null,
          phone,
          email: emailIdx >= 0 ? cols[emailIdx] || null : null,
        })
      }
    } else {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
      for (const row of data) {
        const nameKey  = Object.keys(row).find((k) => k.toLowerCase().includes('nome') || k.toLowerCase().includes('name'))
        const phoneKey = Object.keys(row).find((k) => k.toLowerCase().includes('tel') || k.toLowerCase().includes('fone') || k.toLowerCase().includes('phone') || k.toLowerCase().includes('cel') || k.toLowerCase().includes('whats'))
        const emailKey = Object.keys(row).find((k) => k.toLowerCase().includes('email'))
        const phone = phoneKey ? normalizePhone(String(row[phoneKey])) : null
        if (!phone || phone.length < 6) continue
        rows.push({ name: nameKey ? String(row[nameKey]) || null : null, phone, email: emailKey ? String(row[emailKey]) || null : null })
      }
    }

    if (!rows.length) return res.status(400).json({ error: 'Nenhum contato válido encontrado no arquivo.' })

    // Importação em batches de 200 para evitar N+1 round-trips
    const CHUNK = 200
    let imported = 0, skipped = 0
    await withTenant(req.user.tenantId, async (client) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK)
        const values = []
        const placeholders = batch.map((r, ri) => {
          const base = ri * 6
          values.push(req.user.tenantId, r.name || null, r.phone, r.email || null, [], new Date().toISOString())
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::text[], 'Novo Lead', 'pending', $${base + 6})`
        })
        try {
          const r = await client.query(
            `INSERT INTO leads (tenant_id, name, phone, email, tags, stage, conversation_status, updated_at)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT (tenant_id, phone) DO NOTHING
             RETURNING id`,
            values
          )
          imported += r.rows.length
        } catch {
          skipped += batch.length
        }
      }
    })

    res.json({ imported, skipped, total: rows.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/contacts/deduplicate — remove duplicados por telefone
contactsRouter.post('/deduplicate', async (req, res) => {
  try {
    const removed = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT id, phone, created_at FROM leads WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 20000',
        [req.user.tenantId]
      )
      const seen = new Map()
      const toDelete = []
      for (const row of r.rows) {
        if (seen.has(row.phone)) toDelete.push(row.id)
        else seen.set(row.phone, row.id)
      }
      if (toDelete.length) {
        await client.query('DELETE FROM leads WHERE id = ANY($1::uuid[]) AND tenant_id = $2', [toDelete, req.user.tenantId])
      }
      return toDelete.length
    })
    res.json({ removed })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/contacts/tags — lista todas as tags usadas
contactsRouter.get('/tags', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT tags FROM leads WHERE tenant_id = $1 AND tags IS NOT NULL LIMIT 5000',
        [req.user.tenantId]
      )
      return r.rows
    })
    const all = [...new Set(rows.flatMap((r) => r.tags || []))].sort()
    res.json({ tags: all })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
