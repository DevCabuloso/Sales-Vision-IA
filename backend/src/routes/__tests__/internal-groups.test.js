import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

const { internalGroupsRouter } = await import('../internal-groups.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/internal-groups', internalGroupsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^INSERT/.test(c.sql)) }

describe('routes/internal-groups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'agent', name: 'Ana' }
    setRls()
  })

  describe('GET /', () => {
    it('retorna vazio quando o usuário não participa de nenhum grupo', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/internal-groups')
      expect(res.body).toEqual({ groups: [] })
    })

    it('lista os grupos que o usuário participa', async () => {
      rlsMock.queueRows([{ group_id: 'g1' }])
      rlsMock.queueRows([{ id: 'g1', name: 'Financeiro' }])
      rlsMock.queueRows([])
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
      rlsMock.queueRows([{ id: 'user-2' }]) // assertUsersBelongToTenant
      rlsMock.queueRows([{ id: 'g1', name: 'Financeiro' }]) // insert group
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups').send({ name: 'Financeiro', member_ids: ['user-2'] })

      expect(res.status).toBe(201)
      const membersInsert = insertCallsMatching(/INSERT INTO internal_group_members/)[0]
      expect(membersInsert.params).toEqual(['g1', 'user-1', 'g1', 'user-2'])
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

    it('rejeita member_ids que não pertençam a este tenant (isolamento entre tenants)', async () => {
      rlsMock.queueRows([]) // nenhum dos ids pertence ao tenant-1
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups').send({ name: 'X', member_ids: ['user-de-outro-tenant'] })
      expect(res.status).toBe(400)
      expect(insertCallsMatching(/INSERT INTO internal_groups /)).toHaveLength(0)
    })
  })

  describe('GET /:id/messages', () => {
    it('retorna 404 quando o grupo não existe (ou não é deste tenant)', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/internal-groups/g1/messages')
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o usuário não é membro do grupo', async () => {
      rlsMock.queueRows([{ id: 'g1', created_by: 'user-2' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/internal-groups/g1/messages')
      expect(res.status).toBe(403)
    })

    it('retorna as mensagens em ordem cronológica (mais antiga primeiro) por padrão', async () => {
      rlsMock.queueRows([{ id: 'g1', created_by: 'user-1' }])
      rlsMock.queueRows([{ group_id: 'g1' }])
      rlsMock.queueRows([{ id: 3 }, { id: 2 }, { id: 1 }])
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
      rlsMock.queueRows([{ id: 'g1', created_by: 'user-2' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/messages').send({ text: 'oi' })
      expect(res.status).toBe(403)
    })

    it('envia a mensagem e atualiza o timestamp do grupo', async () => {
      rlsMock.queueRows([{ id: 'g1', created_by: 'user-1' }])
      rlsMock.queueRows([{ group_id: 'g1' }])
      rlsMock.queueRows([{ id: 1, text: 'oi' }])
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/messages').send({ text: 'oi' })
      expect(res.status).toBe(201)
    })
  })

  describe('PATCH /:id/messages/:messageId', () => {
    it('retorna 404 quando a mensagem não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g1/messages/1').send({ text: 'novo' })
      expect(res.status).toBe(404)
    })

    it('retorna 403 quando o usuário não é o autor da mensagem', async () => {
      rlsMock.queueRows([{ id: 1, sender_id: 'outro-user', deleted_at: null }])
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g1/messages/1').send({ text: 'novo' })
      expect(res.status).toBe(403)
    })

    it('edita a própria mensagem com sucesso', async () => {
      rlsMock.queueRows([{ id: 1, sender_id: 'user-1', deleted_at: null }])
      rlsMock.queueRows([{ id: 1, text: 'novo texto' }])
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g1/messages/1').send({ text: 'novo texto' })
      expect(res.status).toBe(200)
    })
  })

  describe('DELETE /:id/messages/:messageId', () => {
    it('é idempotente quando a mensagem já foi apagada', async () => {
      rlsMock.queueRows([{ id: 1, deleted_at: '2026-01-01T00:00:00Z' }])
      const app = buildApp()
      const res = await request(app).delete('/api/internal-groups/g1/messages/1')
      expect(res.status).toBe(200)
    })

    it('retorna 403 quando não é o autor nem admin/owner', async () => {
      rlsMock.queueRows([{ id: 1, sender_id: 'outro-user', deleted_at: null }])
      const app = buildApp()
      const res = await request(app).delete('/api/internal-groups/g1/messages/1')
      expect(res.status).toBe(403)
    })

    it('admin pode apagar mensagem de outro usuário', async () => {
      mockState.user = { id: 'admin-1', tenantId: 'tenant-1', role: 'admin' }
      rlsMock.queueRows([{ id: 1, sender_id: 'outro-user', deleted_at: null }])
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
      rlsMock.queueRows([{ id: 1, text: 'oi', deleted_at: null }])
      rlsMock.queueRows([{ id: 'g2', created_by: 'user-2' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/messages/1/forward').send({ toGroupId: 'g2' })
      expect(res.status).toBe(403)
    })

    it('encaminha a mensagem para o grupo de destino', async () => {
      rlsMock.queueRows([{ id: 1, text: 'oi', deleted_at: null }])
      rlsMock.queueRows([{ id: 'g2', created_by: 'user-1' }])
      rlsMock.queueRows([{ group_id: 'g2' }])
      rlsMock.queueRows([{ id: 2, text: 'oi' }])
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
      rlsMock.queueRows([{ id: 'g1', created_by: 'user-2' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/location').send({ latitude: 1, longitude: 2 })
      expect(res.status).toBe(403)
    })

    it('compartilha a localização com sucesso', async () => {
      rlsMock.queueRows([{ id: 'g1', created_by: 'user-1' }])
      rlsMock.queueRows([{ group_id: 'g1' }])
      rlsMock.queueRows([{ id: 1, text: 'Localização compartilhada' }])
      const app = buildApp()
      const res = await request(app).post('/api/internal-groups/g1/location').send({ latitude: -23.5, longitude: -46.6 })
      expect(res.status).toBe(201)
    })
  })

  describe('PATCH /:id e DELETE /:id', () => {
    it('PATCH retorna 404 quando o grupo não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g-x').send({ name: 'Novo nome' })
      expect(res.status).toBe(404)
    })

    it('PATCH retorna 403 quando o usuário não participa do grupo', async () => {
      rlsMock.queueRows([{ created_by: 'outro-user' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g1').send({ name: 'Novo nome' })
      expect(res.status).toBe(403)
    })

    it('PATCH atualiza nome e substitui os membros', async () => {
      rlsMock.queueRows([{ id: 'user-2' }]) // assertUsersBelongToTenant
      rlsMock.queueRows([{ created_by: 'user-1' }]) // assertGroupMembership groups
      rlsMock.queueRows([{ group_id: 'g1' }]) // assertGroupMembership members
      const app = buildApp()
      const res = await request(app).patch('/api/internal-groups/g1').send({ name: 'Novo nome', member_ids: ['user-2'] })
      expect(res.status).toBe(200)
      const membersInsert = insertCallsMatching(/INSERT INTO internal_group_members/)[0]
      expect(membersInsert.params).toEqual(['g1', 'user-1', 'g1', 'user-2'])
    })

    it('DELETE retorna 404 quando o grupo não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).delete('/api/internal-groups/g-x')
      expect(res.status).toBe(404)
    })

    it('DELETE retorna 403 quando o usuário não participa do grupo', async () => {
      rlsMock.queueRows([{ created_by: 'outro-user' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).delete('/api/internal-groups/g1')
      expect(res.status).toBe(403)
    })

    it('DELETE remove o grupo com sucesso', async () => {
      rlsMock.queueRows([{ created_by: 'user-1' }])
      rlsMock.queueRows([{ group_id: 'g1' }])
      const app = buildApp()
      const res = await request(app).delete('/api/internal-groups/g1')
      expect(res.status).toBe(200)
    })
  })
})
