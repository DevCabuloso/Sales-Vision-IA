import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import * as XLSX from 'xlsx'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, permCalls: [] }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
  requirePermission: (...keys) => { mockState.permCalls.push(keys); return (req, res, next) => next() },
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

const { contactsRouter } = await import('../contacts.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/contacts', contactsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql)) }
function deleteCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^DELETE/.test(c.sql)) }

describe('routes/contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setRls()
  })

  it('exige a permissão "contatos" (enforcement de operador restrito) em toda a rota', () => {
    expect(mockState.permCalls).toContainEqual(['contatos'])
  })

  describe('GET /', () => {
    it('lista os contatos do tenant', async () => {
      rlsMock.queueRows([{ id: 'l1', name: 'Ana', phone: '11988887777' }])
      const app = buildApp()
      const res = await request(app).get('/api/contacts')
      expect(res.body.contacts).toHaveLength(1)
    })

    it('aceita filtro de busca e de tags sem quebrar', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/contacts').query({ search: 'ana', tags: 'vip,cliente' })
      expect(res.status).toBe(200)
    })

    it('passa o termo de busca como parâmetro do banco, nunca concatenado na query (proteção contra injeção)', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/contacts').query({ search: 'x",tags.cs.{admin}' })
      expect(res.status).toBe(200)
      const call = rlsMock.calls.find((c) => /FROM leads/.test(c.sql) && /ILIKE/.test(c.sql))
      expect(call.sql).not.toContain('x",tags.cs.{admin}')
      expect(call.params).toContain('%x",tags.cs.{admin}%')
    })

    it('aceita limit/offset e reflete na resposta e nos parâmetros da query', async () => {
      rlsMock.queueRows([{ id: 'l1', name: 'Ana', phone: '11988887777' }])
      const app = buildApp()
      const res = await request(app).get('/api/contacts').query({ limit: '50', offset: '100' })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ limit: 50, offset: 100 })
      const call = rlsMock.calls.find((c) => /FROM leads/.test(c.sql))
      expect(call.params.slice(-2)).toEqual([50, 100])
    })

    it('usa limit=500 e offset=0 por padrão, e limita o teto a 1000', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const defaultRes = await request(app).get('/api/contacts')
      expect(defaultRes.body).toMatchObject({ limit: 500, offset: 0 })

      rlsMock.queueRows([])
      const cappedRes = await request(app).get('/api/contacts').query({ limit: '5000' })
      expect(cappedRes.body.limit).toBe(1000)
    })
  })

  describe('POST /', () => {
    it('rejeita telefone muito curto', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/contacts').send({ phone: '123' })
      expect(res.status).toBe(400)
    })

    it('cria o contato', async () => {
      rlsMock.queueRows([{ id: 'l1', name: 'Ana', phone: '11988887777' }])
      const app = buildApp()
      const res = await request(app).post('/api/contacts').send({ name: 'Ana', phone: '11988887777' })
      expect(res.status).toBe(201)
    })

    it('retorna 409 quando o telefone já está cadastrado', async () => {
      rlsMock.queueError(Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }))
      const app = buildApp()
      const res = await request(app).post('/api/contacts').send({ phone: '11988887777' })
      expect(res.status).toBe(409)
    })
  })

  it('PUT /:id atualiza o contato', async () => {
    rlsMock.queueRows([{ id: 'l1', name: 'Novo nome' }])
    const app = buildApp()
    const res = await request(app).put('/api/contacts/l1').send({ name: 'Novo nome' })
    expect(res.status).toBe(200)
  })

  it('DELETE /:id remove o contato', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).delete('/api/contacts/l1')
    expect(res.status).toBe(200)
  })

  it('GET /export retorna um CSV com os contatos', async () => {
    rlsMock.queueRows([{ name: 'Ana', phone: '11988887777', email: 'ana@ex.com', tags: ['vip'], stage: 'Novo Lead', score: 80, created_at: '2026-01-01T00:00:00.000Z' }])
    const app = buildApp()
    const res = await request(app).get('/api/contacts/export')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.text).toContain('Ana')
    expect(res.text).toContain('vip')
  })

  describe('POST /import', () => {
    it('rejeita quando nenhum arquivo é enviado', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/contacts/import')
      expect(res.status).toBe(400)
    })

    it('importa contatos de um CSV', async () => {
      rlsMock.queueRows([{ id: 'l1' }, { id: 'l2' }])
      const csv = 'nome,telefone,email\nAna,11988887777,ana@ex.com\nBia,(11) 97777-6666,bia@ex.com\n'
      const app = buildApp()
      const res = await request(app).post('/api/contacts/import').attach('file', Buffer.from(csv), 'contatos.csv')

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(2)
      const insert = insertCallsMatching(/INSERT INTO leads/)[0]
      expect(insert.params).toContain('Ana')
      expect(insert.params).toContain('11988887777')
    })

    it('importa contatos de uma planilha XLSX', async () => {
      rlsMock.queueRows([{ id: 'l1' }])
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet([{ Nome: 'Carla', Telefone: '11966665555', Email: 'carla@ex.com' }])
      XLSX.utils.book_append_sheet(wb, ws, 'Contatos')
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      const app = buildApp()
      const res = await request(app).post('/api/contacts/import').attach('file', buffer, 'contatos.xlsx')

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
      const insert = insertCallsMatching(/INSERT INTO leads/)[0]
      expect(insert.params).toContain('Carla')
      expect(insert.params).toContain('11966665555')
    })

    it('retorna erro quando nenhum contato válido é encontrado no arquivo', async () => {
      const csv = 'nome,telefone\nSem Telefone,123\n'
      const app = buildApp()
      const res = await request(app).post('/api/contacts/import').attach('file', Buffer.from(csv), 'contatos.csv')
      expect(res.status).toBe(400)
    })
  })

  it('POST /deduplicate remove contatos com telefone duplicado, mantendo o mais antigo', async () => {
    rlsMock.queueRows([
      { id: 'l1', phone: '11988887777', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'l2', phone: '11988887777', created_at: '2026-01-02T00:00:00.000Z' },
      { id: 'l3', phone: '11977776666', created_at: '2026-01-01T00:00:00.000Z' },
    ])
    const app = buildApp()
    const res = await request(app).post('/api/contacts/deduplicate')
    expect(res.body).toEqual({ removed: 1 })
    expect(deleteCallsMatching(/leads/)).toHaveLength(1)
    const selectCall = rlsMock.calls.find((c) => /SELECT id, phone, created_at/.test(c.sql))
    expect(selectCall.sql).toMatch(/LIMIT 20000/)
  })

  it('GET /tags retorna as tags únicas e ordenadas', async () => {
    rlsMock.queueRows([{ tags: ['vip', 'novo'] }, { tags: ['novo'] }, { tags: null }])
    const app = buildApp()
    const res = await request(app).get('/api/contacts/tags')
    expect(res.body.tags).toEqual(['novo', 'vip'])
  })
})
