import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test-utils/supabaseMock.js'

const mockState = vi.hoisted(() => ({
  box: {},
  oauth2Instances: [],
  generateAuthUrl: null,
  getToken: null,
  calendarFactory: null,
  encrypt: null,
  decryptJSON: null,
}))

vi.mock('googleapis', () => {
  class OAuth2 {
    constructor(clientId, clientSecret, redirectUri) {
      this.clientId = clientId
      this.clientSecret = clientSecret
      this.redirectUri = redirectUri
      this.credentials = null
      this._listeners = {}
      mockState.oauth2Instances.push(this)
    }
    generateAuthUrl(opts) { return mockState.generateAuthUrl(this, opts) }
    async getToken(code) { return mockState.getToken(this, code) }
    setCredentials(tokens) { this.credentials = tokens }
    on(event, cb) { this._listeners[event] = cb }
    emit(event, payload) { this._listeners[event]?.(payload) }
  }
  return { google: { auth: { OAuth2 }, calendar: (opts) => mockState.calendarFactory(opts) } }
})

vi.mock('../../config/index.js', () => ({
  config: {
    google: { clientId: 'global-client-id', clientSecret: 'global-client-secret', redirectUri: 'https://api.exemplo.com/callback', scopes: ['scope-a'] },
    jwt: { secret: 'test-secret', expiresIn: '1h' },
  },
}))

vi.mock('../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../crypto.js', () => ({
  encrypt: (...args) => mockState.encrypt(...args),
  decryptJSON: (...args) => mockState.decryptJSON(...args),
}))

const gcal = await import('../googleCalendar.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

function updateCallsFor(table) {
  return supabaseMock.calls.filter((c) => c.table === table && c.method === 'update')
}

describe('googleCalendar service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.oauth2Instances = []
    mockState.encrypt = vi.fn((v) => `enc(${JSON.stringify(v)})`)
    mockState.decryptJSON = vi.fn(() => ({ access_token: 'tok', refresh_token: 'refresh' }))
  })

  describe('getAuthUrl', () => {
    it('usa as credenciais globais quando o tenant não tem OAuth próprio configurado', async () => {
      setSupabase({ integrations: [{ data: [], error: null }] })
      mockState.generateAuthUrl = vi.fn(() => 'https://accounts.google.com/o/oauth2/auth?mock=1')

      const url = await gcal.getAuthUrl('tenant-1')

      expect(url).toBe('https://accounts.google.com/o/oauth2/auth?mock=1')
      expect(mockState.oauth2Instances[0]).toMatchObject({ clientId: 'global-client-id', clientSecret: 'global-client-secret' })
      const opts = mockState.generateAuthUrl.mock.calls[0][1]
      expect(opts.scope).toEqual(['scope-a'])
      expect(opts.access_type).toBe('offline')
    })

    it('usa as credenciais OAuth do próprio tenant quando configuradas em integrations', async () => {
      setSupabase({
        integrations: [{ data: [{ meta: { setup: { client_id: 'tenant-client-id', client_secret_enc: 'enc-secret' } } }], error: null }],
      })
      mockState.decryptJSON.mockReturnValue('tenant-client-secret')
      mockState.generateAuthUrl = vi.fn(() => 'https://accounts.google.com/mock-tenant')

      await gcal.getAuthUrl('tenant-2')

      expect(mockState.oauth2Instances[0]).toMatchObject({ clientId: 'tenant-client-id', clientSecret: 'tenant-client-secret' })
    })

    it('lança erro quando não há credenciais globais nem do tenant', async () => {
      const { config } = await import('../../config/index.js')
      const original = { ...config.google }
      config.google.clientId = ''
      config.google.clientSecret = ''
      setSupabase({ integrations: [{ data: [], error: null }] })

      await expect(gcal.getAuthUrl('tenant-3')).rejects.toThrow('Google OAuth não configurado')

      Object.assign(config.google, original)
    })
  })

  describe('handleCallback', () => {
    it('troca o code por tokens, busca o e-mail principal e faz upsert preservando meta.setup', async () => {
      setSupabase({
        integrations: [
          { data: [], error: null }, // getTenantOAuthConfig: sem setup do tenant
          { data: [{ meta: { setup: { client_id: 'x', client_secret_enc: 'y' } } }], error: null }, // existing meta
        ],
      })
      mockState.getToken = vi.fn(async () => ({ tokens: { access_token: 'novo-token' } }))
      mockState.calendarFactory = vi.fn(() => ({
        calendarList: { get: vi.fn(async () => ({ data: { id: 'ana@empresa.com' } })) },
      }))

      const result = await gcal.handleCallback('auth-code-123', 'tenant-1')

      expect(result).toEqual({ connected: true, email: 'ana@empresa.com' })
      const upsertCall = supabaseMock.calls.find((c) => c.table === 'integrations' && c.method === 'upsert')
      expect(upsertCall.args[0]).toMatchObject({
        tenant_id: 'tenant-1', provider: 'google_calendar', status: 'connected',
        meta: { setup: { client_id: 'x', client_secret_enc: 'y' }, calendarId: 'primary', email: 'ana@empresa.com' },
      })
    })

    it('segue sem quebrar quando falha ao buscar o e-mail principal', async () => {
      setSupabase({ integrations: [{ data: [], error: null }, { data: [], error: null }] })
      mockState.getToken = vi.fn(async () => ({ tokens: { access_token: 'novo-token' } }))
      mockState.calendarFactory = vi.fn(() => ({
        calendarList: { get: vi.fn(async () => { throw new Error('sem permissão') }) },
      }))

      const result = await gcal.handleCallback('auth-code-456', 'tenant-1')
      expect(result).toEqual({ connected: true, email: null })
    })
  })

  describe('getCalendarClient / createEvent / updateEvent / listEvents / cancelEvent / getFreeBusy / disconnect', () => {
    it('lança erro quando o tenant não está conectado ao Google Calendar', async () => {
      setSupabase({ integrations: [{ data: [], error: null }] })
      await expect(gcal.createEvent('tenant-1', { summary: 'x', start: '2026-01-01', end: '2026-01-01' }))
        .rejects.toThrow('Google Calendar não conectado para este cliente.')
    })

    it('lança erro quando o registro existe mas o status não é "connected"', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc', meta: {}, status: 'disconnected' }], error: null }] })
      await expect(gcal.getFreeBusy('tenant-1', { timeMin: '2026-01-01', timeMax: '2026-01-02' }))
        .rejects.toThrow('Google Calendar não conectado para este cliente.')
    })

    it('createEvent monta o request com Google Meet e retorna os campos mapeados', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc-tokens', meta: { calendarId: 'primary' }, status: 'connected' }], error: null }] })
      const insert = vi.fn(async ({ requestBody }) => ({
        data: { id: 'evt-1', htmlLink: 'https://cal/evt-1', hangoutLink: 'https://meet.google.com/xyz', status: 'confirmed' },
      }))
      mockState.calendarFactory = vi.fn(() => ({ events: { insert } }))

      const result = await gcal.createEvent('tenant-1', {
        summary: 'Demo com Ana', description: 'Reunião', start: '2026-08-01T10:00:00Z', end: '2026-08-01T10:30:00Z', attendees: ['ana@ex.com'],
      })

      expect(result).toEqual({ externalId: 'evt-1', htmlLink: 'https://cal/evt-1', meetingLink: 'https://meet.google.com/xyz', status: 'confirmed' })
      const requestBody = insert.mock.calls[0][0].requestBody
      expect(requestBody.summary).toBe('Demo com Ana')
      expect(requestBody.attendees).toEqual([{ email: 'ana@ex.com' }])
      expect(requestBody.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet')
    })

    it('createEvent usa o link da conferenceData quando não há hangoutLink', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc', meta: {}, status: 'connected' }], error: null }] })
      const insert = vi.fn(async () => ({
        data: { id: 'evt-2', status: 'confirmed', conferenceData: { entryPoints: [{ uri: 'https://meet.google.com/abc' }] } },
      }))
      mockState.calendarFactory = vi.fn(() => ({ events: { insert } }))

      const result = await gcal.createEvent('tenant-1', { summary: 'x', start: '2026-08-01T10:00:00Z', end: '2026-08-01T10:30:00Z' })
      expect(result.meetingLink).toBe('https://meet.google.com/abc')
    })

    it('updateEvent envia apenas os campos fornecidos', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc', meta: {}, status: 'connected' }], error: null }] })
      const patch = vi.fn(async () => ({ data: { id: 'evt-1', status: 'confirmed', hangoutLink: 'https://meet/xyz' } }))
      mockState.calendarFactory = vi.fn(() => ({ events: { patch } }))

      await gcal.updateEvent('tenant-1', 'evt-1', { start: '2026-08-02T10:00:00Z' })

      const requestBody = patch.mock.calls[0][0].requestBody
      expect(requestBody).toEqual({ start: { dateTime: new Date('2026-08-02T10:00:00Z').toISOString(), timeZone: 'America/Sao_Paulo' } })
    })

    it('listEvents mapeia eventos, tratando eventos de dia inteiro (date) como meio-dia local', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc', meta: {}, status: 'connected' }], error: null }] })
      const list = vi.fn(async () => ({
        data: {
          items: [
            { id: 'evt-1', summary: 'Reunião', start: { dateTime: '2026-08-01T10:00:00Z' }, end: { dateTime: '2026-08-01T10:30:00Z' }, hangoutLink: 'https://meet/x', status: 'confirmed' },
            { id: 'evt-2', summary: 'Dia inteiro', start: { date: '2026-08-05' }, end: { date: '2026-08-06' }, status: 'confirmed' },
          ],
        },
      }))
      mockState.calendarFactory = vi.fn(() => ({ events: { list } }))

      const events = await gcal.listEvents('tenant-1', { timeMin: '2026-08-01T00:00:00Z' })

      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({ externalId: 'evt-1', title: 'Reunião', meetingLink: 'https://meet/x' })
      expect(events[1].start).toBe('2026-08-05T12:00:00')
      expect(events[1].meetingLink).toBeNull()
    })

    it('cancelEvent chama events.delete e retorna cancelled=true', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc', meta: {}, status: 'connected' }], error: null }] })
      const del = vi.fn(async () => ({}))
      mockState.calendarFactory = vi.fn(() => ({ events: { delete: del } }))

      const result = await gcal.cancelEvent('tenant-1', 'evt-1')
      expect(result).toEqual({ cancelled: true })
      expect(del).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt-1' }), expect.objectContaining({ timeout: 10_000 }))
    })

    it('getFreeBusy retorna o array de horários ocupados do calendário', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc', meta: { calendarId: 'primary' }, status: 'connected' }], error: null }] })
      const query = vi.fn(async () => ({ data: { calendars: { primary: { busy: [{ start: 'a', end: 'b' }] } } } }))
      mockState.calendarFactory = vi.fn(() => ({ freebusy: { query } }))

      const busy = await gcal.getFreeBusy('tenant-1', { timeMin: '2026-08-01T00:00:00Z', timeMax: '2026-08-02T00:00:00Z' })
      expect(busy).toEqual([{ start: 'a', end: 'b' }])
    })

    it('getFreeBusy retorna array vazio quando o calendário não tem dados de busy', async () => {
      setSupabase({ integrations: [{ data: [{ credentials: 'enc', meta: {}, status: 'connected' }], error: null }] })
      mockState.calendarFactory = vi.fn(() => ({ freebusy: { query: vi.fn(async () => ({ data: { calendars: {} } })) } }))

      const busy = await gcal.getFreeBusy('tenant-1', { timeMin: '2026-08-01T00:00:00Z', timeMax: '2026-08-02T00:00:00Z' })
      expect(busy).toEqual([])
    })

    it('getCalendarClient re-salva os tokens criptografados quando a lib do Google emite o evento "tokens" (refresh)', async () => {
      setSupabase({
        integrations: [{ data: [{ credentials: 'enc', meta: {}, status: 'connected' }], error: null }],
      })
      mockState.calendarFactory = vi.fn(() => ({ freebusy: { query: vi.fn(async () => ({ data: { calendars: {} } })) } }))

      await gcal.getFreeBusy('tenant-refresh', { timeMin: '2026-08-01T00:00:00Z', timeMax: '2026-08-02T00:00:00Z' })
      const instance = mockState.oauth2Instances[0]
      instance.emit('tokens', { access_token: 'novo-access-token' })
      await new Promise((r) => setImmediate(r))

      const update = updateCallsFor('integrations')[0]
      expect(update.args[0].credentials).toMatch(/^enc\(/)
    })
  })

  describe('disconnect', () => {
    it('marca a integração como desconectada e limpa as credenciais', async () => {
      setSupabase({ integrations: [{ data: [{}], error: null }] })
      const result = await gcal.disconnect('tenant-1')
      expect(result).toEqual({ disconnected: true })
      const update = updateCallsFor('integrations')[0]
      expect(update.args[0]).toMatchObject({ status: 'disconnected', credentials: null })
    })
  })
})
