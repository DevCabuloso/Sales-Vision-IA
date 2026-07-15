// Teste de integração: campanha criada -> contatos importados -> /send (dispara o
// processBroadcast REAL, que chama um sendText mockado) -> webhook de ACK da Evolution
// batendo no MESMO wa_message_id -> prova que broadcast_contacts/broadcast_campaigns
// fecham o ciclo de contagem corretamente, cruzando routes/broadcast.js (client RLS) e
// routes/webhooks.js (client service_role, pré-auth — não migrado pra RLS).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null, sendText: null }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
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

vi.mock('../../config/index.js', () => ({
  config: {
    meta: { graphVersion: 'v21.0', verifyToken: 'sdr-verify', appSecret: '' },
    evolution: { apiUrl: '', apiKey: '', webhookSecret: '' },
    db: { rlsUrl: '' },
  },
}))

// webhooks.js importa handleInboundMessage/handleOutboundMessage estaticamente, mas o
// evento simulado aqui é messages.update (status de ACK) — parseWebhook real descarta
// esse evento antes de chegar no orchestrator, então mocká-lo evita puxar toda a árvore
// de dependências da IA (mesma abordagem do webhooks.test.js já existente).
vi.mock('../../services/orchestrator.js', () => ({
  handleInboundMessage: vi.fn(),
  handleOutboundMessage: vi.fn(),
}))

// Mock parcial: mantém o parseWebhookStatus/parseWebhook REAIS da Evolution (para provar
// o parsing de verdade), só troca o sendText (usado pelo processBroadcast) por um mock
// que devolve um wa_message_id falso, sem bater na Evolution API de verdade.
vi.mock('../../services/whatsapp/index.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, sendText: (...args) => mockState.sendText(...args) }
})

const { broadcastRouter } = await import('../broadcast.js')
const { webhooksRouter } = await import('../webhooks.js')

function buildApp() {
  const app = express()
  app.use('/api/broadcast', express.json(), broadcastRouter)
  app.use('/webhooks', webhooksRouter)
  return app
}

const flush = (ms = 150) => new Promise((r) => setTimeout(r, ms))

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

function callsFor(table, method) {
  return supabaseMock.calls.filter((c) => c.table === table && (!method || c.method === method))
}
function rlsUpdatesMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^UPDATE/.test(c.sql)) }

describe('broadcast + webhooks (integração: campanha -> envio -> ACK fecha o ciclo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-bcast-1', role: 'admin', name: 'Ana' }
    mockState.sendText = vi.fn().mockResolvedValue({ id: 'wa-ack-1' })
  })

  it('cria campanha, importa contato, envia (sendText mockado) e a ACK "delivered" da Evolution atualiza contato e contadores da campanha', async () => {
    const app = buildApp()

    // ── lado RLS (routes/broadcast.js): fila única em ordem de chamada ──
    setRls()
    rlsMock.queueRows([{ id: 'camp-int-1', status: 'draft' }])                    // 1) insert da campanha
    rlsMock.queueRows([])                                                          // 2) insere o contato importado
    rlsMock.queueRows([{                                                           // 3) /send: busca a campanha
      id: 'camp-int-1', status: 'draft', content: 'Confira nossa promoção!',
      min_interval_seconds: 0.001, max_interval_seconds: 0.001,
    }])
    rlsMock.queueRows([])                                                          // 4) /send: marca "sending"
    rlsMock.queueRows([{ id: 'contact-int-1', phone: '11988887777', name: 'Lead Um' }]) // 5) processBroadcast: contatos pendentes
    rlsMock.queueRows([{ status: 'sending' }])                                     // 6) processBroadcast: checagem no idx 0
    rlsMock.queueRows([])                                                          // 7) processBroadcast: marca "sent" com wa_message_id
    rlsMock.queueRows([{ status: 'sending' }])                                     // 8) processBroadcast: checagem final
    rlsMock.queueRows([])                                                          // 9) processBroadcast: marca "completed"

    // ── lado service_role (routes/webhooks.js, não migrado — pré-auth) ──
    setSupabase({
      broadcast_contacts: [
        { data: [{ campaign_id: 'camp-int-1' }], error: null }, // webhook ACK: update casando wa_message_id -> campaign_id
        { data: null, error: null, count: 1 }, // recomputeBroadcastCounts: COUNT delivered+read
        { data: null, error: null, count: 0 }, // recomputeBroadcastCounts: COUNT read
      ],
      broadcast_campaigns: [
        { data: [{}], error: null }, // recomputeBroadcastCounts: update dos contadores
      ],
      channels: [
        { data: [{ tenant_id: 'tenant-bcast-1' }], error: null }, // resolveEvolutionTenant pela instância
      ],
    })

    // ── passo 1: cria a campanha ──
    const campRes = await request(app).post('/api/broadcast/campaigns').send({
      name: 'Campanha Integração', content: 'Confira nossa promoção!',
    })
    expect(campRes.status).toBe(201)
    const campaignId = campRes.body.campaign.id
    expect(campaignId).toBe('camp-int-1')

    // ── passo 2: importa o contato ──
    const contactsRes = await request(app).post(`/api/broadcast/campaigns/${campaignId}/contacts`).send({
      contacts: [{ name: 'Lead Um', phone: '(11) 98888-7777' }],
    })
    expect(contactsRes.status).toBe(201)
    expect(contactsRes.body).toEqual({ imported: 1 })

    // ── passo 3: dispara o envio — processBroadcast roda de verdade em background ──
    const sendRes = await request(app).post(`/api/broadcast/campaigns/${campaignId}/send`)
    expect(sendRes.status).toBe(200)
    expect(sendRes.body).toEqual({ started: true })

    await flush() // deixa o processBroadcast (fire-and-forget) terminar

    expect(mockState.sendText).toHaveBeenCalledWith('tenant-bcast-1', '11988887777', 'Confira nossa promoção!')
    const sentUpdate = rlsUpdatesMatching(/broadcast_contacts/).find((c) => c.sql.includes("'sent'"))
    expect(sentUpdate).toBeTruthy()
    expect(sentUpdate.params).toContain('wa-ack-1')
    const completedUpdate = rlsUpdatesMatching(/broadcast_campaigns/).find((c) => c.sql.includes("'completed'"))
    expect(completedUpdate).toBeTruthy()

    // ── passo 4: a Evolution manda o webhook de ACK (messages.update) para o MESMO wa_message_id ──
    const ackRes = await request(app).post('/webhooks/evolution').send({
      event: 'messages.update',
      instance: 'inst-bcast-1',
      data: { key: { id: 'wa-ack-1' }, update: { status: 'DELIVERY_ACK' } },
    })
    expect(ackRes.status).toBe(200)
    await flush(30)

    // prova que o ciclo fechou: o contato foi casado pelo wa_message_id e a campanha recontou
    const deliveredUpdate = callsFor('broadcast_contacts', 'update').find((c) => c.args[0]?.status === 'delivered')
    expect(deliveredUpdate).toBeTruthy()
    expect(deliveredUpdate.args[0]).toMatchObject({ status: 'delivered' })
    const deliveredEq = supabaseMock.calls.find((c) => c.table === 'broadcast_contacts' && c.method === 'eq' && c.args[0] === 'wa_message_id')
    expect(deliveredEq.args[1]).toBe('wa-ack-1')

    const countsUpdate = callsFor('broadcast_campaigns', 'update').find((c) => c.args[0]?.delivered_count !== undefined)
    expect(countsUpdate.args[0]).toMatchObject({ delivered_count: 1, read_count: 0 })
  })
})
