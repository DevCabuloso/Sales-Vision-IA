import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, uploadChatMedia: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

vi.mock('../../services/mediaStorage.js', () => ({
  uploadChatMedia: (...args) => mockState.uploadChatMedia(...args),
}))

const { followupsRouter } = await import('../followups.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/followups', followupsRouter)
  return app
}

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^INSERT/.test(c.sql)) }
function deleteCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^DELETE/.test(c.sql)) }

const validSequence = {
  name: 'Pós-venda',
  time_mode: 'general',
  default_send_time: '09:00',
  steps: [{ delay_days: 0, text: 'Oi! Passando para saber se ficou tudo certo.' }],
}

describe('routes/followups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.uploadChatMedia = vi.fn().mockResolvedValue('https://cdn.exemplo.com/arquivo.png')
    setRls()
  })

  describe('GET /', () => {
    it('retorna lista vazia quando não há sequências', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/followups')
      expect(res.body).toEqual({ sequences: [] })
    })

    it('inclui steps_count e active_count por sequência', async () => {
      rlsMock.queueRows([{ id: 's1', name: 'Pós-venda' }])
      rlsMock.queueRows([{ sequence_id: 's1' }, { sequence_id: 's1' }])
      rlsMock.queueRows([{ sequence_id: 's1' }])
      const app = buildApp()
      const res = await request(app).get('/api/followups')
      expect(res.body.sequences[0]).toMatchObject({ steps_count: 2, active_count: 1 })
    })
  })

  describe('GET /:id', () => {
    it('retorna 404 quando não encontrado', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/followups/s-x')
      expect(res.status).toBe(404)
    })

    it('retorna a sequência com suas etapas', async () => {
      rlsMock.queueRows([{ id: 's1', name: 'Pós-venda' }])
      rlsMock.queueRows([{ id: 'step-1', order_index: 0 }])
      const app = buildApp()
      const res = await request(app).get('/api/followups/s1')
      expect(res.body.sequence.name).toBe('Pós-venda')
      expect(res.body.steps).toHaveLength(1)
    })
  })

  describe('POST /', () => {
    it('rejeita horário fora do formato HH:mm', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/followups').send({ ...validSequence, default_send_time: '9h' })
      expect(res.status).toBe(400)
    })

    it('exige pelo menos uma etapa', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/followups').send({ ...validSequence, steps: [] })
      expect(res.status).toBe(400)
    })

    it('cria a sequência e suas etapas', async () => {
      rlsMock.queueRows([{ id: 's1', name: 'Pós-venda' }])
      rlsMock.queueRows([{ id: 'step-1', order_index: 0 }])
      const app = buildApp()
      const res = await request(app).post('/api/followups').send(validSequence)
      expect(res.status).toBe(201)
      expect(res.body.steps).toHaveLength(1)
    })
  })

  describe('PATCH /:id', () => {
    it('retorna 404 quando não encontrado', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/followups/s-x').send({ name: 'Novo nome' })
      expect(res.status).toBe(404)
    })

    it('atualiza nome sem mexer nas etapas quando "steps" não é enviado', async () => {
      rlsMock.queueRows([{ id: 's1' }])
      rlsMock.queueRows([{ id: 's1', name: 'Novo nome' }])
      rlsMock.queueRows([{ id: 'step-1' }])
      const app = buildApp()
      const res = await request(app).patch('/api/followups/s1').send({ name: 'Novo nome' })
      expect(res.status).toBe(200)
      expect(deleteCallsMatching(/followup_steps/).length).toBe(0)
    })

    it('substitui as etapas quando "steps" é enviado', async () => {
      rlsMock.queueRows([{ id: 's1' }])
      rlsMock.queueRows([{ id: 's1', name: 'Pós-venda' }])
      rlsMock.queueRows([{ id: 'step-novo' }])
      const app = buildApp()
      const res = await request(app).patch('/api/followups/s1').send(validSequence)
      expect(res.status).toBe(200)
      expect(deleteCallsMatching(/followup_steps/).length).toBe(1)
      expect(insertCallsMatching(/followup_steps/).length).toBe(1)
    })
  })

  describe('DELETE /:id', () => {
    // Regressão: followup_steps/followup_enrollments referenciam a sequência via FK sem
    // ON DELETE CASCADE — apagar a sequência sem tratar isso falharia por violação de FK.
    it('remove a sequência e suas etapas quando não há inscrições', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).delete('/api/followups/s1')
      expect(res.status).toBe(200)
      expect(deleteCallsMatching(/followup_steps/)).toHaveLength(1)
      expect(deleteCallsMatching(/followup_sequences/)).toHaveLength(1)
    })

    it('bloqueia a exclusão quando há contatos inscritos (ativos ou concluídos)', async () => {
      rlsMock.queueRows([{ id: 'enr-1' }])
      const app = buildApp()
      const res = await request(app).delete('/api/followups/s1')
      expect(res.status).toBe(400)
      expect(deleteCallsMatching(/followup_sequences/)).toHaveLength(0)
    })
  })

  describe('POST /:id/duplicate', () => {
    it('retorna 404 quando não encontrado', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/followups/s-x/duplicate')
      expect(res.status).toBe(404)
    })

    it('duplica a sequência com "(cópia)" no nome e copia as etapas', async () => {
      rlsMock.queueRows([{ id: 's1', name: 'Pós-venda', description: null, time_mode: 'general', default_send_time: '09:00' }])
      rlsMock.queueRows([{ order_index: 0, delay_days: 0, text: 'Oi!', media_url: null, media_type: null, media_mimetype: null, media_filename: null, send_time: null }])
      rlsMock.queueRows([{ id: 's2', name: 'Pós-venda (cópia)' }])
      rlsMock.queueRows([{ id: 'step-copiado' }])
      const app = buildApp()
      const res = await request(app).post('/api/followups/s1/duplicate')
      expect(res.status).toBe(201)
      expect(res.body.sequence.name).toBe('Pós-venda (cópia)')
      expect(res.body.steps).toHaveLength(1)
    })
  })

  describe('POST /:id/steps/:stepId/media', () => {
    it('rejeita quando nenhum arquivo é enviado', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/followups/s1/steps/step-1/media')
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando a etapa não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/followups/s1/steps/step-x/media').attach('file', Buffer.from('imagem'), { filename: 'foto.png', contentType: 'image/png' })
      expect(res.status).toBe(404)
    })

    it('anexa a mídia e atualiza a etapa', async () => {
      rlsMock.queueRows([{ id: 'step-1' }])
      rlsMock.queueRows([{ id: 'step-1', media_url: 'https://cdn.exemplo.com/arquivo.png' }])
      const app = buildApp()
      const res = await request(app).post('/api/followups/s1/steps/step-1/media').attach('file', Buffer.from('imagem'), { filename: 'foto.png', contentType: 'image/png' })
      expect(res.status).toBe(200)
      expect(res.body.step.media_url).toBe('https://cdn.exemplo.com/arquivo.png')
    })
  })
})
