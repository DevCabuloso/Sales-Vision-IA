import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {} }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../config/index.js', () => ({
  config: {
    evolution: { apiUrl: 'https://evo.exemplo.com', apiKey: 'evo-key' },
    backendUrl: 'https://api.exemplo.com',
  },
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

const { channelsRouter } = await import('../channels.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/channels', channelsRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function updateCallsFor(table) { return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update') }

describe('routes/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET / lista os canais do tenant', async () => {
    setSupabase({ channels: [{ data: [{ id: 'ch1', name: 'Principal' }], error: null }] })
    const app = buildApp()
    const res = await request(app).get('/api/channels')
    expect(res.body.channels).toHaveLength(1)
  })

  describe('POST / (criar canal)', () => {
    it('rejeita nome vazio', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/channels').send({ name: '' })
      expect(res.status).toBe(400)
    })

    it('cria o canal, gera o instance_name e registra a instância na Evolution', async () => {
      setSupabase({ channels: [{ data: [{ id: 'ch1', name: 'Principal' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      const app = buildApp()
      const res = await request(app).post('/api/channels').send({ name: 'Principal' })

      expect(res.status).toBe(200)
      expect(res.body.channel.instance_name).toMatch(/^sdr_tenant1_ch1$/)
      expect(fetchMock.mock.calls[0][0]).toBe('https://evo.exemplo.com/instance/create')
      const instanceUpdate = updateCallsFor('channels')[0]
      expect(instanceUpdate.args[0].instance_name).toBe(res.body.channel.instance_name)
    })

    it('retorna 500 com a mensagem da Evolution quando a criação da instância falha', async () => {
      setSupabase({ channels: [{ data: [{ id: 'ch1', name: 'Principal' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'instância já existe' }) })

      const app = buildApp()
      const res = await request(app).post('/api/channels').send({ name: 'Principal' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('instância já existe')
    })
  })

  describe('GET /:id/qr', () => {
    it('retorna 404 quando o canal não existe', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/channels/ch-x/qr')
      expect(res.status).toBe(404)
    })

    it('retorna o QR code diretamente quando o canal não está desconectado', async () => {
      setSupabase({ channels: [{ data: [{ id: 'ch1', instance_name: 'sdr_x', status: 'connecting' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ base64: 'data:image/png;base64,xyz' }) })

      const app = buildApp()
      const res = await request(app).get('/api/channels/ch1/qr')
      expect(res.status).toBe(200)
      expect(res.body.qr).toBe('data:image/png;base64,xyz')
    })

    it('reinicia a instância antes de gerar o QR quando o canal está desconectado', async () => {
      setSupabase({ channels: [{ data: [{ id: 'ch1', instance_name: 'sdr_x', status: 'disconnected' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ base64: 'xyz' }) })

      const app = buildApp()
      const res = await request(app).get('/api/channels/ch1/qr')

      expect(res.status).toBe(200)
      expect(fetchMock.mock.calls[0][0]).toBe('https://evo.exemplo.com/instance/restart/sdr_x')
    }, 10000)
  })

  describe('GET /:id/status', () => {
    it('retorna 404 quando o canal não existe', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/channels/ch-x/status')
      expect(res.status).toBe(404)
    })

    it('atualiza o canal para connected quando o estado mudou', async () => {
      setSupabase({ channels: [{ data: [{ id: 'ch1', instance_name: 'sdr_x', status: 'disconnected' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ instance: { state: 'open', profileName: 'Ana' } }) })

      const app = buildApp()
      const res = await request(app).get('/api/channels/ch1/status')
      expect(res.body).toEqual({ status: 'connected', phone: 'Ana' })
      const update = updateCallsFor('channels')[0]
      expect(update.args[0]).toMatchObject({ status: 'connected', phone: 'Ana' })
    })

    it('retorna disconnected sem quebrar quando a Evolution não responde ok', async () => {
      setSupabase({ channels: [{ data: [{ id: 'ch1', instance_name: 'sdr_x', status: 'connected' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false })

      const app = buildApp()
      const res = await request(app).get('/api/channels/ch1/status')
      expect(res.body).toEqual({ status: 'disconnected', phone: null })
    })
  })

  it('PATCH /:id/settings retorna 404 quando não encontrado', async () => {
    setSupabase({ channels: [{ data: [], error: null }] })
    const app = buildApp()
    const res = await request(app).patch('/api/channels/ch-x/settings').send({ name: 'Novo' })
    expect(res.status).toBe(404)
  })

  it('PATCH /:id/settings atualiza apenas os campos enviados', async () => {
    setSupabase({ channels: [{ data: [{ id: 'ch1', goodbye_message: 'Até mais!' }], error: null }] })
    const app = buildApp()
    const res = await request(app).patch('/api/channels/ch1/settings').send({ goodbye_message: 'Até mais!' })
    expect(res.status).toBe(200)
  })

  describe('PATCH /:id (renomear)', () => {
    it('exige nome', async () => {
      const app = buildApp()
      const res = await request(app).patch('/api/channels/ch1').send({})
      expect(res.status).toBe(400)
    })

    it('retorna 404 quando não encontrado', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/channels/ch-x').send({ name: 'Novo nome' })
      expect(res.status).toBe(404)
    })

    it('renomeia com sucesso', async () => {
      setSupabase({ channels: [{ data: [{ id: 'ch1', name: 'Novo nome' }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/channels/ch1').send({ name: 'Novo nome' })
      expect(res.status).toBe(200)
    })
  })

  describe('PATCH /:id/default', () => {
    it('retorna 404 quando não encontrado', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/channels/ch-x/default')
      expect(res.status).toBe(404)
    })

    it('remove o padrão dos demais e define o canal selecionado', async () => {
      setSupabase({ channels: [{ data: [{ id: 'ch1', is_default: true }], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/channels/ch1/default')
      expect(res.status).toBe(200)
      const unsetAll = updateCallsFor('channels').find((c) => c.args[0]?.is_default === false)
      expect(unsetAll).toBeTruthy()
    })
  })

  describe('POST /:id/close-tickets', () => {
    it('rejeita status inválido', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/channels/ch1/close-tickets').send({ status: 'invalido' })
      expect(res.status).toBe(400)
    })

    it('fecha os tickets e retorna a contagem', async () => {
      setSupabase({ leads: [{ data: null, error: null, count: 5 }, { data: null, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/channels/ch1/close-tickets').send({ status: 'open' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ closed: 5 })
    })
  })

  describe('POST /:id/revalidate-webhook', () => {
    it('retorna 404 quando o canal não existe', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/channels/ch-x/revalidate-webhook')
      expect(res.status).toBe(404)
    })

    it('revalida o webhook com sucesso', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'sdr_x' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      const app = buildApp()
      const res = await request(app).post('/api/channels/ch1/revalidate-webhook')
      expect(res.status).toBe(200)
      expect(res.body.webhookUrl).toBe('https://api.exemplo.com/webhooks/evolution/tenant-1')
      expect(fetchMock.mock.calls[0][0]).toBe('https://evo.exemplo.com/webhook/set/sdr_x')
    })

    it('retorna 500 quando a Evolution rejeita o webhook', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'sdr_x' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'payload inválido' }) })

      const app = buildApp()
      const res = await request(app).post('/api/channels/ch1/revalidate-webhook')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /:id/disconnect', () => {
    it('retorna 404 quando o canal não existe', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/channels/ch-x/disconnect')
      expect(res.status).toBe(404)
    })

    it('desconecta com sucesso mesmo se a chamada de logout à Evolution falhar', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'sdr_x' }], error: null }] })
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'))

      const app = buildApp()
      const res = await request(app).post('/api/channels/ch1/disconnect')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ disconnected: true })
      const update = updateCallsFor('channels')[0]
      expect(update.args[0]).toMatchObject({ status: 'disconnected', phone: null })
    })
  })

  describe('DELETE /:id', () => {
    it('retorna 404 quando o canal não existe', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/channels/ch-x')
      expect(res.status).toBe(404)
    })

    it('remove o canal com sucesso', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'sdr_x' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      const app = buildApp()
      const res = await request(app).delete('/api/channels/ch1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ deleted: true })
    })
  })
})
