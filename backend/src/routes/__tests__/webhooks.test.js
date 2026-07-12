import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import crypto from 'node:crypto'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({
  box: {},
  metaParseWebhook: null,
  metaParseWebhookStatuses: null,
  evolutionParseWebhook: null,
  evolutionParseWebhookStatus: null,
  handleInboundMessage: null,
  handleOutboundMessage: null,
}))

vi.mock('../../config/index.js', () => ({
  config: {
    meta: { graphVersion: 'v21.0', verifyToken: 'sdr-verify', appSecret: '' },
    evolution: { apiUrl: '', apiKey: '', webhookSecret: '' },
  },
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../../services/whatsapp/index.js', () => ({
  meta: {
    parseWebhook: (...args) => mockState.metaParseWebhook(...args),
    parseWebhookStatuses: (...args) => mockState.metaParseWebhookStatuses(...args),
  },
  evolution: {
    parseWebhook: (...args) => mockState.evolutionParseWebhook(...args),
    parseWebhookStatus: (...args) => mockState.evolutionParseWebhookStatus(...args),
  },
}))

vi.mock('../../services/orchestrator.js', () => ({
  handleInboundMessage: (...args) => mockState.handleInboundMessage(...args),
  handleOutboundMessage: (...args) => mockState.handleOutboundMessage(...args),
}))

const { webhooksRouter } = await import('../webhooks.js')
const { config } = await import('../../config/index.js')

function buildApp() {
  const app = express()
  app.use('/webhooks', webhooksRouter)
  return app
}

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

function updateCallsFor(table) {
  return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update')
}

// os handlers respondem 200 imediatamente e processam o resto em background —
// precisa de um respiro para os microtasks internos rodarem antes de checar os mocks
const flush = () => new Promise((r) => setTimeout(r, 20))

describe('routes/webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.metaParseWebhook = vi.fn().mockReturnValue([])
    mockState.metaParseWebhookStatuses = vi.fn().mockReturnValue([])
    mockState.evolutionParseWebhook = vi.fn().mockReturnValue(null)
    mockState.evolutionParseWebhookStatus = vi.fn().mockReturnValue([])
    mockState.handleInboundMessage = vi.fn().mockResolvedValue({})
    mockState.handleOutboundMessage = vi.fn().mockResolvedValue({})
    config.meta.appSecret = ''
    config.evolution.webhookSecret = ''
  })

  describe('GET /meta (verificação)', () => {
    it('responde com o challenge quando mode e token conferem', async () => {
      const app = buildApp()
      const res = await request(app).get('/webhooks/meta').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'sdr-verify', 'hub.challenge': '12345' })
      expect(res.status).toBe(200)
      expect(res.text).toBe('12345')
    })

    it('retorna 403 quando o token não confere', async () => {
      const app = buildApp()
      const res = await request(app).get('/webhooks/meta').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'token-errado', 'hub.challenge': '12345' })
      expect(res.status).toBe(403)
    })

    it('retorna 403 (em vez de quebrar) quando hub.challenge vem duplicado (array, não string)', async () => {
      const app = buildApp()
      const res = await request(app)
        .get('/webhooks/meta')
        .query('hub.mode=subscribe&hub.verify_token=sdr-verify&hub.challenge=a&hub.challenge=b')
      expect(res.status).toBe(403)
    })
  })

  describe('POST /meta (recebimento)', () => {
    it('rejeita com 403 quando a assinatura HMAC é inválida (META_APP_SECRET configurado)', async () => {
      config.meta.appSecret = 'segredo-do-app'
      const app = buildApp()
      const res = await request(app)
        .post('/webhooks/meta')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', 'sha256=assinatura-invalida')
        .send(JSON.stringify({ entry: [] }))

      expect(res.status).toBe(403)
      await flush()
      expect(mockState.handleInboundMessage).not.toHaveBeenCalled()
    })

    it('retorna 403 (em vez de derrubar o processo) quando o header de assinatura é maior que o formato esperado', async () => {
      // regressão: crypto.timingSafeEqual lança quando os buffers têm tamanhos
      // diferentes; sem validar o formato antes, isso escapava do handler async
      // como uma promise rejeitada não tratada (crashava o processo Node).
      config.meta.appSecret = 'segredo-do-app'
      const payload = JSON.stringify({ entry: [] })
      const oversizedSig = 'sha256=' + 'a'.repeat(200)

      const app = buildApp()
      const res = await request(app)
        .post('/webhooks/meta')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', oversizedSig)
        .send(payload)

      expect(res.status).toBe(403)
      await flush()
      expect(mockState.handleInboundMessage).not.toHaveBeenCalled()
    })

    it('retorna 403 quando o header de assinatura não tem o formato sha256=<hex>', async () => {
      config.meta.appSecret = 'segredo-do-app'
      const app = buildApp()
      const res = await request(app)
        .post('/webhooks/meta')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', 'nao-e-um-hmac-valido')
        .send(JSON.stringify({ entry: [] }))

      expect(res.status).toBe(403)
    })

    it('retorna 403 quando o header de assinatura está ausente', async () => {
      config.meta.appSecret = 'segredo-do-app'
      const app = buildApp()
      const res = await request(app)
        .post('/webhooks/meta')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ entry: [] }))

      expect(res.status).toBe(403)
    })

    it('aceita quando a assinatura HMAC é válida e processa a mensagem', async () => {
      config.meta.appSecret = 'segredo-do-app'
      const payload = JSON.stringify({ entry: [{ changes: [{ value: {} }] }] })
      const sig = 'sha256=' + crypto.createHmac('sha256', 'segredo-do-app').update(payload).digest('hex')

      setSupabase({ integrations: [{ data: [{ tenant_id: 'tenant-1', meta: { phoneNumberId: 'phone-1' } }], error: null }] })
      mockState.metaParseWebhook.mockReturnValue([{ from: '5511988887777', text: 'Oi', phoneNumberId: 'phone-1', pushName: 'Ana', waMessageId: 'wamid-1', replyToWaId: null }])

      const app = buildApp()
      const res = await request(app).post('/webhooks/meta').set('Content-Type', 'application/json').set('x-hub-signature-256', sig).send(payload)

      expect(res.status).toBe(200)
      await flush()
      expect(mockState.handleInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', from: '5511988887777', text: 'Oi', provider: 'meta_whatsapp' }))
    })

    it('chama handleInboundMessage apenas para o tenant cujo phoneNumberId corresponde', async () => {
      setSupabase({ integrations: [{ data: [{ tenant_id: 'tenant-2', meta: { phoneNumberId: 'phone-2' } }], error: null }] })
      mockState.metaParseWebhook.mockReturnValue([{ from: '5511988887777', text: 'Oi', phoneNumberId: 'phone-nao-cadastrado' }])

      const app = buildApp()
      await request(app).post('/webhooks/meta').set('Content-Type', 'application/json').send(JSON.stringify({}))
      await flush()

      expect(mockState.handleInboundMessage).not.toHaveBeenCalled()
    })

    it('atualiza o status de entrega da campanha quando recebe evento de status "delivered"', async () => {
      setSupabase({
        integrations: [{ data: [{ tenant_id: 'tenant-1', meta: { phoneNumberId: 'phone-1' } }], error: null }],
        broadcast_contacts: [{ data: [{ campaign_id: 'camp-1' }], error: null }, { data: [{ status: 'delivered' }], error: null }],
      })
      mockState.metaParseWebhookStatuses.mockReturnValue([{ messageId: 'wamid-1', recipientId: '5511988887777', status: 'delivered', phoneNumberId: 'phone-1' }])

      const app = buildApp()
      await request(app).post('/webhooks/meta').set('Content-Type', 'application/json').send(JSON.stringify({}))
      await flush()

      const contactUpdate = updateCallsFor('broadcast_contacts')[0]
      expect(contactUpdate.args[0]).toMatchObject({ status: 'delivered' })
      const campaignUpdate = updateCallsFor('broadcast_campaigns')[0]
      expect(campaignUpdate.args[0]).toMatchObject({ delivered_count: 1 })
    })

    it('não tenta atualizar status de campanha quando o status reportado é "failed"', async () => {
      setSupabase({ integrations: [{ data: [{ tenant_id: 'tenant-1', meta: { phoneNumberId: 'phone-1' } }], error: null }] })
      mockState.metaParseWebhookStatuses.mockReturnValue([{ messageId: 'wamid-1', recipientId: '5511988887777', status: 'failed', phoneNumberId: 'phone-1', error: 'número inválido' }])

      const app = buildApp()
      await request(app).post('/webhooks/meta').set('Content-Type', 'application/json').send(JSON.stringify({}))
      await flush()

      expect(updateCallsFor('broadcast_contacts').length).toBe(0)
    })
  })

  describe('POST /evolution (rota universal)', () => {
    it('rejeita com 403 quando o secret do header não confere', async () => {
      config.evolution.webhookSecret = 'segredo-evo'
      const app = buildApp()
      const res = await request(app).post('/webhooks/evolution').set('apikey', 'secret-errado').send({ event: 'messages.upsert' })
      expect(res.status).toBe(403)
      await flush()
      expect(mockState.handleInboundMessage).not.toHaveBeenCalled()
    })

    it('resolve o tenant pela instância e chama handleInboundMessage para mensagem recebida', async () => {
      setSupabase({ channels: [{ data: [{ tenant_id: 'tenant-1' }], error: null }] })
      mockState.evolutionParseWebhook.mockReturnValue({
        from: '5511988887777', text: 'Oi', instanceName: 'inst-1', fromMe: false, isGroup: false, pushName: 'Ana', waMessageId: 'wa-1', replyToWaId: null,
      })

      const app = buildApp()
      await request(app).post('/webhooks/evolution').send({ event: 'messages.upsert' })
      await flush()

      expect(mockState.handleInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', from: '5511988887777', provider: 'evolution', instanceName: 'inst-1' }))
      expect(mockState.handleOutboundMessage).not.toHaveBeenCalled()
    })

    it('chama handleOutboundMessage quando a mensagem foi enviada pela própria sessão (fromMe)', async () => {
      setSupabase({ channels: [{ data: [{ tenant_id: 'tenant-1' }], error: null }] })
      mockState.evolutionParseWebhook.mockReturnValue({
        from: '5511988887777', text: 'Oi, aqui é o atendente', instanceName: 'inst-1', fromMe: true, isGroup: false,
      })

      const app = buildApp()
      await request(app).post('/webhooks/evolution').send({ event: 'messages.upsert' })
      await flush()

      expect(mockState.handleOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', to: '5511988887777' }))
      expect(mockState.handleInboundMessage).not.toHaveBeenCalled()
    })

    it('não processa quando a instância não é reconhecida por nenhum tenant', async () => {
      setSupabase({ channels: [{ data: [], error: null }], integrations: [{ data: [], error: null }] })
      mockState.evolutionParseWebhook.mockReturnValue({ from: '5511988887777', text: 'Oi', instanceName: 'inst-desconhecida', fromMe: false })

      const app = buildApp()
      await request(app).post('/webhooks/evolution').send({ event: 'messages.upsert' })
      await flush()

      expect(mockState.handleInboundMessage).not.toHaveBeenCalled()
    })

    it('resolve o tenant via integrations legado quando não há canal correspondente na tabela channels', async () => {
      setSupabase({
        channels: [{ data: [], error: null }],
        integrations: [{ data: [{ tenant_id: 'tenant-legado', meta: { instanceName: 'inst-legado' } }], error: null }],
      })
      mockState.evolutionParseWebhook.mockReturnValue({ from: '5511988887777', text: 'Oi', instanceName: 'inst-legado', fromMe: false })

      const app = buildApp()
      await request(app).post('/webhooks/evolution').send({ event: 'messages.upsert' })
      await flush()

      expect(mockState.handleInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-legado' }))
    })

    it('aplica status de entrega resolvendo o tenant pela instância', async () => {
      setSupabase({
        channels: [{ data: [{ tenant_id: 'tenant-1' }], error: null }],
        broadcast_contacts: [{ data: [{ campaign_id: 'camp-1' }], error: null }, { data: [{ status: 'read' }], error: null }],
      })
      mockState.evolutionParseWebhookStatus.mockReturnValue([{ messageId: 'wa-1', status: 'read', instanceName: 'inst-1' }])

      const app = buildApp()
      await request(app).post('/webhooks/evolution').send({ event: 'messages.update' })
      await flush()

      const contactUpdate = updateCallsFor('broadcast_contacts')[0]
      expect(contactUpdate.args[0]).toMatchObject({ status: 'read' })
    })
  })

  describe('POST /evolution/:tenantId (compatibilidade com tenant explícito)', () => {
    it('usa o tenantId da URL diretamente, sem precisar resolver a instância', async () => {
      setSupabase({})
      mockState.evolutionParseWebhook.mockReturnValue({ from: '5511988887777', text: 'Oi', instanceName: 'inst-x', fromMe: false })

      const app = buildApp()
      await request(app).post('/webhooks/evolution/tenant-explicito').send({ event: 'messages.upsert' })
      await flush()

      expect(mockState.handleInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-explicito' }))
    })

    it('rejeita com 403 quando o secret não confere', async () => {
      config.evolution.webhookSecret = 'segredo-evo'
      const app = buildApp()
      const res = await request(app).post('/webhooks/evolution/tenant-1').set('apikey', 'errado').send({ event: 'messages.upsert' })
      expect(res.status).toBe(403)
    })

    it('chama handleOutboundMessage para mensagens fromMe', async () => {
      setSupabase({})
      mockState.evolutionParseWebhook.mockReturnValue({ from: '5511988887777', text: 'Oi', instanceName: 'inst-x', fromMe: true })

      const app = buildApp()
      await request(app).post('/webhooks/evolution/tenant-explicito').send({ event: 'messages.upsert' })
      await flush()

      expect(mockState.handleOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-explicito', to: '5511988887777' }))
    })
  })
})
