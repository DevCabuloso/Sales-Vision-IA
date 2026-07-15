import { Router } from 'express'
import { z } from 'zod'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const internalGroupsRouter = Router()
internalGroupsRouter.use(requireAuth, requireTenant)

const createGroupSchema = z.object({
  name:       z.string().trim().min(1, 'Nome obrigatório.'),
  member_ids: z.array(z.string()).optional(),
})

const updateGroupSchema = z.object({
  name:       z.string().trim().min(1).optional(),
  member_ids: z.array(z.string()).optional(),
})

const textSchema = z.object({
  text: z.string().trim().min(1, 'Mensagem vazia.'),
})

const forwardSchema = z.object({
  toGroupId: z.string().min(1, 'Selecione um grupo de destino.'),
})

const locationSchema = z.object({
  latitude:  z.number(),
  longitude: z.number(),
})

// internal_group_members não tem coluna tenant_id — sem essas duas checagens
// juntas, (1) um user_id de outro tenant podia ser inserido como membro sem
// nenhuma validação, e (2) mesmo sem esse bug, as rotas abaixo checavam SÓ a
// linha de membership (group_id + user_id), nunca se o próprio grupo pertence
// ao tenant do usuário — um membro "vazado" de outro tenant (por erro ou
// enumeração de UUID) teria acesso completo às mensagens daquele grupo.
// assertGroupMembership fecha as duas pontas de uma vez: confirma que o grupo
// existe NESTE tenant e que o usuário é membro dele.
async function assertGroupMembership(client, tenantId, groupId, userId) {
  const groupsR = await client.query(
    'SELECT id, created_by FROM internal_groups WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [groupId, tenantId]
  )
  if (!groupsR.rows.length) {
    const err = new Error('Grupo não encontrado.')
    err.status = 404
    throw err
  }
  const memR = await client.query(
    'SELECT group_id FROM internal_group_members WHERE group_id = $1 AND user_id = $2 LIMIT 1',
    [groupId, userId]
  )
  if (!memR.rows.length) {
    const err = new Error('Acesso negado.')
    err.status = 403
    throw err
  }
  return groupsR.rows[0]
}

async function assertUsersBelongToTenant(client, tenantId, userIds) {
  if (!userIds.length) return
  const r = await client.query(
    'SELECT id FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])',
    [tenantId, userIds]
  )
  const found = new Set(r.rows.map((row) => row.id))
  const invalid = userIds.filter((id) => !found.has(id))
  if (invalid.length) {
    const err = new Error('Um ou mais membros não pertencem a este cliente.')
    err.status = 400
    throw err
  }
}

async function fetchMembers(client, groupIds) {
  if (!groupIds.length) return []
  const r = await client.query(
    `SELECT gm.group_id, u.id, u.name, u.email
     FROM internal_group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = ANY($1::uuid[])`,
    [groupIds]
  )
  return r.rows
}

function withSender(row) {
  if (!row) return row
  const { sender_id, sender_name, ...rest } = row
  return { ...rest, sender_id, sender: sender_id ? { id: sender_id, name: sender_name } : null }
}

// GET / — grupos do usuário atual
internalGroupsRouter.get('/', async (req, res) => {
  try {
    const groups = await withTenant(req.user.tenantId, async (client) => {
      const memR = await client.query('SELECT group_id FROM internal_group_members WHERE user_id = $1', [req.user.id])
      const ids = memR.rows.map((r) => r.group_id)
      if (!ids.length) return []

      const groupsR = await client.query(
        `SELECT * FROM internal_groups WHERE id = ANY($1::uuid[]) AND tenant_id = $2 ORDER BY updated_at DESC`,
        [ids, req.user.tenantId]
      )
      const members = await fetchMembers(client, groupsR.rows.map((g) => g.id))
      return groupsR.rows.map((g) => ({
        ...g,
        members: members.filter((m) => m.group_id === g.id).map((m) => ({
          user_id: m.id,
          users: { id: m.id, name: m.name, email: m.email },
        })),
      }))
    })
    res.json({ groups })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST / — criar grupo
internalGroupsRouter.post('/', async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { name, member_ids = [] } = parsed.data
  try {
    const group = await withTenant(req.user.tenantId, async (client) => {
      await assertUsersBelongToTenant(client, req.user.tenantId, member_ids)
      const r = await client.query(
        'INSERT INTO internal_groups (tenant_id, name, created_by) VALUES ($1, $2, $3) RETURNING *',
        [req.user.tenantId, name.trim(), req.user.id]
      )
      const group = r.rows[0]
      const all = [...new Set([req.user.id, ...member_ids])]
      const values = []
      const placeholders = all.map((uid, i) => {
        values.push(group.id, uid)
        return `($${i * 2 + 1}, $${i * 2 + 2})`
      })
      await client.query(`INSERT INTO internal_group_members (group_id, user_id) VALUES ${placeholders.join(', ')}`, values)
      return group
    })
    res.status(201).json({ group: { ...group, members: [] } })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// GET /:id/messages
internalGroupsRouter.get('/:id/messages', async (req, res) => {
  try {
    const messages = await withTenant(req.user.tenantId, async (client) => {
      await assertGroupMembership(client, req.user.tenantId, req.params.id, req.user.id)

      const { after, limit = 60 } = req.query
      let sql = `SELECT m.*, u.name AS sender_name FROM internal_messages m
                 LEFT JOIN users u ON u.id = m.sender_id
                 WHERE m.group_id = $1`
      const params = [req.params.id]
      if (after) {
        params.push(after)
        sql += ` AND m.created_at > $${params.length} ORDER BY m.created_at ASC`
      } else {
        sql += ` ORDER BY m.created_at DESC`
      }
      params.push(Number(limit))
      sql += ` LIMIT $${params.length}`

      const r = await client.query(sql, params)
      let msgs = r.rows.map(withSender)
      if (!after) msgs = msgs.reverse()
      return msgs
    })
    res.json({ messages })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// POST /:id/messages — enviar mensagem
internalGroupsRouter.post('/:id/messages', async (req, res) => {
  const parsed = textSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { text } = parsed.data
  try {
    const msg = await withTenant(req.user.tenantId, async (client) => {
      await assertGroupMembership(client, req.user.tenantId, req.params.id, req.user.id)

      const r = await client.query(
        `INSERT INTO internal_messages (tenant_id, group_id, sender_id, text) VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.user.tenantId, req.params.id, req.user.id, text.trim()]
      )
      await client.query('UPDATE internal_groups SET updated_at = $1 WHERE id = $2', [new Date().toISOString(), req.params.id])
      const senderR = await client.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [req.user.id])
      return withSender({ ...r.rows[0], sender_name: senderR.rows[0]?.name })
    })
    res.status(201).json({ message: msg })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// PATCH /:id/messages/:messageId — edita mensagem (só o autor)
internalGroupsRouter.patch('/:id/messages/:messageId', async (req, res) => {
  const parsed = textSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { text } = parsed.data
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT id, sender_id, deleted_at FROM internal_messages WHERE id = $1 AND group_id = $2 AND tenant_id = $3 LIMIT 1',
        [req.params.messageId, req.params.id, req.user.tenantId]
      )
      const msg = r.rows[0]
      if (!msg) return { status: 404, error: 'Mensagem não encontrada.' }
      if (msg.deleted_at) return { status: 400, error: 'Mensagem já foi apagada.' }
      if (msg.sender_id !== req.user.id) return { status: 403, error: 'Só é possível editar suas próprias mensagens.' }

      const updR = await client.query(
        'UPDATE internal_messages SET text = $1, edited_at = $2 WHERE id = $3 RETURNING *',
        [text.trim(), new Date().toISOString(), msg.id]
      )
      const senderR = await client.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [msg.sender_id])
      return { message: withSender({ ...updR.rows[0], sender_name: senderR.rows[0]?.name }) }
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /:id/messages/:messageId — apaga mensagem (autor ou admin/owner)
internalGroupsRouter.delete('/:id/messages/:messageId', async (req, res) => {
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        'SELECT id, sender_id, deleted_at FROM internal_messages WHERE id = $1 AND group_id = $2 AND tenant_id = $3 LIMIT 1',
        [req.params.messageId, req.params.id, req.user.tenantId]
      )
      const msg = r.rows[0]
      if (!msg) return { status: 404, error: 'Mensagem não encontrada.' }
      if (msg.deleted_at) return { deleted: true } // idempotente
      const isManager = req.user.role === 'owner' || req.user.role === 'admin'
      if (msg.sender_id !== req.user.id && !isManager) {
        return { status: 403, error: 'Só é possível apagar suas próprias mensagens.' }
      }

      await client.query(
        "UPDATE internal_messages SET text = '', deleted_at = $1 WHERE id = $2",
        [new Date().toISOString(), msg.id]
      )
      return { deleted: true }
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /:id/messages/:messageId/forward — encaminha mensagem pra outro grupo interno
internalGroupsRouter.post('/:id/messages/:messageId/forward', async (req, res) => {
  const parsed = forwardSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { toGroupId } = parsed.data
  try {
    const result = await withTenant(req.user.tenantId, async (client) => {
      const msgR = await client.query(
        'SELECT * FROM internal_messages WHERE id = $1 AND group_id = $2 AND tenant_id = $3 LIMIT 1',
        [req.params.messageId, req.params.id, req.user.tenantId]
      )
      const original = msgR.rows[0]
      if (!original || original.deleted_at) return { status: 404, error: 'Mensagem não encontrada.' }

      await assertGroupMembership(client, req.user.tenantId, toGroupId, req.user.id)

      const insR = await client.query(
        `INSERT INTO internal_messages (tenant_id, group_id, sender_id, text, location_lat, location_lng, forwarded_from_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.tenantId, toGroupId, req.user.id, original.text, original.location_lat, original.location_lng, original.id]
      )
      await client.query('UPDATE internal_groups SET updated_at = $1 WHERE id = $2', [new Date().toISOString(), toGroupId])
      const senderR = await client.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [req.user.id])
      return { message: withSender({ ...insR.rows[0], sender_name: senderR.rows[0]?.name }) }
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.status(201).json(result)
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// POST /:id/location — envia localização no chat interno (sem WhatsApp envolvido)
internalGroupsRouter.post('/:id/location', async (req, res) => {
  const parsed = locationSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'Localização inválida.' })
  const { latitude, longitude } = parsed.data
  try {
    const message = await withTenant(req.user.tenantId, async (client) => {
      await assertGroupMembership(client, req.user.tenantId, req.params.id, req.user.id)

      const r = await client.query(
        `INSERT INTO internal_messages (tenant_id, group_id, sender_id, text, location_lat, location_lng)
         VALUES ($1, $2, $3, 'Localização compartilhada', $4, $5) RETURNING *`,
        [req.user.tenantId, req.params.id, req.user.id, latitude, longitude]
      )
      await client.query('UPDATE internal_groups SET updated_at = $1 WHERE id = $2', [new Date().toISOString(), req.params.id])
      const senderR = await client.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [req.user.id])
      return withSender({ ...r.rows[0], sender_name: senderR.rows[0]?.name })
    })
    res.status(201).json({ message })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// PATCH /:id — editar nome / membros (só quem participa do grupo)
internalGroupsRouter.patch('/:id', async (req, res) => {
  const parsed = updateGroupSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { name, member_ids } = parsed.data
  try {
    await withTenant(req.user.tenantId, async (client) => {
      if (member_ids !== undefined) await assertUsersBelongToTenant(client, req.user.tenantId, member_ids)
      const group = await assertGroupMembership(client, req.user.tenantId, req.params.id, req.user.id)

      if (name?.trim()) {
        await client.query('UPDATE internal_groups SET name = $1, updated_at = $2 WHERE id = $3', [name.trim(), new Date().toISOString(), req.params.id])
      } else {
        await client.query('UPDATE internal_groups SET updated_at = $1 WHERE id = $2', [new Date().toISOString(), req.params.id])
      }

      if (member_ids !== undefined) {
        const all = [...new Set([group.created_by, ...member_ids])]
        await client.query('DELETE FROM internal_group_members WHERE group_id = $1', [req.params.id])
        const values = []
        const placeholders = all.map((uid, i) => {
          values.push(req.params.id, uid)
          return `($${i * 2 + 1}, $${i * 2 + 2})`
        })
        await client.query(`INSERT INTO internal_group_members (group_id, user_id) VALUES ${placeholders.join(', ')}`, values)
      }
    })
    res.json({ updated: true })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// DELETE /:id — só quem participa do grupo
internalGroupsRouter.delete('/:id', async (req, res) => {
  try {
    await withTenant(req.user.tenantId, async (client) => {
      await assertGroupMembership(client, req.user.tenantId, req.params.id, req.user.id)
      await client.query('DELETE FROM internal_groups WHERE id = $1', [req.params.id])
    })
    res.json({ deleted: true })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})
