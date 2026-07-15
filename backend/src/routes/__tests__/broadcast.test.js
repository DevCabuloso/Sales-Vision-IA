import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRlsMock } from '../../test-utils/rlsMock.js'

const mockState = vi.hoisted(() => ({ box: {}, user: null, sendText: null, permCalls: [] }))

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = mockState.user; next() },
  requireTenant: (req, res, next) => next(),
  requirePermission: (...keys) => { mockState.permCalls.push(keys); return (req, res, next) => next() },
}))

vi.mock('../../db/rls.js', () => ({
  withTenant: (...args) => mockState.box.withTenant(...args),
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

let rlsMock
function setRls() {
  rlsMock = createRlsMock()
  mockState.box.withTenant = rlsMock.withTenant
  return rlsMock
}
function queueN(n) { for (let i = 0; i < n; i++) rlsMock.queueRows([]) }
function insertCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^INSERT/.test(c.sql)) }
function updateCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^UPDATE/.test(c.sql)) }
function deleteCallsMatching(pattern) { return rlsMock.calls.filter((c) => pattern.test(c.sql) && /^DELETE/.test(c.sql)) }
// Lê um valor pelo nome da coluna dentro de um "SET col1 = $1, col2 = $2 WHERE ..."
function paramForColumn(call, col) {
  const setPart = call.sql.match(/SET (.+?) WHERE/s)[1]
  const cols = setPart.split(',').map((s) => s.trim().split('=')[0].trim())
  return call.params[cols.indexOf(col)]
}

describe('routes/broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = { id: 'user-1', tenantId: 'tenant-1', role: 'admin', name: 'Ana' }
    mockState.sendText = vi.fn().mockResolvedValue({ id: 'wa-1' })
    setRls()
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
      rlsMock.queueRows([{ id: 'camp-1', status: 'draft' }])
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns').send({ name: 'Campanha X', content: 'Oi!' })
      expect(res.status).toBe(201)
      const insert = insertCallsMatching(/broadcast_campaigns/)[0]
      expect(insert.params).toContain('draft')
    })

    it('cria a campanha como "scheduled" quando scheduled_at está no futuro', async () => {
      rlsMock.queueRows([{ id: 'camp-2', status: 'scheduled' }])
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const app = buildApp()
      await request(app).post('/api/broadcast/campaigns').send({ name: 'Campanha Y', content: 'Oi!', scheduled_at: future })
      const insert = insertCallsMatching(/broadcast_campaigns/)[0]
      expect(insert.params).toContain('scheduled')
    })
  })

  describe('PATCH /campaigns/:id', () => {
    it('retorna 404 quando a campanha não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).patch('/api/broadcast/campaigns/inexistente').send({ name: 'Novo nome' })
      expect(res.status).toBe(404)
    })

    it('reavalia o status quando scheduled_at muda e a campanha ainda está em draft/scheduled', async () => {
      rlsMock.queueRows([{ status: 'draft', scheduled_at: null }])
      rlsMock.queueRows([{ id: 'camp-1' }])
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const app = buildApp()
      await request(app).patch('/api/broadcast/campaigns/camp-1').send({ scheduled_at: future })

      const update = updateCallsMatching(/broadcast_campaigns/)[0]
      expect(paramForColumn(update, 'status')).toBe('scheduled')
    })

    it('não reavalia o status quando a campanha já está "sending"', async () => {
      rlsMock.queueRows([{ status: 'sending', scheduled_at: null }])
      rlsMock.queueRows([{ id: 'camp-1' }])
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const app = buildApp()
      await request(app).patch('/api/broadcast/campaigns/camp-1').send({ scheduled_at: future })

      const update = updateCallsMatching(/broadcast_campaigns/)[0]
      expect(paramForColumn(update, 'status')).toBeUndefined()
    })
  })

  describe('DELETE /campaigns/:id', () => {
    it('bloqueia a exclusão de campanha em andamento', async () => {
      rlsMock.queueRows([{ status: 'sending' }])
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-1')
      expect(res.status).toBe(400)
    })

    it('permite excluir campanha em draft', async () => {
      rlsMock.queueRows([{ status: 'draft' }])
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ deleted: true })
    })

    // Regressão: broadcast_contacts.campaign_id referencia broadcast_campaigns(id) sem
    // ON DELETE CASCADE — apagar a campanha sem apagar os contatos primeiro falha por
    // violação de FK sempre que a campanha já tiver algum contato importado/enviado.
    it('apaga os contatos da campanha antes de apagar a campanha (evita violação de FK)', async () => {
      rlsMock.queueRows([{ status: 'completed' }])
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-1')
      expect(res.status).toBe(200)

      const deleteCalls = rlsMock.calls.filter((c) => /^DELETE/.test(c.sql))
      const contactsDeleteIdx = deleteCalls.findIndex((c) => /broadcast_contacts/.test(c.sql))
      const campaignDeleteIdx = deleteCalls.findIndex((c) => /broadcast_campaigns/.test(c.sql))
      expect(contactsDeleteIdx).toBeGreaterThanOrEqual(0)
      expect(contactsDeleteIdx).toBeLessThan(campaignDeleteIdx)
    })
  })

  describe('GET /campaigns/:id/contacts', () => {
    it('pagina com limit/offset padrão (2000/0) e devolve os metadados', async () => {
      rlsMock.queueRows([{ id: 'c1' }])
      const app = buildApp()
      const res = await request(app).get('/api/broadcast/campaigns/camp-1/contacts')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ contacts: [{ id: 'c1' }], limit: 2000, offset: 0 })
      const call = rlsMock.calls.find((c) => /FROM broadcast_contacts/.test(c.sql))
      expect(call.params.slice(-2)).toEqual([2000, 0])
    })

    it('aceita limit/offset customizados via query, respeitando o teto de 5000', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).get('/api/broadcast/campaigns/camp-1/contacts?limit=99999&offset=40')
      expect(res.body.limit).toBe(5000)
      expect(res.body.offset).toBe(40)
      const call = rlsMock.calls.find((c) => /FROM broadcast_contacts/.test(c.sql))
      expect(call.params.slice(-2)).toEqual([5000, 40])
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
      const contacts = Array.from({ length: 5000 }, (_, i) => ({ phone: `1198888${String(i).padStart(4, '0')}` }))
      const app = buildAppWithLargerBodyLimit()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/contacts').send({ contacts })
      expect(res.status).toBe(201)
      expect(res.body).toEqual({ imported: 5000 })
    })

    it('rejeita 5001 contatos numa única requisição (acima do limite)', async () => {
      const contacts = Array.from({ length: 5001 }, (_, i) => ({ phone: `1198888${String(i).padStart(4, '0')}` }))
      const app = buildAppWithLargerBodyLimit()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/contacts').send({ contacts })
      expect(res.status).toBe(400)
      // não deve ter tentado inserir nada
      expect(insertCallsMatching(/broadcast_contacts/).length).toBe(0)
    })

    it('importa contatos normalizando o telefone para apenas dígitos', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/contacts').send({
        contacts: [{ name: 'Ana', phone: '(11) 98888-7777' }],
      })
      expect(res.status).toBe(201)
      expect(res.body).toEqual({ imported: 1 })
      const insert = insertCallsMatching(/broadcast_contacts/)[0]
      expect(insert.params).toContain('11988887777')
    })
  })

  describe('DELETE /campaigns/:id/contacts (limpar lista) e /:contactId', () => {
    it('retorna 404 quando a campanha não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-x/contacts')
      expect(res.status).toBe(404)
    })

    it('bloqueia remoção de contatos de campanha já enviada', async () => {
      rlsMock.queueRows([{ status: 'completed' }])
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-1/contacts')
      expect(res.status).toBe(400)
    })

    it('remove um contato específico quando a campanha ainda é editável', async () => {
      rlsMock.queueRows([{ status: 'draft' }])
      const app = buildApp()
      const res = await request(app).delete('/api/broadcast/campaigns/camp-1/contacts/contact-1')
      expect(res.status).toBe(200)
    })
  })

  describe('POST /campaigns/:id/import-leads', () => {
    it('retorna 404 quando a campanha não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-x/import-leads').send({})
      expect(res.status).toBe(404)
    })

    it('importa leads filtrando por estágio e ignora duplicados já existentes na campanha', async () => {
      rlsMock.queueRows([{ id: 'camp-1' }])
      rlsMock.queueRows([{ name: 'Ana', phone: '11988887777' }, { name: 'Bia', phone: '11977776666' }])
      rlsMock.queueRows([{ phone: '11977776666' }]) // Bia já importada
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/import-leads').send({ stages: ['Qualificado'] })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ matched: 2, imported: 1, skipped: 1 })
      const insert = insertCallsMatching(/broadcast_contacts/)[0]
      expect(insert.params).toEqual(['camp-1', 'tenant-1', 'Ana', '11988887777'])
      const existingCall = rlsMock.calls.find((c) => /FROM broadcast_contacts/.test(c.sql))
      expect(existingCall.sql).toMatch(/LIMIT 20000/)
    })

    it('retorna zero quando nenhum lead corresponde aos filtros', async () => {
      rlsMock.queueRows([{ id: 'camp-1' }])
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/import-leads').send({ tags: ['vip'] })
      expect(res.body).toEqual({ matched: 0, imported: 0, skipped: 0 })
    })
  })

  describe('POST /campaigns/:id/send', () => {
    it('retorna 404 quando a campanha não existe', async () => {
      rlsMock.queueRows([])
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-x/send')
      expect(res.status).toBe(404)
    })

    it('rejeita quando a campanha já está em andamento ou concluída', async () => {
      rlsMock.queueRows([{ id: 'camp-1', status: 'sending' }])
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/send')
      expect(res.status).toBe(400)
    })

    it('marca a campanha como "sending" e responde imediatamente', async () => {
      rlsMock.queueRows([{ id: 'camp-1', status: 'draft' }])
      rlsMock.queueRows([]) // update status=sending
      rlsMock.queueRows([]) // processBroadcast (fire-and-forget): contacts fetch
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/send')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ started: true })
      const update = updateCallsMatching(/broadcast_campaigns/).find((c) => c.sql.includes("'sending'"))
      expect(update).toBeTruthy()
    })
  })

  describe('POST /campaigns/:id/cancel', () => {
    it('marca a campanha como cancelada', async () => {
      const app = buildApp()
      const res = await request(app).post('/api/broadcast/campaigns/camp-1/cancel')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ cancelled: true })
      const update = updateCallsMatching(/broadcast_campaigns/)[0]
      expect(update.sql).toContain("'cancelled'")
    })
  })

  describe('processBroadcast (envio em background)', () => {
    it('envia para cada contato pendente e marca como completed ao final', async () => {
      rlsMock.queueRows([{ id: 'c1', phone: '11988880001', name: 'A' }, { id: 'c2', phone: '11988880002', name: 'B' }]) // contacts
      rlsMock.queueRows([{ status: 'sending' }]) // checagem no idx 0
      queueN(2) // updates de status "sent" p/ c1 e c2
      rlsMock.queueRows([{ status: 'sending' }]) // checagem final

      await processBroadcast('tenant-1', { id: 'camp-1', content: 'Promoção!', min_interval_seconds: 0.001, max_interval_seconds: 0.001 })

      expect(mockState.sendText).toHaveBeenCalledTimes(2)
      const sentUpdates = updateCallsMatching(/broadcast_contacts/).filter((c) => c.sql.includes("'sent'"))
      expect(sentUpdates).toHaveLength(2)
      const completedUpdate = updateCallsMatching(/broadcast_campaigns/).find((c) => c.sql.includes("'completed'"))
      expect(completedUpdate).toBeTruthy()
      expect(completedUpdate.params).toContain(2)
    })

    it('marca o contato como failed quando o envio individual falha, sem interromper os demais', async () => {
      rlsMock.queueRows([{ id: 'c1', phone: '11988880001', name: 'A' }, { id: 'c2', phone: '11988880002', name: 'B' }])
      rlsMock.queueRows([{ status: 'sending' }])
      queueN(2)
      rlsMock.queueRows([{ status: 'sending' }])
      mockState.sendText.mockRejectedValueOnce(new Error('número inválido')).mockResolvedValueOnce({ id: 'wa-2' })

      await processBroadcast('tenant-1', { id: 'camp-1', content: 'Promoção!', min_interval_seconds: 0.001, max_interval_seconds: 0.001 })

      const failedUpdate = updateCallsMatching(/broadcast_contacts/).find((c) => c.sql.includes("'failed'"))
      expect(failedUpdate.params).toContain('número inválido')
      const sentUpdate = updateCallsMatching(/broadcast_contacts/).find((c) => c.sql.includes("'sent'"))
      expect(sentUpdate).toBeTruthy()
    })

    it('para o envio quando a campanha é cancelada no meio do processamento e não marca como completed', async () => {
      const contacts = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, phone: `1198888000${i}`, name: `Lead ${i}` }))
      rlsMock.queueRows(contacts)
      rlsMock.queueRows([{ status: 'sending' }])   // checagem no idx 0
      queueN(10)                                    // updates "sent" p/ contatos 0..9
      rlsMock.queueRows([{ status: 'cancelled' }])  // checagem no idx 10 -> cancelada
      rlsMock.queueRows([{ status: 'cancelled' }])  // checagem final

      await processBroadcast('tenant-1', { id: 'camp-1', content: 'Promoção!', min_interval_seconds: 0.001, max_interval_seconds: 0.001 })

      expect(mockState.sendText).toHaveBeenCalledTimes(10)
      const completedUpdate = updateCallsMatching(/broadcast_campaigns/).find((c) => c.sql.includes("'completed'"))
      expect(completedUpdate).toBeFalsy()
    })
  })
})
