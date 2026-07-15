import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {} }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' }; next() },
  requireTenant: (req, res, next) => next(),
}))

vi.mock('../../config/index.js', () => ({
  config: {
    evolution: { apiUrl: 'https://evo.exemplo.com', apiKey: 'evo-key', webhookSecret: 'evo-webhook-secret' },
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

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
}))

const { channelsRouter } = await import('../channels.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/channels', channelsRouter)
  return app
}

let supabaseMock
let rlsMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function updateCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^UPDATE/.test(c.sql)) }

describe('routes/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setSupabase({})
    setRls()
  })

  it('GET / lista os canais do tenant', async () => {
    rlsMock.queueRows([{ id: 'ch1', name: 'Principal' }])
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
      rlsMock.queueRows([{ id: 'ch1', name: 'Principal' }])
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      const app = buildApp()
      const res = await request(app).post('/api/channels').send({ name: 'Principal' })

      expect(res.status).toBe(200)
      expect(res.body.channel.instance_name).toMatch(/^sdr_tenant1_ch1$/)
      expect(fetchMock.mock.calls[0][0]).toBe('https://evo.exemplo.com/instance/create')
      const instanceUpdate = updateCallsMatching(/channels/)[0]
      expect(instanceUpdate.params).toContain(res.body.channel.instance_name)

      // registra o webhook já na criação, com o header do EVOLUTION_WEBHOOK_SECRET
      expect(fetchMock.mock.calls[1][0]).toBe(`https://evo.exemplo.com/webhook/set/${res.body.channel.instance_name}`)
      const webhookBody = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(webhookBody.webhook.headers).toEqual({ apikey: 'evo-webhook-secret' })
      expect(webhookBody.webhook.url).toBe(`https://api.exemplo.com/webhooks/evolution/tenant-1`)
    })

    it('retorna 500 com a mensagem da Evolution quando a criação da instância falha', async () => {
      rlsMock.queueRows([{ id: 'ch1', name: 'Principal' }])
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'instância já existe' }) })

      const app = buildApp()
      const res = await request(app).post('/api/channels').send({ name: 'Principal' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('instância já existe')
    })
  })

  describe('GET /:id/qr', () => {
    it('retorna 404 quando o canal não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/channels/ch-x/qr')
      expect(res.status).toBe(404)
    })

    it('retorna o QR code diretamente quando o canal não está desconectado', async () => {
      rlsMock.queueRows([{ id: 'ch1', instance_name: 'sdr_x', status: 'connecting' }])
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ base64: 'data:image/png;base64,xyz' }) })

      const app = buildApp()
      const res = await request(app).get('/api/channels/ch1/qr')
      expect(res.status).toBe(200)
      expect(res.body.qr).toBe('data:image/png;base64,xyz')
    })

    it('reinicia a instância antes de gerar o QR quando o canal está desconectado', async () => {
      rlsMock.queueRows([{ id: 'ch1', instance_name: 'sdr_x', status: 'disconnected' }])
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ base64: 'xyz' }) })

      const app = buildApp()
      const res = await request(app).get('/api/channels/ch1/qr')

      expect(res.status).toBe(200)
      expect(fetchMock.mock.calls[0][0]).toBe('https://evo.exemplo.com/instance/restart/sdr_x')
    }, 10000)
  })

  describe('GET /:id/status', () => {
    it('retorna 404 quando o canal não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/channels/ch-x/status')
      expect(res.status).toBe(404)
    })

    it('atualiza o canal para connected quando o estado mudou', async () => {
      rlsMock.queueRows([{ id: 'ch1', instance_name: 'sdr_x', status: 'disconnected' }])
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ instance: { state: 'open', profileName: 'Ana' } }) })

      const app = buildApp()
      const res = await request(app).get('/api/channels/ch1/status')
      expect(res.body).toEqual({ status: 'connected', phone: 'Ana' })
      const update = updateCallsMatching(/channels/)[0]
      expect(update.params).toContain('connected')
      expect(update.params).toContain('Ana')
    })

    it('retorna disconnected sem quebrar quando a Evolution não responde ok', async () => {
      rlsMock.queueRows([{ id: 'ch1', instance_name: 'sdr_x', status: 'connected' }])
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false })

      const app = buildApp()
      const res = await request(app).get('/api/channels/ch1/status')
      expect(res.body).toEqual({ status: 'disconnected', phone: null })
    })
  })

  it('PATCH /:id/settings retorna 404 quando não encontrado', async () => {
    rlsMock.queueRows([])
    const app = buildApp()
    const res = await request(app).patch('/api/channels/ch-x/settings').send({ name: 'Novo' })
    expect(res.status).toBe(404)
  })

  it('PATCH /:id/settings rejeita payload inválido (nome longo demais)', async () => {
    const app = buildApp()
    const res = await request(app).patch('/api/channels/ch1/settings').send({ name: 'x'.repeat(61) })
    expect(res.status).toBe(400)
  })

  it('PATCH /:id/settings atualiza apenas os campos enviados', async () => {
    rlsMock.queueRows([{ id: 'ch1', goodbye_message: 'Até mais!' }])
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
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/channels/ch-x').send({ name: 'Novo nome' })
      expect(res.status).toBe(404)
    })

    it('renomeia com sucesso', async () => {
      rlsMock.queueRows([{ id: 'ch1', name: 'Novo nome' }])
      const app = buildApp()
      const res = await request(app).patch('/api/channels/ch1').send({ name: 'Novo nome' })
      expect(res.status).toBe(200)
    })
  })

  describe('PATCH /:id/default', () => {
    it('retorna 404 quando não encontrado', async () => {
      rlsMock.queueRows([]) // unset all (sem retorno)
      rlsMock.queueRows([]) // set selecionado -> nao encontrado
      const app = buildApp()
      const res = await request(app).patch('/api/channels/ch-x/default')
      expect(res.status).toBe(404)
    })

    it('remove o padrão dos demais e define o canal selecionado', async () => {
      rlsMock.queueRows([]) // unset all (sem retorno)
      rlsMock.queueRows([{ id: 'ch1', is_default: true }])
      const app = buildApp()
      const res = await request(app).patch('/api/channels/ch1/default')
      expect(res.status).toBe(200)
      const unsetAll = rlsMock.calls.find((c) => /UPDATE channels SET is_default = false/.test(c.sql))
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
      rlsMock.queueRows([{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }, { id: 'l4' }, { id: 'l5' }])
      const app = buildApp()
      const res = await request(app).post('/api/channels/ch1/close-tickets').send({ status: 'open' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ closed: 5 })
    })

    it('filtra os leads pelo :id do canal informado na URL (não fecha tickets de outros canais)', async () => {
      rlsMock.queueRows([{ id: 'l1' }, { id: 'l2' }])
      const app = buildApp()
      await request(app).post('/api/channels/ch1/close-tickets').send({ status: 'open' })
      const updateCall = updateCallsMatching(/leads/)[0]
      expect(updateCall).toBeTruthy()
      expect(updateCall.params).toContain('ch1')
    })
  })

  describe('POST /:id/revalidate-webhook', () => {
    it('retorna 404 quando o canal não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/channels/ch-x/revalidate-webhook')
      expect(res.status).toBe(404)
    })

    it('revalida o webhook com sucesso, gera um segredo por-canal e o envia no header', async () => {
      rlsMock.queueRows([{ instance_name: 'sdr_x' }]) // lookup do canal (withTenant)
      setSupabase({
        channels: [
          { data: [{ webhook_secret: null }], error: null }, // getOrCreateChannelWebhookSecret: select
          { data: null, error: null },                       // getOrCreateChannelWebhookSecret: update
        ],
      })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      const app = buildApp()
      const res = await request(app).post('/api/channels/ch1/revalidate-webhook')
      expect(res.status).toBe(200)
      expect(res.body.webhookUrl).toBe('https://api.exemplo.com/webhooks/evolution/tenant-1')
      expect(fetchMock.mock.calls[0][0]).toBe('https://evo.exemplo.com/webhook/set/sdr_x')
      const webhookBody = JSON.parse(fetchMock.mock.calls[0][1].body)
      // segredo por-canal gerado on-the-fly (UUID) — não é mais o EVOLUTION_WEBHOOK_SECRET global
      expect(typeof webhookBody.webhook.headers.apikey).toBe('string')
      expect(webhookBody.webhook.headers.apikey).not.toBe('evo-webhook-secret')
      const updateCall = supabaseMock.calls.find((c) => c.table === 'channels' && c.method === 'update')
      expect(updateCall.args[0]).toEqual({ webhook_secret: webhookBody.webhook.headers.apikey })
    })

    it('reutiliza o segredo por-canal já existente em vez de gerar um novo', async () => {
      rlsMock.queueRows([{ instance_name: 'sdr_x' }])
      setSupabase({
        channels: [
          { data: [{ webhook_secret: 'segredo-ja-existente' }], error: null },
        ],
      })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      const app = buildApp()
      await request(app).post('/api/channels/ch1/revalidate-webhook')
      const webhookBody = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(webhookBody.webhook.headers).toEqual({ apikey: 'segredo-ja-existente' })
      expect(supabaseMock.calls.filter((c) => c.table === 'channels' && c.method === 'update')).toHaveLength(0)
    })

    it('retorna 500 quando a Evolution rejeita o webhook', async () => {
      rlsMock.queueRows([{ instance_name: 'sdr_x' }])
      setSupabase({ channels: [{ data: [{ webhook_secret: 'segredo' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'payload inválido' }) })

      const app = buildApp()
      const res = await request(app).post('/api/channels/ch1/revalidate-webhook')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /:id/disconnect', () => {
    it('retorna 404 quando o canal não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/channels/ch-x/disconnect')
      expect(res.status).toBe(404)
    })

    it('desconecta com sucesso mesmo se a chamada de logout à Evolution falhar', async () => {
      rlsMock.queueRows([{ instance_name: 'sdr_x' }])
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'))

      const app = buildApp()
      const res = await request(app).post('/api/channels/ch1/disconnect')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ disconnected: true })
      const update = updateCallsMatching(/channels/)[0]
      expect(update.params).toContain('disconnected')
    })
  })

  describe('DELETE /:id', () => {
    it('retorna 404 quando o canal não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).delete('/api/channels/ch-x')
      expect(res.status).toBe(404)
    })

    it('remove o canal com sucesso', async () => {
      rlsMock.queueRows([{ instance_name: 'sdr_x' }])
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      const app = buildApp()
      const res = await request(app).delete('/api/channels/ch1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ deleted: true })
    })
  })
})
