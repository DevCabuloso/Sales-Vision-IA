import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null, sendText: null, permCalls: [] }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
  requirePermission: (...keys) => { mockState.permCalls.push(keys); return (req, res, next) => next() },
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../../services/whatsapp/index.js', () => ({
  sendText: (...args) => mockState.sendText(...args),
}))

const { broadcastRouter, processBroadcast } = await import('../broadcast.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/broadcast', broadcastRouter)
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
function insertCallsFor(table) {
  return supabaseMock.calls.filter((c) => c.table === table && c.method === 'insert')
}

describe('routes/broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin', name: 'Ana' }
    mockState.sendText = vi.fn().mockResolvedValue({ id: 'wa-1' })
  })

  it('exige a permissão "broadcast" (enforcement de operador restrito) em toda a rota', () => {
    expect(mockState.permCalls).toContainEqual(['broadcast'])
  })

  describe('POST /campaigns', () => {
    it('rejeita payload inválido (faltando content)', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns').send({ name: 'Campanha X' })
      expect(res.status).toBe(400)
    })

    it('rejeita quando max_interval_seconds é menor que min_interval_seconds', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns').send({
        name: 'Campanha X', content: 'Oi!', min_interval_seconds: 10, max_interval_seconds: 5,
      })
      expect(res.status).toBe(400)
    })

    it('cria a campanha como "draft" quando não há agendamento', async () => {
      setSupabase({ broadcast_campaigns: [{ data: { id: 'camp-1', status: 'draft' }, error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns').send({ name: 'Campanha X', content: 'Oi!' })
      expect(res.status).toBe(201)
      const insert = insertCallsFor('broadcast_campaigns')[0]
      expect(insert.args[0].status).toBe('draft')
    })

    it('cria a campanha como "scheduled" quando scheduled_at está no futuro', async () => {
      setSupabase({ broadcast_campaigns: [{ data: { id: 'camp-2', status: 'scheduled' }, error: null }] })
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const app = buildApp()
      await request(app).post('/api/broadcast/campaigns').send({ name: 'Campanha Y', content: 'Oi!', scheduled_at: future })
      const insert = insertCallsFor('broadcast_campaigns')[0]
      expect(insert.args[0].status).toBe('scheduled')
    })
  })

  describe('PATCH /campaigns/:id', () => {
    it('retorna 404 quando a campanha não existe', async () => {
      setSupabase({ broadcast_campaigns: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).patch('/api/broadcast/campaigns/inexistente').send({ name: 'Novo nome' })
      expect(res.status).toBe(404)
    })

    it('reavalia o status quando scheduled_at muda e a campanha ainda está em draft/scheduled', async () => {
      setSupabase({
        broadcast_campaigns: [
          { data: [{ status: 'draft', scheduled_at: null }], error: null },
          { data: { id: 'camp-1' }, error: null },
        ],
      })
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const app = buildApp()
      await request(app).patch('/api/broadcast/campaigns/camp-1').send({ scheduled_at: future })

      const update = updateCallsFor('broadcast_campaigns')[0]
      expect(update.args[0].status).toBe('scheduled')
    })

    it('não reavalia o status quando a campanha já está "sending"', async () => {
      setSupabase({
        broadcast_campaigns: [
          { data: [{ status: 'sending', scheduled_at: null }], error: null },
          { data: { id: 'camp-1' }, error: null },
        ],
      })
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const app = buildApp()
      await request(app).patch('/api/broadcast/campaigns/camp-1').send({ scheduled_at: future })

      const update = updateCallsFor('broadcast_campaigns')[0]
      expect(update.args[0].status).toBeUndefined()
    })
  })

  describe('DELETE /campaigns/:id', () => {
    it('bloqueia a exclusão de campanha em andamento', async () => {
      setSupabase({ broadcast_campaigns: [{ data: [{ status: 'sending' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-1')
      expect(res.status).toBe(400)
    })

    it('permite excluir campanha em draft', async () => {
      setSupabase({ broadcast_campaigns: [{ data: [{ status: 'draft' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ deleted: true })
    })

    // Regressão: broadcast_contacts.campaign_id referencia broadcast_campaigns(id) sem
    // ON DELETE CASCADE — apagar a campanha sem apagar os contatos primeiro falha por
    // violação de FK sempre que a campanha já tiver algum contato importado/enviado.
    it('apaga os contatos da campanha antes de apagar a campanha (evita violação de FK)', async () => {
      setSupabase({ broadcast_campaigns: [{ data: [{ status: 'completed' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-1')
      expect(res.status).toBe(200)

      const deleteCalls = supabaseMock.calls.filter((c) => c.method === 'delete')
      const contactsDeleteIdx = deleteCalls.findIndex((c) => c.table === 'broadcast_contacts')
      const campaignDeleteIdx = deleteCalls.findIndex((c) => c.table === 'broadcast_campaigns')
      expect(contactsDeleteIdx).toBeGreaterThanOrEqual(0)
      expect(contactsDeleteIdx).toBeLessThan(campaignDeleteIdx)
    })
  })

  describe('GET /campaigns/:id/contacts', () => {
    it('pagina com limit/offset padrão (2000/0) e devolve os metadados', async () => {
      setSupabase({ broadcast_contacts: [{ data: [{ id: 'c1' }], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/broadcast/campaigns/camp-1/contacts')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ contacts: [{ id: 'c1' }], limit: 2000, offset: 0 })
      const rangeCall = supabaseMock.calls.find((c) => c.table === 'broadcast_contacts' && c.method === 'range')
      expect(rangeCall.args).toEqual([0, 1999])
    })

    it('aceita limit/offset customizados via query, respeitando o teto de 5000', async () => {
      setSupabase({ broadcast_contacts: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).get('/api/broadcast/campaigns/camp-1/contacts?limit=99999&offset=40')
      expect(res.body.limit).toBe(5000)
      expect(res.body.offset).toBe(40)
      const rangeCall = supabaseMock.calls.find((c) => c.table === 'broadcast_contacts' && c.method === 'range')
      expect(rangeCall.args).toEqual([40, 5039])
    })
  })

  describe('POST /campaigns/:id/contacts', () => {
    it('rejeita telefone muito curto', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/contacts').send({ contacts: [{ phone: '123' }] })
      expect(res.status).toBe(400)
    })

    // Regra de negócio: no máximo 5000 contatos por requisição (contactSchema.max(5000))
    // — evita payloads gigantes travando o servidor num único insert.
    // buildApp() usa o limite padrão do express.json (100kb) — pequeno demais pra um
    // payload de 5000 contatos; em produção (app.js) o limite real é 2mb. Usamos um app
    // dedicado aqui só para não bater no limite de tamanho do body, que é ortogonal à
    // regra de negócio (zod .max(5000)) que estes dois testes querem provar.
    function buildAppWithLargerBodyLimit() {
      const app = express()
      app.use(express.json({ limit: '2mb' }))
      app.use('/api/broadcast', broadcastRouter)
      return app
    }

    it('aceita exatamente 5000 contatos (limite superior permitido)', async () => {
      setSupabase({})
      const contacts = Array.from({ length: 5000 }, (_, i) => ({ phone: `1198888${String(i).padStart(4, '0')}` }))
      const app = buildAppWithLargerBodyLimit()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/contacts').send({ contacts })
      expect(res.status).toBe(201)
      expect(res.body).toEqual({ imported: 5000 })
    })

    it('rejeita 5001 contatos numa única requisição (acima do limite)', async () => {
      setSupabase({})
      const contacts = Array.from({ length: 5001 }, (_, i) => ({ phone: `1198888${String(i).padStart(4, '0')}` }))
      const app = buildAppWithLargerBodyLimit()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/contacts').send({ contacts })
      expect(res.status).toBe(400)
      // não deve ter tentado inserir nada
      expect(insertCallsFor('broadcast_contacts').length).toBe(0)
    })

    it('importa contatos normalizando o telefone para apenas dígitos', async () => {
      setSupabase({})
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/contacts').send({
        contacts: [{ name: 'Ana', phone: '(11) 98888-7777' }],
      })
      expect(res.status).toBe(201)
      expect(res.body).toEqual({ imported: 1 })
      const insert = insertCallsFor('broadcast_contacts')[0]
      expect(insert.args[0][0].phone).toBe('11988887777')
    })
  })

  describe('DELETE /campaigns/:id/contacts (limpar lista) e /:contactId', () => {
    it('retorna 404 quando a campanha não existe', async () => {
      setSupabase({ broadcast_campaigns: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-x/contacts')
      expect(res.status).toBe(404)
    })

    it('bloqueia remoção de contatos de campanha já enviada', async () => {
      setSupabase({ broadcast_campaigns: [{ data: [{ status: 'completed' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-1/contacts')
      expect(res.status).toBe(400)
    })

    it('remove um contato específico quando a campanha ainda é editável', async () => {
      setSupabase({ broadcast_campaigns: [{ data: [{ status: 'draft' }], error: null }] })
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-1/contacts/contact-1')
      expect(res.status).toBe(200)
    })
  })

  describe('POST /campaigns/:id/import-leads', () => {
    it('retorna 404 quando a campanha não existe', async () => {
      setSupabase({ broadcast_campaigns: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-x/import-leads').send({})
      expect(res.status).toBe(404)
    })

    it('importa leads filtrando por estágio e ignora duplicados já existentes na campanha', async () => {
      setSupabase({
        broadcast_campaigns: [{ data: [{ id: 'camp-1' }], error: null }],
        leads: [{ data: [{ name: 'Ana', phone: '11988887777' }, { name: 'Bia', phone: '11977776666' }], error: null }],
        broadcast_contacts: [{ data: [{ phone: '11977776666' }], error: null }], // Bia já importada
      })
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/import-leads').send({ stages: ['Qualificado'] })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ matched: 2, imported: 1, skipped: 1 })
      const insert = insertCallsFor('broadcast_contacts')[0]
      expect(insert.args[0]).toEqual([{ campaign_id: 'camp-1', tenant_id: 'tenant-1', name: 'Ana', phone: '11988887777' }])
      const limitCall = supabaseMock.calls.find((c) => c.table === 'broadcast_contacts' && c.method === 'limit')
      expect(limitCall.args[0]).toBe(20000)
    })

    it('retorna zero quando nenhum lead corresponde aos filtros', async () => {
      setSupabase({
        broadcast_campaigns: [{ data: [{ id: 'camp-1' }], error: null }],
        leads: [{ data: [], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/import-leads').send({ tags: ['vip'] })
      expect(res.body).toEqual({ matched: 0, imported: 0, skipped: 0 })
    })
  })

  describe('POST /campaigns/:id/send', () => {
    it('retorna 404 quando a campanha não existe', async () => {
      setSupabase({ broadcast_campaigns: [{ data: [], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-x/send')
      expect(res.status).toBe(404)
    })

    it('rejeita quando a campanha já está em andamento ou concluída', async () => {
      setSupabase({ broadcast_campaigns: [{ data: [{ id: 'camp-1', status: 'sending' }], error: null }] })
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/send')
      expect(res.status).toBe(400)
    })

    it('marca a campanha como "sending" e responde imediatamente', async () => {
      setSupabase({
        broadcast_campaigns: [{ data: [{ id: 'camp-1', status: 'draft' }], error: null }],
        broadcast_contacts: [{ data: [], error: null }],
      })
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/send')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ started: true })
      const update = updateCallsFor('broadcast_campaigns').find((c) => c.args[0]?.status === 'sending')
      expect(update).toBeTruthy()
    })
  })

  describe('POST /campaigns/:id/cancel', () => {
    it('marca a campanha como cancelada', async () => {
      setSupabase({})
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/cancel')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ cancelled: true })
      const update = updateCallsFor('broadcast_campaigns')[0]
      expect(update.args[0].status).toBe('cancelled')
    })
  })

  describe('processBroadcast (envio em background)', () => {
    it('envia para cada contato pendente e marca como completed ao final', async () => {
      setSupabase({
        broadcast_contacts: [{
          data: [
            { id: 'c1', phone: '11988880001', name: 'A' },
            { id: 'c2', phone: '11988880002', name: 'B' },
          ], error: null,
        }],
        broadcast_campaigns: [
          { data: { status: 'sending' }, error: null }, // checagem no idx 0
          { data: { status: 'sending' }, error: null }, // checagem final
        ],
      })

      await processBroadcast('tenant-1', { id: 'camp-1', content: 'Promoção!', min_interval_seconds: 0.001, max_interval_seconds: 0.001 })

      expect(mockState.sendText).toHaveBeenCalledTimes(2)
      const sentUpdates = updateCallsFor('broadcast_contacts').filter((c) => c.args[0]?.status === 'sent')
      expect(sentUpdates).toHaveLength(2)
      const completedUpdate = updateCallsFor('broadcast_campaigns').find((c) => c.args[0]?.status === 'completed')
      expect(completedUpdate).toBeTruthy()
      expect(completedUpdate.args[0].sent_count).toBe(2)
    })

    it('marca o contato como failed quando o envio individual falha, sem interromper os demais', async () => {
      setSupabase({
        broadcast_contacts: [{
          data: [
            { id: 'c1', phone: '11988880001', name: 'A' },
            { id: 'c2', phone: '11988880002', name: 'B' },
          ], error: null,
        }],
        broadcast_campaigns: [{ data: { status: 'sending' }, error: null }, { data: { status: 'sending' }, error: null }],
      })
      mockState.sendText.mockRejectedValueOnce(new Error('número inválido')).mockResolvedValueOnce({ id: 'wa-2' })

      await processBroadcast('tenant-1', { id: 'camp-1', content: 'Promoção!', min_interval_seconds: 0.001, max_interval_seconds: 0.001 })

      const failedUpdate = updateCallsFor('broadcast_contacts').find((c) => c.args[0]?.status === 'failed')
      expect(failedUpdate.args[0].error).toBe('número inválido')
      const sentUpdate = updateCallsFor('broadcast_contacts').find((c) => c.args[0]?.status === 'sent')
      expect(sentUpdate).toBeTruthy()
    })

    it('para o envio quando a campanha é cancelada no meio do processamento e não marca como completed', async () => {
      const contacts = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, phone: `1198888000${i}`, name: `Lead ${i}` }))
      setSupabase({
        broadcast_contacts: [{ data: contacts, error: null }],
        broadcast_campaigns: [
          { data: { status: 'sending' }, error: null },   // checagem no idx 0
          { data: { status: 'cancelled' }, error: null }, // checagem no idx 10 -> cancelada
          { data: { status: 'cancelled' }, error: null }, // checagem final
        ],
      })

      await processBroadcast('tenant-1', { id: 'camp-1', content: 'Promoção!', min_interval_seconds: 0.001, max_interval_seconds: 0.001 })

      expect(mockState.sendText).toHaveBeenCalledTimes(10)
      const completedUpdate = updateCallsFor('broadcast_campaigns').find((c) => c.args[0]?.status === 'completed')
      expect(completedUpdate).toBeFalsy()
    })
  })
})
