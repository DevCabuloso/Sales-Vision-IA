import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'
import multer from 'multer'
import * as XLSX from 'xlsx'

export const contactsRouter = Router()
contactsRouter.use(requireAuth, requireTenant)

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

// Escapa valores usados dentro de um filtro .or() do PostgREST: envolver em
// aspas duplas neutraliza vírgulas e parênteses (delimitadores estruturais da
// sintaxe de filtro), então só falta escapar as aspas/barras internas. Sem
// isso, um `search` como `x,tags.cs.{admin}` injetaria uma condição extra
// arbitrária dentro do OR (ainda dentro do AND com tenant_id, mas um vetor de
// injeção real e desnecessário).
function escapeOrValue(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// GET /api/contacts
contactsRouter.get('/', async (req, res) => {
  try {
    const { search, tags } = req.query
    let q = supabase.from('leads')
      .select('id, name, phone, email, tags, stage, score, conversation_status, created_at, updated_at')
      .eq('tenant_id', req.user.tenantId)
      .order('updated_at', { ascending: false })
      .limit(500)

    if (search) {
      const s = escapeOrValue(search)
      q = q.or(`name.ilike."%${s}%",phone.ilike."%${s}%",email.ilike."%${s}%"`)
    }
    if (tags) {
      const tagList = tags.split(',').filter(Boolean)
      if (tagList.length) q = q.overlaps('tags', tagList)
    }

    const rows = unwrap(await q)
    res.json({ contacts: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/contacts
contactsRouter.post('/', async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const row = unwrap(
      await supabase.from('leads').insert({
        tenant_id: req.user.tenantId,
        name:  parsed.data.name || null,
        phone: parsed.data.phone.trim(),
        email: parsed.data.email || null,
        tags:  parsed.data.tags || [],
        stage: parsed.data.stage || 'Novo Lead',
        conversation_status: 'pending',
      }).select('id, name, phone, email, tags, stage, created_at, updated_at').single()
    )
    res.status(201).json({ contact: row })
  } catch (e) {
    if (e.message.includes('23505')) return res.status(409).json({ error: 'Já existe um contato com esse telefone.' })
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/contacts/:id
contactsRouter.put('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const row = unwrap(
      await supabase.from('leads').update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.id).eq('tenant_id', req.user.tenantId)
        .select('id, name, phone, email, tags, stage, created_at, updated_at').single()
    )
    res.json({ contact: row })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/contacts/:id
contactsRouter.delete('/:id', async (req, res) => {
  try {
    unwrap(await supabase.from('leads').delete().eq('id', req.params.id).eq('tenant_id', req.user.tenantId))
    res.json({ deleted: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/contacts/export — exporta CSV
contactsRouter.get('/export', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('leads')
        .select('name, phone, email, tags, stage, score, created_at')
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: false })
        .limit(10000)
    )
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
        const phone = phoneIdx >= 0 ? cols[phoneIdx]?.replace(/\D/g, '') : null
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
        const keys = Object.keys(row).map((k) => k.toLowerCase())
        const nameKey  = Object.keys(row).find((k) => k.toLowerCase().includes('nome') || k.toLowerCase().includes('name'))
        const phoneKey = Object.keys(row).find((k) => k.toLowerCase().includes('tel') || k.toLowerCase().includes('fone') || k.toLowerCase().includes('phone') || k.toLowerCase().includes('cel') || k.toLowerCase().includes('whats'))
        const emailKey = Object.keys(row).find((k) => k.toLowerCase().includes('email'))
        const phone = phoneKey ? String(row[phoneKey]).replace(/\D/g, '') : null
        if (!phone || phone.length < 6) continue
        rows.push({ name: nameKey ? String(row[nameKey]) || null : null, phone, email: emailKey ? String(row[emailKey]) || null : null })
      }
    }

    if (!rows.length) return res.status(400).json({ error: 'Nenhum contato válido encontrado no arquivo.' })

    // Importação em batches de 200 para evitar N+1 round-trips
    const CHUNK = 200
    let imported = 0, skipped = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((r) => ({
        tenant_id: req.user.tenantId,
        name:  r.name || null,
        phone: r.phone,
        email: r.email || null,
        tags:  [],
        stage: 'Novo Lead',
        conversation_status: 'pending',
        updated_at: new Date().toISOString(),
      }))
      const { error, data } = await supabase.from('leads')
        .upsert(batch, { onConflict: 'tenant_id,phone', ignoreDuplicates: true })
        .select('id')
      if (error) skipped += batch.length
      else imported += data?.length ?? batch.length
    }

    res.json({ imported, skipped, total: rows.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/contacts/deduplicate — remove duplicados por telefone
contactsRouter.post('/deduplicate', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('leads').select('id, phone, created_at')
        .eq('tenant_id', req.user.tenantId)
        .order('created_at', { ascending: true })
        .limit(20000)
    )
    const seen = new Map()
    const toDelete = []
    for (const r of rows) {
      if (seen.has(r.phone)) toDelete.push(r.id)
      else seen.set(r.phone, r.id)
    }
    if (toDelete.length) {
      unwrap(await supabase.from('leads').delete().in('id', toDelete).eq('tenant_id', req.user.tenantId))
    }
    res.json({ removed: toDelete.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/contacts/tags — lista todas as tags usadas
contactsRouter.get('/tags', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('leads').select('tags').eq('tenant_id', req.user.tenantId).not('tags', 'is', null).limit(5000)
    )
    const all = [...new Set(rows.flatMap((r) => r.tags || []))].sort()
    res.json({ tags: all })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
