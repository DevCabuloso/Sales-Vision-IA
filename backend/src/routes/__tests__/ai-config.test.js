import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import * as XLSX from 'xlsx'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, chat: null, buildSystemContent: null, encrypt: null, decryptJSON: null, invalidateTenantCache: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

vi.mock('../../services/ai/openai.js', () => ({
  chat: (...args) => mockState.chat(...args),
}))

vi.mock('../../services/ai/agent.js', () => ({
  buildSystemContent: (...args) => mockState.buildSystemContent(...args),
}))

vi.mock('../../services/crypto.js', () => ({
  encrypt: (...args) => mockState.encrypt(...args),
  decryptJSON: (...args) => mockState.decryptJSON(...args),
}))

vi.mock('../../services/orchestrator.js', () => ({
  invalidateTenantCache: (...args) => mockState.invalidateTenantCache(...args),
}))

const { aiConfigRouter } = await import('../ai-config.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/ai-config', aiConfigRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql)) }
// Lê um parâmetro pelo nome da coluna, independente da ordem em que o
// upsertAiConfig monta o INSERT dinâmico.
function paramNamed(call, col) {
  const cols = call.sql.match(/INSERT INTO \w+ \(([^)]+)\)/)[1].split(',').map((s) => s.trim())
  return call.params[cols.indexOf(col)]
}

describe('routes/ai-config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.chat = vi.fn()
    mockState.buildSystemContent = vi.fn().mockReturnValue('system prompt')
    mockState.encrypt = vi.fn((v) => `enc(${v})`)
    mockState.decryptJSON = vi.fn((v) => v.replace(/^enc\(|\)$/g, ''))
    mockState.invalidateTenantCache = vi.fn()
    setRls()
  })

  describe('GET /', () => {
    it('retorna null quando o tenant não tem configuração', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/ai-config')
      expect(res.body).toEqual({ config: null })
    })

    it('remove a chave crua e expõe apenas has_openai_key', async () => {
      rlsMock.queueRows([{ name: 'x', openai_api_key: 'enc(sk-123)' }])
      const app = buildApp()
      const res = await request(app).get('/api/ai-config')
      expect(res.body.config.has_openai_key).toBe(true)
      expect(res.body.config.openai_api_key).toBeUndefined()
    })
  })

  describe('PUT /', () => {
    it('rejeita temperatura fora do range', async () => {
      const app = buildApp()
      const res = await request(app).put('/api/ai-config').send({ temperature: 5 })
      expect(res.status).toBe(400)
    })

    it('não altera a chave quando o campo é omitido', async () => {
      rlsMock.queueRows([{ name: 'x' }])
      const app = buildApp()
      const res = await request(app).put('/api/ai-config').send({ name: 'x' })
      expect(res.status).toBe(200)
      const insert = insertCallsMatching(/INSERT INTO ai_configs/)[0]
      expect(insert.sql).not.toContain('openai_api_key')
    })

    it('criptografa a chave quando enviada', async () => {
      rlsMock.queueRows([{ name: 'x' }])
      const app = buildApp()
      await request(app).put('/api/ai-config').send({ openai_api_key: 'sk-nova-chave' })
      const insert = insertCallsMatching(/INSERT INTO ai_configs/)[0]
      expect(paramNamed(insert, 'openai_api_key')).toBe('enc(sk-nova-chave)')
    })

    it('limpa a chave quando enviada como null', async () => {
      rlsMock.queueRows([{ name: 'x' }])
      const app = buildApp()
      await request(app).put('/api/ai-config').send({ openai_api_key: null })
      const insert = insertCallsMatching(/INSERT INTO ai_configs/)[0]
      expect(paramNamed(insert, 'openai_api_key')).toBeNull()
    })
  })

  describe('GET /status e POST /toggle', () => {
    it('GET /status retorna true por padrão', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/ai-config/status')
      expect(res.body).toEqual({ ai_enabled: true })
    })

    it('POST /toggle com body explícito define o valor exato e invalida o cache', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/ai-config/toggle').send({ ai_enabled: false })
      expect(res.body).toEqual({ ai_enabled: false })
      expect(mockState.invalidateTenantCache).toHaveBeenCalledWith('tenant-1')
    })

    it('POST /toggle sem body inverte o valor atual', async () => {
      rlsMock.queueRows([{ ai_enabled: true }])
      const app = buildApp()
      const res = await request(app).post('/api/ai-config/toggle')
      expect(res.body).toEqual({ ai_enabled: false })
    })
  })

  describe('POST /test', () => {
    it('roda a IA usando o system prompt construído e a chave descriptografada', async () => {
      rlsMock.queueRows([{ openai_api_key: 'enc(sk-tenant)', temperature: 0.5, max_tokens: 500 }])
      mockState.chat.mockResolvedValue({ content: 'Olá! Como posso ajudar?' })

      const app = buildApp()
      const res = await request(app).post('/api/ai-config/test').send({ message: 'oi' })

      expect(res.status).toBe(200)
      expect(res.body.reply).toBe('Olá! Como posso ajudar?')
      expect(mockState.chat.mock.calls[0][0].apiKey).toBe('sk-tenant')
    })
  })

  describe('POST /knowledge-base', () => {
    it('rejeita quando nenhum arquivo é enviado', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/ai-config/knowledge-base')
      expect(res.status).toBe(400)
    })

    it('extrai texto de um arquivo .txt e salva na base de conhecimento', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/ai-config/knowledge-base')
        .attach('file', Buffer.from('Catálogo: Produto X R$100'), 'catalogo.txt')

      expect(res.status).toBe(200)
      const insert = insertCallsMatching(/INSERT INTO ai_configs/)[0]
      expect(paramNamed(insert, 'knowledge_base')).toBe('Catálogo: Produto X R$100')
      expect(paramNamed(insert, 'knowledge_base_filename')).toBe('catalogo.txt')
    })

    it('extrai texto de uma planilha XLSX', async () => {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([['Produto', 'Preço'], ['Produto X', '100']])
      XLSX.utils.book_append_sheet(wb, ws, 'Catálogo')
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      const app = buildApp()
      const res = await request(app).post('/api/ai-config/knowledge-base').attach('file', buffer, 'catalogo.xlsx')
      expect(res.status).toBe(200)
      const insert = insertCallsMatching(/INSERT INTO ai_configs/)[0]
      expect(paramNamed(insert, 'knowledge_base')).toContain('Produto X')
    })

    it('trunca o texto extraído em 15000 caracteres e sinaliza truncated=true', async () => {
      const bigText = 'A'.repeat(20000)
      const app = buildApp()
      const res = await request(app).post('/api/ai-config/knowledge-base').attach('file', Buffer.from(bigText), 'grande.txt')
      expect(res.body.truncated).toBe(true)
      const insert = insertCallsMatching(/INSERT INTO ai_configs/)[0]
      expect(paramNamed(insert, 'knowledge_base')).toHaveLength(15000)
    })

    it('retorna 400 para formato de arquivo não suportado', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/ai-config/knowledge-base').attach('file', Buffer.from('binário'), 'arquivo.docx')
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/Formato não suportado/)
    })
  })

  it('DELETE /knowledge-base limpa os campos da base de conhecimento', async () => {
    const app = buildApp()
    const res = await request(app).delete('/api/ai-config/knowledge-base')
    expect(res.status).toBe(200)
    const insert = insertCallsMatching(/INSERT INTO ai_configs/)[0]
    expect(paramNamed(insert, 'knowledge_base')).toBeNull()
    expect(paramNamed(insert, 'knowledge_base_filename')).toBeNull()
  })
})
