import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

const { internalGroupsRouter } = await import('../internal-groups.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/internal-groups', internalGroupsRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }

describe('routes/internal-groups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'agent', name: 'Ana' }
  })

  describe('GET /', () => {
    it('retorna vazio quando o usuário não participa de nenhum grupo', async () => {
      setSupabase({ internal_group_members: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/internal-groups')
      expect(res.body).toEqual({ groups: [] })
    })

    it('lista os grupos que o usuário participa', async () => {
      setSupabase({
        internal_group_members: [{ data: [{ group_id: 'g1' }], error: null }],
        internal_groups: [{ data: [{ id: 'g1', name: 'Financeiro' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).get('/api/internal-groups')
      expect(res.body.groups).toHaveLength(1)
    })
  })

  describe('POST /', () => {
    it('exige nome', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups').send({})
      expect(res.status).toBe(400)
    })

    it('cria o grupo e inclui o criador entre os membros', async () => {
      setSupabase({ internal_groups: [{ data: { id: 'g1', name: 'Financeiro' }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups').send({ name: 'Financeiro', member_ids: ['user-2'] })

      expect(res.status).toBe(201)
      const membersInsert = insertCallsFor('internal_group_members')[0]
      expect(membersInsert.args[0]).toEqual([{ group_id: 'g1', user_id: 'user-1' }, { group_id: 'g1', user_id: 'user-2' }])
    })

    it('rejeita nome só com espaços em branco', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups').send({ name: '   ' })
      expect(res.status).toBe(400)
    })

    it('rejeita member_ids que não seja array', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups').send({ name: 'X', member_ids: 'user-2' })
      expect(res.status).toBe(400)
    })
  })

  describe('GET /:id/messages', () => {
    it('retorna 403 quando o usuário não é membro do grupo', async () => {
      setSupabase({ internal_group_members: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/internal-groups/g1/messages')
      expect(res.status).toBe(403)
    })

    it('retorna as mensagens em ordem cronológica (mais antiga primeiro) por padrão', async () => {
      setSupabase({
        internal_group_members: [{ data: [{ group_id: 'g1' }], error: null }],
        internal_messages: [{ data: [{ id: 3 }, { id: 2 }, { id: 1 }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).get('/api/internal-groups/g1/messages')
      expect(res.body.messages.map((m) => m.id)).toEqual([1, 2, 3])
    })
  })

  describe('POST /:id/messages', () => {
    it('rejeita mensagem vazia', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/messages').send({ text: '   ' })
      expect(res.status).toBe(400)
    })

    it('retorna 403 quando o usuário não é membro', async () => {
      setSupabase({ internal_group_members: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/messages').send({ text: 'oi' })
      expect(res.status).toBe(403)
    })

    it('envia a mensagem e atualiza o timestamp do grupo', async () => {
      setSupabase({
        internal_group_members: [{ data: [{ group_id: 'g1' }], error: null }],
        internal_messages: [{ data: { id: 1, text: 'oi' }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/messages').send({ text: 'oi' })
      expect(res.status).toBe(201)
    })
  })

  describe('PATCH /:id/messages/:messageId', () => {
    it('retorna 404 quando a mensagem não existe', async () => {
      setSupabase({ internal_messages: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g1/messages/1').send({ text: 'novo' })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o usuário não é o autor da mensagem', async () => {
      setSupabase({ internal_messages: [{ data: [{ id: 1, sender_id: 'outro-user', deleted_at: null }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g1/messages/1').send({ text: 'novo' })
      expect(res.status).toBe(403)
    })

    it('edita a própria mensagem com sucesso', async () => {
      setSupabase({
        internal_messages: [
          { data: [{ id: 1, sender_id: 'user-1', deleted_at: null }], error: null },
          { data: { id: 1, text: 'novo texto' }, error: null },
        ],
      })
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g1/messages/1').send({ text: 'novo texto' })
      expect(res.status).toBe(200)
    })
  })

  describe('DELETE /:id/messages/:messageId', () => {
    it('é idempotente quando a mensagem já foi apagada', async () => {
      setSupabase({ internal_messages: [{ data: [{ id: 1, deleted_at: '2026-01-01T00:00:00Z' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/internal-groups/g1/messages/1')
      expect(res.status).toBe(200)
    })

    it('retorna 403 quando não é o autor nem admin/owner', async () => {
      setSupabase({ internal_messages: [{ data: [{ id: 1, sender_id: 'outro-user', deleted_at: null }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/internal-groups/g1/messages/1')
      expect(res.status).toBe(403)
    })

    it('admin pode apagar mensagem de outro usuário', async () => {
      mockState.user = { id: 'admin-1', tenantId: 'tenant-1', role: 'admin' }
      setSupabase({ internal_messages: [{ data: [{ id: 1, sender_id: 'outro-user', deleted_at: null }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/internal-groups/g1/messages/1')
      expect(res.status).toBe(200)
    })
  })

  describe('POST /:id/messages/:messageId/forward', () => {
    it('exige um grupo de destino', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/messages/1/forward').send({})
      expect(res.status).toBe(400)
    })

    it('retorna 403 quando o usuário não participa do grupo de destino', async () => {
      setSupabase({
        internal_messages: [{ data: [{ id: 1, text: 'oi', deleted_at: null }], error: null }],
        internal_group_members: [{ data: [], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/messages/1/forward').send({ toGroupId: 'g2' })
      expect(res.status).toBe(403)
    })

    it('encaminha a mensagem para o grupo de destino', async () => {
      setSupabase({
        internal_messages: [{ data: [{ id: 1, text: 'oi', deleted_at: null }], error: null }, { data: { id: 2, text: 'oi' }, error: null }],
        internal_group_members: [{ data: [{ group_id: 'g2' }], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/messages/1/forward').send({ toGroupId: 'g2' })
      expect(res.status).toBe(201)
    })
  })

  describe('POST /:id/location', () => {
    it('rejeita coordenadas inválidas', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/location').send({ latitude: 'x', longitude: 2 })
      expect(res.status).toBe(400)
    })

    it('retorna 403 quando não é membro', async () => {
      setSupabase({ internal_group_members: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/location').send({ latitude: 1, longitude: 2 })
      expect(res.status).toBe(403)
    })

    it('compartilha a localização com sucesso', async () => {
      setSupabase({
        internal_group_members: [{ data: [{ group_id: 'g1' }], error: null }],
        internal_messages: [{ data: { id: 1, text: 'Localização compartilhada' }, error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/location').send({ latitude: -23.5, longitude: -46.6 })
      expect(res.status).toBe(201)
    })
  })

  describe('PATCH /:id e DELETE /:id', () => {
    it('PATCH retorna 404 quando o grupo não existe', async () => {
      setSupabase({ internal_groups: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g-x').send({ name: 'Novo nome' })
      expect(res.status).toBe(404)
    })

    it('PATCH atualiza nome e substitui os membros', async () => {
      setSupabase({ internal_groups: [{ data: [{ created_by: 'user-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g1').send({ name: 'Novo nome', member_ids: ['user-2'] })
      expect(res.status).toBe(200)
      const membersInsert = insertCallsFor('internal_group_members')[0]
      expect(membersInsert.args[0]).toEqual([{ group_id: 'g1', user_id: 'user-1' }, { group_id: 'g1', user_id: 'user-2' }])
    })

    it('DELETE retorna 404 quando o grupo não existe', async () => {
      setSupabase({ internal_groups: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/internal-groups/g-x')
      expect(res.status).toBe(404)
    })

    it('DELETE remove o grupo com sucesso', async () => {
      setSupabase({ internal_groups: [{ data: [{ created_by: 'user-1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/internal-groups/g1')
      expect(res.status).toBe(200)
    })
  })
})
