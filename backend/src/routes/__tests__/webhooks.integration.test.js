// Teste de integração: POST de um payload REALISTA de webhook (Meta e Evolution) através
// do router de verdade, com o parsing (services/whatsapp/meta.js e evolution.js) e a
// resolução de tenant também reais — só o supabase e o orchestrator são mockados. Prova
// que parsing + resolução de tenant + despacho para o orchestrator estão corretamente
// conectados (webhooks.test.js mocka meta/evolution inteiros; meta.test.js/evolution.test.js
// só testam o parsing isolado — nenhum dos dois prova que as peças se encaixam de verdade).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, handleInboundMessage: null, handleOutboundMessage: null }))

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

// só o orchestrator é mockado (é o "consumidor" que queremos espionar) — meta.js/evolution.js
// (parsing) ficam com a implementação real, importados de verdade via services/whatsapp/index.js.
vi.mock('../../services/orchestrator.js', () => ({
  handleInboundMessage: (...args) => mockState.handleInboundMessage(...args),
  handleOutboundMessage: (...args) => mockState.handleOutboundMessage(...args),
}))

const { webhooksRouter } = await import('../webhooks.js')

function buildApp() {
  const app = express()
  app.use('/webhooks', webhooksRouter)
  return app
}

const flush = () => new Promise((r) => setTimeout(r, 20))

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

describe('webhooks (integração: parsing real + resolução de tenant real -> orchestrator)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.handleInboundMessage = vi.fn().mockResolvedValue({ reply: '', scheduled: null })
    mockState.handleOutboundMessage = vi.fn().mockResolvedValue(undefined)
  })

  it('Meta: payload realista do Cloud API é parseado de verdade, o tenant é resolvido pelo phone_number_id e o orchestrator recebe os campos corretos', async () => {
    setSupabase({
      integrations: [{
        data: [{ tenant_id: 'tenant-int-1', meta: { phoneNumberId: 'phone-int-1' } }],
        error: null,
      }],
    })

    const metaPayload = {
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: 'phone-int-1' },
            contacts: [{ wa_id: '5511988887777', profile: { name: 'Cliente Real' } }],
            messages: [{ from: '5511988887777', id: 'wamid.INT1', type: 'text', text: { body: 'Olá, quero saber mais!' } }],
          },
        }],
      }],
    }

    const app = buildApp()
    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(metaPayload))

    expect(res.status).toBe(200)
    await flush()

    expect(mockState.handleInboundMessage).toHaveBeenCalledTimes(1)
    expect(mockState.handleInboundMessage).toHaveBeenCalledWith({
      tenantId: 'tenant-int-1',
      from: '5511988887777',
      text: 'Olá, quero saber mais!',
      mediaType: null,
      mediaId: null,
      mediaMimeType: null,
      mediaFilename: null,
      provider: 'meta_whatsapp',
      pushName: 'Cliente Real',
      waMessageId: 'wamid.INT1',
      replyToWaId: null,
    })

    // a query de integrações usa a combinação certa de filtros (provider conectado da Meta)
    const integrationsQuery = supabaseMock.calls.filter((c) => c.table === 'integrations' && c.method === 'eq')
    expect(integrationsQuery.some((c) => c.args[0] === 'provider' && c.args[1] === 'meta_whatsapp')).toBe(true)
    expect(integrationsQuery.some((c) => c.args[0] === 'status' && c.args[1] === 'connected')).toBe(true)
  })

  it('Meta: mensagem de mídia (imagem com legenda) é parseada com os campos de mídia corretos', async () => {
    setSupabase({
      integrations: [{
        data: [{ tenant_id: 'tenant-int-2', meta: { phoneNumberId: 'phone-int-2' } }],
        error: null,
      }],
    })

    const metaPayload = {
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: 'phone-int-2' },
            messages: [{
              from: '5511977776666', id: 'wamid.INT2', type: 'image',
              image: { id: 'media-abc', mime_type: 'image/jpeg', caption: 'Olha essa foto' },
            }],
          },
        }],
      }],
    }

    const app = buildApp()
    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(metaPayload))

    expect(res.status).toBe(200)
    await flush()

    expect(mockState.handleInboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-int-2',
      from: '5511977776666',
      text: 'Olha essa foto',
      mediaType: 'image',
      mediaId: 'media-abc',
      mediaMimeType: 'image/jpeg',
    }))
  })

  it('Evolution: payload realista de messages.upsert é parseado de verdade, o tenant é resolvido pela instância e o orchestrator recebe os campos corretos', async () => {
    setSupabase({
      channels: [{ data: [{ tenant_id: 'tenant-evo-1' }], error: null }],
    })

    const evolutionPayload = {
      event: 'messages.upsert',
      instance: 'inst-real-1',
      data: {
        key: { id: 'EVOWA1', remoteJid: '5511988887777@s.whatsapp.net', fromMe: false },
        message: { conversation: 'Oi, quero um orçamento' },
        pushName: 'Cliente Evo',
      },
    }

    const app = buildApp()
    const res = await request(app).post('/webhooks/evolution').send(evolutionPayload)

    expect(res.status).toBe(200)
    await flush()

    expect(mockState.handleInboundMessage).toHaveBeenCalledTimes(1)
    expect(mockState.handleInboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-evo-1',
      from: '5511988887777',
      text: 'Oi, quero um orçamento',
      provider: 'evolution',
      instanceName: 'inst-real-1',
      pushName: 'Cliente Evo',
      waMessageId: 'EVOWA1',
      isGroup: false,
    }))
    expect(mockState.handleOutboundMessage).not.toHaveBeenCalled()

    // a resolução de tenant usa a instância certa
    const channelsQuery = supabaseMock.calls.find((c) => c.table === 'channels' && c.method === 'eq')
    expect(channelsQuery.args).toEqual(['instance_name', 'inst-real-1'])
  })

  it('Evolution: mensagem fromMe (enviada pela própria sessão) é parseada e despachada para handleOutboundMessage, não handleInboundMessage', async () => {
    setSupabase({
      channels: [{ data: [{ tenant_id: 'tenant-evo-2' }], error: null }],
    })

    const evolutionPayload = {
      event: 'messages.upsert',
      instance: 'inst-real-2',
      data: {
        key: { id: 'EVOWA2', remoteJid: '5511966665555@s.whatsapp.net', fromMe: true },
        message: { conversation: 'Oi, aqui é o atendente' },
      },
    }

    const app = buildApp()
    const res = await request(app).post('/webhooks/evolution').send(evolutionPayload)

    expect(res.status).toBe(200)
    await flush()

    expect(mockState.handleOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-evo-2', to: '5511966665555', text: 'Oi, aqui é o atendente', provider: 'evolution',
    }))
    expect(mockState.handleInboundMessage).not.toHaveBeenCalled()
  })

  it('Evolution: mensagem de grupo (@g.us) é parseada com isGroup=true e senderJid do participante', async () => {
    setSupabase({
      channels: [{ data: [{ tenant_id: 'tenant-evo-3' }], error: null }],
    })

    const evolutionPayload = {
      event: 'messages.upsert',
      instance: 'inst-real-3',
      data: {
        key: { id: 'EVOWA3', remoteJid: '551100000000@g.us', fromMe: false, participant: '5511955554444@s.whatsapp.net' },
        message: { conversation: 'Oi pessoal' },
        pushName: 'Participante do Grupo',
      },
    }

    const app = buildApp()
    const res = await request(app).post('/webhooks/evolution').send(evolutionPayload)

    expect(res.status).toBe(200)
    await flush()

    expect(mockState.handleInboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-evo-3',
      from: '551100000000',
      text: 'Oi pessoal',
      isGroup: true,
      senderJid: '5511955554444@s.whatsapp.net',
    }))
  })

  it('não despacha para o orchestrator quando nenhuma integração conectada corresponde ao phone_number_id recebido', async () => {
    setSupabase({
      integrations: [{ data: [{ tenant_id: 'tenant-outro', meta: { phoneNumberId: 'outro-numero' } }], error: null }],
    })

    const metaPayload = {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: 'numero-desconhecido' },
        messages: [{ from: '5511988887777', id: 'wamid.X', type: 'text', text: { body: 'Oi' } }],
      } }] }],
    }

    const app = buildApp()
    await request(app).post('/webhooks/meta').set('Content-Type', 'application/json').send(JSON.stringify(metaPayload))
    await flush()

    expect(mockState.handleInboundMessage).not.toHaveBeenCalled()
  })
})
