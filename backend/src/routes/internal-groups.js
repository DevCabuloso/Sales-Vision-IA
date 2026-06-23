import { Router } from 'express'
import { supabase, unwrap } from '../db/supabase.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const internalGroupsRouter = Router()
internalGroupsRouter.use(requireAuth, requireTenant)

// GET / — grupos do usuário atual
internalGroupsRouter.get('/', async (req, res) => {
  try {
    const memRows = unwrap(
      await supabase.from('internal_group_members').select('group_id').eq('user_id', req.user.id)
    )
    const ids = memRows.map((r) => r.group_id)
    if (!ids.length) return res.json({ groups: [] })

    const groups = unwrap(
      await supabase.from('internal_groups')
        .select('*, members:internal_group_members(user_id, users(id, name, email))')
        .in('id', ids).eq('tenant_id', req.user.tenantId)
        .order('updated_at', { ascending: false })
    )
    res.json({ groups })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST / — criar grupo
internalGroupsRouter.post('/', async (req, res) => {
  const { name, member_ids = [] } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório.' })
  try {
    const group = unwrap(
      await supabase.from('internal_groups')
        .insert({ tenant_id: req.user.tenantId, name: name.trim(), created_by: req.user.id })
        .select('*').single()
    )
    const all = [...new Set([req.user.id, ...member_ids])]
    await supabase.from('internal_group_members')
      .insert(all.map((uid) => ({ group_id: group.id, user_id: uid })))
    res.status(201).json({ group: { ...group, members: [] } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /:id/messages
internalGroupsRouter.get('/:id/messages', async (req, res) => {
  try {
    const { data: mem } = await supabase.from('internal_group_members')
      .select('group_id').eq('group_id', req.params.id).eq('user_id', req.user.id).limit(1)
    if (!mem?.length) return res.status(403).json({ error: 'Acesso negado.' })

    const { after, limit = 60 } = req.query
    let q = supabase.from('internal_messages')
      .select('*, sender:sender_id(id, name)')
      .eq('group_id', req.params.id)
      .limit(Number(limit))

    if (after) q = q.gt('created_at', after).order('created_at', { ascending: true })
    else       q = q.order('created_at', { ascending: false })

    let msgs = unwrap(await q)
    if (!after) msgs = msgs.reverse()
    res.json({ messages: msgs })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /:id/messages — enviar mensagem
internalGroupsRouter.post('/:id/messages', async (req, res) => {
  const { text } = req.body || {}
  if (!text?.trim()) return res.status(400).json({ error: 'Mensagem vazia.' })
  try {
    const { data: mem } = await supabase.from('internal_group_members')
      .select('group_id').eq('group_id', req.params.id).eq('user_id', req.user.id).limit(1)
    if (!mem?.length) return res.status(403).json({ error: 'Acesso negado.' })

    const msg = unwrap(
      await supabase.from('internal_messages')
        .insert({ tenant_id: req.user.tenantId, group_id: req.params.id, sender_id: req.user.id, text: text.trim() })
        .select('*, sender:sender_id(id, name)').single()
    )
    await supabase.from('internal_groups')
      .update({ updated_at: new Date().toISOString() }).eq('id', req.params.id)
    res.status(201).json({ message: msg })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH /:id — editar nome / membros
internalGroupsRouter.patch('/:id', async (req, res) => {
  const { name, member_ids } = req.body || {}
  try {
    const rows = unwrap(
      await supabase.from('internal_groups')
        .select('created_by').eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Grupo não encontrado.' })

    const update = { updated_at: new Date().toISOString() }
    if (name?.trim()) update.name = name.trim()
    await supabase.from('internal_groups').update(update).eq('id', req.params.id)

    if (member_ids !== undefined) {
      const all = [...new Set([rows[0].created_by, ...member_ids])]
      await supabase.from('internal_group_members').delete().eq('group_id', req.params.id)
      await supabase.from('internal_group_members')
        .insert(all.map((uid) => ({ group_id: req.params.id, user_id: uid })))
    }
    res.json({ updated: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /:id
internalGroupsRouter.delete('/:id', async (req, res) => {
  try {
    const rows = unwrap(
      await supabase.from('internal_groups')
        .select('created_by').eq('id', req.params.id).eq('tenant_id', req.user.tenantId).limit(1)
    )
    if (!rows.length) return res.status(404).json({ error: 'Grupo não encontrado.' })
    unwrap(await supabase.from('internal_groups').delete().eq('id', req.params.id))
    res.json({ deleted: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
