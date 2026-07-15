import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, chat: null, permCalls: [] }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
  requirePermission: (...keys) => { mockState.permCalls.push(keys); return (req, res, next) => next() },
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

vi.mock('../../services/ai/openai.js', () => ({
  chat: (...args) => mockState.chat(...args),
}))

const { templatesRouter } = await import('../templates.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/templates', templatesRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^INSERT/.test(c.sql)) }

describe('routes/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.chat = vi.fn()
    setRls()
  })

  it('exige a permissão "templates" (enforcement de operador restrito) em toda a rota', () => {
    expect(mockState.permCalls).toContainEqual(['templates'])
  })

  describe('categorias', () => {
    it('GET /categories semeia as categorias padrão quando o tenant não tem nenhuma', async () => {
      rlsMock.queueRows([])
      rlsMock.queueRows([{ id: 'c1', name: 'Marketing' }, { id: 'c2', name: 'Utilidade' }])
      const app = buildApp()
      const res = await request(app).get('/api/templates/categories')
      expect(res.body.categories).toHaveLength(2)
      const insert = insertCallsMatching(/INSERT INTO template_categories/)[0]
      expect(insert.params).toEqual(['tenant-1', 'Marketing', 'tenant-1', 'Utilidade'])
    })

    it('GET /categories não semeia quando já existem categorias', async () => {
      rlsMock.queueRows([{ id: 'c1', name: 'Promoções' }])
      const app = buildApp()
      const res = await request(app).get('/api/templates/categories')
      expect(res.body.categories).toEqual([{ id: 'c1', name: 'Promoções' }])
      expect(insertCallsMatching(/INSERT INTO template_categories/).length).toBe(0)
    })

    it('POST /categories retorna 409 em nome duplicado', async () => {
      rlsMock.queueError(Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }))
      const app = buildApp()
      const res = await request(app).post('/api/templates/categories').send({ name: 'Marketing' })
      expect(res.status).toBe(409)
    })

    it('DELETE /categories/:id remove a categoria', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).delete('/api/templates/categories/c1')
      expect(res.status).toBe(200)
    })
  })

  describe('templates', () => {
    it('GET / lista os templates', async () => {
      rlsMock.queueRows([{ id: 't1', name: 'Boas-vindas' }])
      const app = buildApp()
      const res = await request(app).get('/api/templates')
      expect(res.body.templates).toHaveLength(1)
    })

    it('POST / rejeita payload inválido', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/templates').send({ name: '' })
      expect(res.status).toBe(400)
    })

    it('POST / cria o template usando "geral" como categoria padrão', async () => {
      rlsMock.queueRows([{ id: 't1', name: 'Boas-vindas', category: 'geral' }])
      const app = buildApp()
      const res = await request(app).post('/api/templates').send({ name: 'Boas-vindas', content: 'Olá!' })
      expect(res.status).toBe(201)
      const insert = insertCallsMatching(/INSERT INTO templates/)[0]
      expect(insert.params).toContain('geral')
    })

    it('PATCH /:id atualiza o template', async () => {
      rlsMock.queueRows([{ id: 't1', name: 'Novo nome' }])
      const app = buildApp()
      const res = await request(app).patch('/api/templates/t1').send({ name: 'Novo nome' })
      expect(res.status).toBe(200)
    })

    it('DELETE /:id remove o template', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).delete('/api/templates/t1')
      expect(res.status).toBe(200)
    })

    it('POST /:id/duplicate retorna 404 quando o template não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/templates/t-x/duplicate')
      expect(res.status).toBe(404)
    })

    it('POST /:id/duplicate cria uma cópia com "(cópia)" no nome', async () => {
      rlsMock.queueRows([{ id: 't1', name: 'Boas-vindas', category: 'geral', content: 'Olá!' }])
      rlsMock.queueRows([{ id: 't2', name: 'Boas-vindas (cópia)' }])
      const app = buildApp()
      const res = await request(app).post('/api/templates/t1/duplicate')
      expect(res.status).toBe(201)
      const insert = insertCallsMatching(/INSERT INTO templates/)[0]
      expect(insert.params).toContain('Boas-vindas (cópia)')
    })
  })

  describe('POST /:id/test', () => {
    it('retorna 404 quando o template não existe', async () => {
      rlsMock.queueRows([]) // templates
      rlsMock.queueRows([]) // ai_configs
      const app = buildApp()
      const res = await request(app).post('/api/templates/t-x/test').send({ context: 'lead perguntou o preço' })
      expect(res.status).toBe(404)
    })

    it('roda o template com a IA usando o system_prompt do tenant quando configurado', async () => {
      rlsMock.queueRows([{ id: 't1', content: 'Olá {{nome}}' }]) // templates
      rlsMock.queueRows([{ system_prompt: 'Seja cordial.', temperature: 0.5 }]) // ai_configs
      mockState.chat.mockResolvedValue({ content: 'Olá! Tudo bem?' })

      const app = buildApp()
      const res = await request(app).post('/api/templates/t1/test').send({ context: 'lead perguntou o preço' })

      expect(res.status).toBe(200)
      expect(res.body.result).toBe('Olá! Tudo bem?')
      const messages = mockState.chat.mock.calls[0][0].messages
      expect(messages[0]).toEqual({ role: 'system', content: 'Seja cordial.' })
      expect(messages[1].content).toContain('Olá {{nome}}')
    })
  })
})
