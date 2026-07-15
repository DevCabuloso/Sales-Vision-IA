import { Router } from 'express'
import { z } from 'zod'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireOwner } from '../middleware/auth.js'

// Painel do dono (cross-tenant) pros chamados de suporte abertos pelos
// clientes — fica no client service_role de propósito, igual admin.js:
// não faz sentido escopar por tenant uma tela que precisa ver TODOS os
// chamados de TODAS as empresas de uma vez.
export const adminSupportRouter = Router()
adminSupportRouter.use(requireAuth, requireOwner)

const messageSchema = z.object({
  text: z.string().min(1).max(4000),
})

// GET /api/admin/support/tickets?status=open — lista todos os chamados,
// com nome da empresa e do usuário resolvidos (sem depender de FK/embed
// do PostgREST — duas consultas + join em JS).
adminSupportRouter.get('/tickets', async (req, res) => {
  try {
    let q = supabase.from('support_tickets').select('*').order('updated_at', { ascending: false })
    if (req.query.status) q = q.eq('status', req.query.status)
    const tickets = unwrap(await q)
    if (!tickets.length) return res.json({ tickets: [] })

    const tenantIds = [...new Set(tickets.map((t) => t.tenant_id))]
    const userIds = [...new Set(tickets.map((t) => t.user_id))]
    const [tenants, users] = await Promise.all([
      supabase.from('tenants').select('id, name').in('id', tenantIds),
      supabase.from('users').select('id, name, email').in('id', userIds),
    ])
    const tenantById = Object.fromEntries(unwrap(tenants).map((t) => [t.id, t]))
    const userById = Object.fromEntries(unwrap(users).map((u) => [u.id, u]))

    res.json({
      tickets: tickets.map((t) => ({
        ...t,
        tenant_name: tenantById[t.tenant_id]?.name || null,
        user_name: userById[t.user_id]?.name || null,
        user_email: userById[t.user_id]?.email || null,
      })),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/admin/support/tickets/:id/start — dono assume o chamado
adminSupportRouter.post('/tickets/:id/start', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('support_tickets').update({
        status: 'in_progress', started_by: req.user.id, started_at: new Date().toISOString(),
      }).eq('id', req.params.id).eq('status', 'open').select()
    )
    if (!rows.length) return res.status(400).json({ error: 'Chamado não está aberto ou não existe.' })
    res.json({ ticket: rows[0] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/admin/support/tickets/:id/messages
adminSupportRouter.get('/tickets/:id/messages', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('support_messages').select('*')
        .eq('ticket_id', req.params.id).order('created_at', { ascending: true })
    )
    res.json({ messages: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/admin/support/tickets/:id/messages — dono responde, cliente é notificado
adminSupportRouter.post('/tickets/:id/messages', async (req, res) => {
  const parsed = messageSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const ticketRows = unwrap(await supabase.from('support_tickets').select('*').eq('id', req.params.id).limit(1))
    const ticket = ticketRows?.[0]
    if (!ticket) return res.status(404).json({ error: 'Chamado não encontrado.' })

    const message = unwrap(
      await supabase.from('support_messages').insert({
        ticket_id: ticket.id, tenant_id: ticket.tenant_id, sender_type: 'owner', sender_id: req.user.id, text: parsed.data.text,
      }).select().single()
    )
    await supabase.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticket.id)
    // avisa o cliente pelo sino (NotificationBell) — mesma tabela usada pros lembretes de cobrança.
    await supabase.from('notifications').insert({
      tenant_id: ticket.tenant_id,
      user_id: ticket.user_id,
      type: 'support_reply',
      title: 'Suporte respondeu seu chamado',
      message: parsed.data.text.slice(0, 120),
      ticket_id: ticket.id,
    })
    res.status(201).json({ message })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/admin/support/tickets/:id/close
adminSupportRouter.post('/tickets/:id/close', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('support_tickets').update({
        status: 'closed', closed_at: new Date().toISOString(),
      }).eq('id', req.params.id).select()
    )
    if (!rows.length) return res.status(404).json({ error: 'Chamado não encontrado.' })
    res.json({ ticket: rows[0] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
