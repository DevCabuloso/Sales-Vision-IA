import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import * as XLSX from 'xlsx'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {} }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

const { contactsRouter } = await import('../contacts.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/contacts', contactsRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function insertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert') }
function upsertCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'upsert') }
function deleteCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'delete') }

describe('routes/contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /', () => {
    it('lista os contatos do tenant', async () => {
      setSupabase({ leads: [{ data: [{ id: 'l1', name: 'Ana', phone: '11988887777' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/contacts')
      expect(res.body.contacts).toHaveLength(1)
    })

    it('aceita filtro de busca e de tags sem quebrar', async () => {
      setSupabase({ leads: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/contacts').query({ search: 'ana', tags: 'vip,cliente' })
      expect(res.status).toBe(200)
    })

    it('escapa vírgulas/aspas no termo de busca antes de montar o filtro .or() (proteção contra injeção de filtro)', async () => {
      setSupabase({ leads: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/contacts').query({ search: 'x",tags.cs.{admin}' })
      expect(res.status).toBe(200)
      const orCall = supabaseMock.calls.find((c) => c.table === 'leads' && c.method === 'or')
      expect(orCall.args[0]).toBe('name.ilike."%x\\",tags.cs.{admin}%",phone.ilike."%x\\",tags.cs.{admin}%",email.ilike."%x\\",tags.cs.{admin}%"')
    })

    it('aceita limit/offset e reflete na resposta e no range da query', async () => {
      setSupabase({ leads: [{ data: [{ id: 'l1', name: 'Ana', phone: '11988887777' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/contacts').query({ limit: '50', offset: '100' })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ limit: 50, offset: 100 })
      const rangeCall = supabaseMock.calls.find((c) => c.table === 'leads' && c.method === 'range')
      expect(rangeCall.args).toEqual([100, 149])
    })

    it('usa limit=500 e offset=0 por padrão, e limita o teto a 1000', async () => {
      setSupabase({ leads: [{ data: [], error: null }] })
      const app = buildApp()
      const defaultRes = await request(app).get('/api/contacts')
      expect(defaultRes.body).toMatchObject({ limit: 500, offset: 0 })

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
      setSupabase({ leads: [{ data: { id: 'l1', name: 'Ana', phone: '11988887777' }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/contacts').send({ name: 'Ana', phone: '11988887777' })
      expect(res.status).toBe(201)
    })

    it('retorna 409 quando o telefone já está cadastrado', async () => {
      setSupabase({ leads: [{ data: null, error: { message: 'duplicate key 23505' } }] })
      const app = buildApp()
      const res = await request(app).post('/api/contacts').send({ phone: '11988887777' })
      expect(res.status).toBe(409)
    })
  })

  it('PUT /:id atualiza o contato', async () => {
    setSupabase({ leads: [{ data: { id: 'l1', name: 'Novo nome' }, error: null }] })
    const app = buildApp()
    const res = await request(app).put('/api/contacts/l1').send({ name: 'Novo nome' })
    expect(res.status).toBe(200)
  })

  it('DELETE /:id remove o contato', async () => {
    setSupabase({})
    const app = buildApp()
    const res = await request(app).delete('/api/contacts/l1')
    expect(res.status).toBe(200)
  })

  it('GET /export retorna um CSV com os contatos', async () => {
    setSupabase({ leads: [{ data: [{ name: 'Ana', phone: '11988887777', email: 'ana@ex.com', tags: ['vip'], stage: 'Novo Lead', score: 80, created_at: '2026-01-01T00:00:00.000Z' }], error: null }] })
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
      setSupabase({ leads: [{ data: [{ id: 'l1' }], error: null }] })
      const csv = 'nome,telefone,email\nAna,11988887777,ana@ex.com\nBia,(11) 97777-6666,bia@ex.com\n'
      const app = buildApp()
      const res = await request(app).post('/api/contacts/import').attach('file', Buffer.from(csv), 'contatos.csv')

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(2)
      const upsert = upsertCallsFor('leads')[0]
      expect(upsert.args[0]).toHaveLength(2)
      expect(upsert.args[0][0]).toMatchObject({ name: 'Ana', phone: '11988887777' })
    })

    it('importa contatos de uma planilha XLSX', async () => {
      setSupabase({ leads: [{ data: [{ id: 'l1' }], error: null }] })
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet([{ Nome: 'Carla', Telefone: '11966665555', Email: 'carla@ex.com' }])
      XLSX.utils.book_append_sheet(wb, ws, 'Contatos')
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      const app = buildApp()
      const res = await request(app).post('/api/contacts/import').attach('file', buffer, 'contatos.xlsx')

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
      const upsert = upsertCallsFor('leads')[0]
      expect(upsert.args[0][0]).toMatchObject({ name: 'Carla', phone: '11966665555' })
    })

    it('retorna erro quando nenhum contato válido é encontrado no arquivo', async () => {
      const csv = 'nome,telefone\nSem Telefone,123\n'
      const app = buildApp()
      const res = await request(app).post('/api/contacts/import').attach('file', Buffer.from(csv), 'contatos.csv')
      expect(res.status).toBe(400)
    })
  })

  it('POST /deduplicate remove contatos com telefone duplicado, mantendo o mais antigo', async () => {
    setSupabase({
      leads: [{
        data: [
          { id: 'l1', phone: '11988887777', created_at: '2026-01-01T00:00:00.000Z' },
          { id: 'l2', phone: '11988887777', created_at: '2026-01-02T00:00:00.000Z' },
          { id: 'l3', phone: '11977776666', created_at: '2026-01-01T00:00:00.000Z' },
        ], error: null,
      }],
    })
    const app = buildApp()
    const res = await request(app).post('/api/contacts/deduplicate')
    expect(res.body).toEqual({ removed: 1 })
    const del = deleteCallsFor('leads')[0]
    expect(del.args).toBeDefined()
    const limitCall = supabaseMock.calls.find((c) => c.table === 'leads' && c.method === 'limit')
    expect(limitCall.args[0]).toBe(20000)
  })

  it('GET /tags retorna as tags únicas e ordenadas', async () => {
    setSupabase({ leads: [{ data: [{ tags: ['vip', 'novo'] }, { tags: ['novo'] }, { tags: null }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/contacts/tags')
    expect(res.body.tags).toEqual(['novo', 'vip'])
  })
})
