import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../test-utils/supabaseMock.js'
import { ttlClearAll } from '../../../utils/ttlCache.js'

const mockState = vi.hoisted(() => ({ box: {}, getCredentials: null, dnsLookup: null }))

vi.mock('../../../config/index.js', () => ({
  config: { evolution: { apiUrl: 'https://evo.exemplo.com', apiKey: 'evo-key', webhookSecret: '' } },
}))

vi.mock('node:dns/promises', () => ({
  default: { lookup: (...args) => mockState.dnsLookup(...args) },
}))

vi.mock('../../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../../integrations.js', () => ({
  getCredentials: (...args) => mockState.getCredentials(...args),
}))

const evolution = await import('../evolution.js')
const { config } = await import('../../../config/index.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

describe('whatsapp/evolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ttlClearAll()
    mockState.getCredentials = vi.fn()
    mockState.dnsLookup = vi.fn().mockResolvedValue({ address: '93.184.216.34' })
    config.evolution.apiUrl = 'https://evo.exemplo.com'
    config.evolution.apiKey = 'evo-key'
  })

  describe('sendText', () => {
    it('envia via canal global (tabela channels) quando há canal conectado', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true, json: async () => ({ key: { id: 'wa-1', remoteJid: '5511@s.whatsapp.net' } }),
      })

      const result = await evolution.sendText('tenant-1', '5511988887777', 'Oi!')

      expect(result).toEqual({ id: 'wa-1', remoteJid: '5511@s.whatsapp.net', provider: 'evolution' })
      expect(fetchMock.mock.calls[0][0]).toBe('https://evo.exemplo.com/message/sendText/inst-1')
      expect(mockState.getCredentials).not.toHaveBeenCalled()
    })

    it('cacheia getConnectedChannel — só uma query em channels pra 2 envios seguidos', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ key: {} }) })

      await evolution.sendText('tenant-cache-1', '5511988887777', 'Oi 1')
      await evolution.sendText('tenant-cache-1', '5511988887777', 'Oi 2')

      expect(supabaseMock.calls.filter((c) => c.table === 'channels' && c.method === 'select').length).toBe(1)
    })

    it('cai para credenciais por-tenant (integrations) quando não há canal global conectado', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      mockState.getCredentials.mockResolvedValue({ credentials: { apiKey: 'tenant-key' }, meta: { baseUrl: 'https://evo-tenant.com', instance: 'inst-tenant' } })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ key: {} }) })

      await evolution.sendText('tenant-2', '5511988887777', 'Oi!')

      expect(fetchMock.mock.calls[0][0]).toBe('https://evo-tenant.com/message/sendText/inst-tenant')
      expect(fetchMock.mock.calls[0][1].headers.apikey).toBe('tenant-key')
    })

    it('lança erro quando não há canal nem credenciais por-tenant', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      mockState.getCredentials.mockResolvedValue(null)
      await expect(evolution.sendText('tenant-3', '5511988887777', 'Oi!')).rejects.toThrow('Evolution API não conectada para este cliente.')
    })

    it('lança erro quando as credenciais por-tenant estão incompletas', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      mockState.getCredentials.mockResolvedValue({ credentials: {}, meta: { baseUrl: 'https://x.com' } })
      await expect(evolution.sendText('tenant-4', '5511988887777', 'Oi!')).rejects.toThrow('Credenciais Evolution incompletas')
    })

    it('bloqueia SSRF quando o baseUrl por-tenant aponta pra rede interna', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      mockState.getCredentials.mockResolvedValue({ credentials: { apiKey: 'tenant-key' }, meta: { baseUrl: 'http://localhost:5000', instance: 'inst-tenant' } })
      const fetchMock = vi.spyOn(global, 'fetch')

      await expect(evolution.sendText('tenant-2', '5511988887777', 'Oi!')).rejects.toThrow(/não permitido/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('bloqueia SSRF via redirect quando o baseUrl por-tenant é público mas redireciona pra rede interna', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      mockState.getCredentials.mockResolvedValue({ credentials: { apiKey: 'tenant-key' }, meta: { baseUrl: 'https://evo-tenant.com', instance: 'inst-tenant' } })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        status: 302, headers: { get: () => 'http://169.254.169.254/latest/meta-data' },
      })

      await expect(evolution.sendText('tenant-2', '5511988887777', 'Oi!')).rejects.toThrow(/não permitido/)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('envia com sinal de timeout anexado (canal global e fallback por-tenant)', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ key: {} }) })

      await evolution.sendText('tenant-1', '5511988887777', 'Oi!')

      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    })

    it('inclui o objeto "quoted" no payload quando há contexto de citação', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ key: {} }) })

      await evolution.sendText('tenant-1', '5511988887777', 'Resposta', { quotedWaId: 'wa-orig', quotedFromMe: true, quotedText: 'Mensagem original' })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.quoted).toEqual({
        key: { id: 'wa-orig', remoteJid: '5511988887777@s.whatsapp.net', fromMe: true },
        message: { conversation: 'Mensagem original' },
      })
    })

    it('lança erro com a mensagem aninhada em response.message quando a API rejeita', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false, status: 400, json: async () => ({ response: { message: ['number inválido', 'campo obrigatório'] } }),
      })

      await expect(evolution.sendText('tenant-1', 'xx', 'Oi')).rejects.toThrow('number inválido, campo obrigatório')
    })
  })

  describe('sendMedia', () => {
    it('detecta o mediatype a partir do mimetype e envia com sucesso', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ key: { id: 'wa-2' } }) })

      const result = await evolution.sendMedia('tenant-1', '5511988887777', { buffer: Buffer.from('img'), mimetype: 'image/png', filename: 'foto.png' })

      expect(result.id).toBe('wa-2')
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.mediatype).toBe('image')
    })

    it('lança erro quando não há canal Evolution conectado', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      await expect(evolution.sendMedia('tenant-1', '5511988887777', { buffer: Buffer.from('x'), mimetype: 'audio/ogg' }))
        .rejects.toThrow('Canal Evolution não conectado.')
    })

    it('áudio usa o endpoint dedicado sendWhatsAppAudio em vez do sendMedia genérico', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ key: { id: 'wa-audio' } }) })

      const result = await evolution.sendMedia('tenant-1', '5511988887777', { buffer: Buffer.from('audiobytes'), mimetype: 'audio/webm', filename: 'audio.webm' })

      expect(result.id).toBe('wa-audio')
      expect(fetchMock.mock.calls[0][0]).toBe('https://evo.exemplo.com/message/sendWhatsAppAudio/inst-1')
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body).toEqual({ number: '5511988887777', audio: Buffer.from('audiobytes').toString('base64') })
    })

    it('áudio inclui o objeto "quoted" quando há contexto de citação', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ key: {} }) })

      await evolution.sendMedia('tenant-1', '5511988887777', {
        buffer: Buffer.from('audiobytes'), mimetype: 'audio/webm',
        quotedWaId: 'wa-orig', quotedFromMe: true, quotedText: 'Original',
      })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.quoted).toEqual({
        key: { id: 'wa-orig', remoteJid: '5511988887777@s.whatsapp.net', fromMe: true },
        message: { conversation: 'Original' },
      })
    })

    it('áudio propaga o erro da Evolution quando a resposta não é ok', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'formato de áudio inválido' }) })

      await expect(evolution.sendMedia('tenant-1', '5511988887777', { buffer: Buffer.from('x'), mimetype: 'audio/webm' }))
        .rejects.toThrow('formato de áudio inválido')
    })
  })

  describe('sendLocation / editMessage / deleteMessage', () => {
    it('sendLocation lança erro sem canal conectado', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      await expect(evolution.sendLocation('tenant-1', '5511988887777', { latitude: 1, longitude: 2 })).rejects.toThrow('Canal Evolution não conectado.')
    })

    it('sendLocation envia a localização com sucesso via canal conectado', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true, json: async () => ({ key: { id: 'wa-loc-1', remoteJid: '5511@s.whatsapp.net' } }),
      })

      const result = await evolution.sendLocation('tenant-1', '5511988887777', { latitude: -25.4, longitude: -49.2, name: 'Escritório', address: 'Rua X' })

      expect(result).toEqual({ id: 'wa-loc-1', remoteJid: '5511@s.whatsapp.net', provider: 'evolution' })
      expect(fetchMock.mock.calls[0][0]).toBe('https://evo.exemplo.com/message/sendLocation/inst-1')
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body).toMatchObject({ number: '5511988887777', latitude: -25.4, longitude: -49.2, name: 'Escritório', address: 'Rua X' })
    })

    it('sendLocation lança erro da Evolution quando a resposta não é ok', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'coordenadas inválidas' }) })
      await expect(evolution.sendLocation('tenant-1', '5511988887777', { latitude: 999, longitude: 999 })).rejects.toThrow('coordenadas inválidas')
    })

    it('editMessage extrai o número do remoteJid e chama o endpoint correto', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      const result = await evolution.editMessage('tenant-1', { waMessageId: 'wa-1', remoteJid: '5511988887777@s.whatsapp.net', newText: 'texto editado' })

      expect(result).toEqual({ ok: true })
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.number).toBe('5511988887777')
      expect(body.text).toBe('texto editado')
    })

    it('editMessage lança erro sem canal conectado', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      await expect(evolution.editMessage('tenant-1', { waMessageId: 'wa-1', remoteJid: '5511@s.whatsapp.net', newText: 'x' })).rejects.toThrow('Canal Evolution não conectado.')
    })

    it('editMessage propaga o erro da Evolution quando a resposta não é ok', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'Invalid remoteJid' }) })
      await expect(evolution.editMessage('tenant-1', { waMessageId: 'wa-1', remoteJid: '5511@lid', newText: 'x' })).rejects.toThrow('Invalid remoteJid')
    })

    it('deleteMessage chama o endpoint DELETE correto', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      await evolution.deleteMessage('tenant-1', { waMessageId: 'wa-1', remoteJid: '5511988887777@s.whatsapp.net' })

      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    })

    it('deleteMessage lança erro sem canal conectado', async () => {
      setSupabase({ channels: [{ data: [], error: null }] })
      await expect(evolution.deleteMessage('tenant-1', { waMessageId: 'wa-1', remoteJid: '5511@s.whatsapp.net' })).rejects.toThrow('Canal Evolution não conectado.')
    })

    it('deleteMessage propaga o erro da Evolution quando a resposta não é ok', async () => {
      setSupabase({ channels: [{ data: [{ instance_name: 'inst-1' }], error: null }] })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'Invalid remoteJid' }) })
      await expect(evolution.deleteMessage('tenant-1', { waMessageId: 'wa-1', remoteJid: '5511@lid' })).rejects.toThrow('Invalid remoteJid')
    })
  })

  describe('downloadMediaBase64', () => {
    it('retorna base64 e mimetype em caso de sucesso', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ base64: 'QUJD', mimetype: 'image/png' }) })
      const result = await evolution.downloadMediaBase64('inst-1', 'msg-1', '5511@s.whatsapp.net', false)
      expect(result).toEqual({ base64: 'QUJD', mimetype: 'image/png' })
    })

    it('lança erro quando a API não retorna base64', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })
      await expect(evolution.downloadMediaBase64('inst-1', 'msg-1', '5511@s.whatsapp.net', false))
        .rejects.toThrow('Evolution não retornou base64 da mídia.')
    })

    it('traduz AbortError em mensagem de timeout amigável', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(() => {
        const err = new Error('esta operação foi abortada')
        err.name = 'AbortError'
        return Promise.reject(err)
      })
      await expect(evolution.downloadMediaBase64('inst-1', 'msg-1', '5511@s.whatsapp.net', false))
        .rejects.toThrow('Evolution não respondeu a tempo ao buscar a mídia (timeout).')
    })
  })

  describe('parseWebhook', () => {
    it('extrai texto simples de uma mensagem de conversação', () => {
      const result = evolution.parseWebhook({
        event: 'messages.upsert', instance: 'inst-1',
        data: { key: { id: 'wa-1', remoteJid: '5511988887777@s.whatsapp.net', fromMe: false }, message: { conversation: 'Olá!' }, pushName: 'Ana' },
      })
      expect(result).toMatchObject({ from: '5511988887777', text: 'Olá!', isGroup: false, pushName: 'Ana', instanceName: 'inst-1' })
    })

    it('retorna null para eventos que não sejam messages.upsert', () => {
      expect(evolution.parseWebhook({ event: 'connection.update' })).toBeNull()
    })

    it('retorna null quando não há remoteJid', () => {
      expect(evolution.parseWebhook({ event: 'messages.upsert', data: { key: {}, message: { conversation: 'x' } } })).toBeNull()
    })

    it('descarta mensagens de broadcast list', () => {
      expect(evolution.parseWebhook({ event: 'messages.upsert', data: { key: { remoteJid: '123@broadcast' }, message: { conversation: 'x' } } })).toBeNull()
    })

    it('identifica mensagens de grupo e usa o participant como senderJid', () => {
      const result = evolution.parseWebhook({
        event: 'messages.upsert',
        data: { key: { remoteJid: '123456@g.us', participant: '5511999@s.whatsapp.net', fromMe: false }, message: { conversation: 'oi grupo' }, pushName: 'Membro' },
      })
      expect(result).toMatchObject({ isGroup: true, senderJid: '5511999@s.whatsapp.net' })
    })

    it('reconhece mensagem de imagem e usa o caption como texto', () => {
      const result = evolution.parseWebhook({
        event: 'messages.upsert',
        data: { key: { remoteJid: '5511@s.whatsapp.net' }, message: { imageMessage: { caption: 'Olha essa foto', mimetype: 'image/jpeg' } } },
      })
      expect(result).toMatchObject({ text: 'Olha essa foto', mediaType: 'image', mediaMimeType: 'image/jpeg' })
    })

    it('usa placeholder "[tipo]" quando a mídia não tem legenda', () => {
      const result = evolution.parseWebhook({
        event: 'messages.upsert',
        data: { key: { remoteJid: '5511@s.whatsapp.net' }, message: { audioMessage: { mimetype: 'audio/ogg' } } },
      })
      expect(result.text).toBe('[audio]')
    })

    it('retorna null quando não há texto nem mídia reconhecida', () => {
      const result = evolution.parseWebhook({
        event: 'messages.upsert',
        data: { key: { remoteJid: '5511@s.whatsapp.net' }, message: { reactionMessage: {} } },
      })
      expect(result).toBeNull()
    })

    it('extrai o replyToWaId do contextInfo quando a mensagem é uma resposta', () => {
      const result = evolution.parseWebhook({
        event: 'messages.upsert',
        data: { key: { remoteJid: '5511@s.whatsapp.net' }, message: { extendedTextMessage: { text: 'resposta', contextInfo: { stanzaId: 'wa-original' } } } },
      })
      expect(result.replyToWaId).toBe('wa-original')
    })
  })

  describe('parseWebhookStatus', () => {
    it('mapeia o ack numérico para o status interno', () => {
      const result = evolution.parseWebhookStatus({
        event: 'messages.update', instance: 'inst-1',
        data: [{ key: { id: 'wa-1' }, update: { status: 3 } }],
      })
      expect(result).toEqual([{ messageId: 'wa-1', status: 'delivered', instanceName: 'inst-1' }])
    })

    it('mapeia o status por nome (Evolution v2)', () => {
      const result = evolution.parseWebhookStatus({
        event: 'messages.update',
        data: [{ key: { id: 'wa-2' }, update: { status: 'READ' } }],
      })
      expect(result).toEqual([{ messageId: 'wa-2', status: 'read', instanceName: null }])
    })

    it('lê o status em item.status quando não vem aninhado em item.update', () => {
      const result = evolution.parseWebhookStatus({
        event: 'messages.update',
        data: [{ key: { id: 'wa-status' }, status: 'DELIVERY_ACK' }],
      })
      expect(result).toEqual([{ messageId: 'wa-status', status: 'delivered', instanceName: null }])
    })

    it('lê o ack em item.update.ack quando não vem em item.update.status', () => {
      const result = evolution.parseWebhookStatus({
        event: 'messages.update',
        data: [{ key: { id: 'wa-ack' }, update: { ack: 4 } }],
      })
      expect(result).toEqual([{ messageId: 'wa-ack', status: 'read', instanceName: null }])
    })

    it('lê o ack em item.ack como último fallback', () => {
      const result = evolution.parseWebhookStatus({
        event: 'messages.update',
        data: [{ key: { id: 'wa-ack2' }, ack: 5 }],
      })
      expect(result).toEqual([{ messageId: 'wa-ack2', status: 'read', instanceName: null }])
    })

    it.each([
      [0, 'failed'], ['ERROR', 'failed'],
      [1, 'sent'], ['PENDING', 'sent'],
      [2, 'sent'], ['SERVER_ACK', 'sent'],
      [3, 'delivered'], ['DELIVERY_ACK', 'delivered'],
      [4, 'read'], ['READ', 'read'],
      [5, 'read'], ['PLAYED', 'read'],
    ])('mapeia ack %j para status %j (enum WAMessageStatus da Baileys)', (ack, expected) => {
      const result = evolution.parseWebhookStatus({
        event: 'messages.update',
        data: [{ key: { id: 'wa-enum' }, update: { status: ack } }],
      })
      expect(result).toEqual([{ messageId: 'wa-enum', status: expected, instanceName: null }])
    })

    it('ignora itens com ack não reconhecido', () => {
      const result = evolution.parseWebhookStatus({
        event: 'messages.update',
        data: [{ key: { id: 'wa-3' }, update: { status: 'ALGO_DESCONHECIDO' } }],
      })
      expect(result).toEqual([])
    })

    it('retorna array vazio para eventos que não sejam messages.update', () => {
      expect(evolution.parseWebhookStatus({ event: 'messages.upsert' })).toEqual([])
    })
  })

  describe('getGroupSubject', () => {
    it('retorna o subject do grupo em caso de sucesso', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ subject: 'Grupo dos Amigos' }) })
      const subject = await evolution.getGroupSubject('inst-1', '123@g.us')
      expect(subject).toBe('Grupo dos Amigos')
    })

    it('retorna null quando a API falha', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false })
      const subject = await evolution.getGroupSubject('inst-1', '123@g.us')
      expect(subject).toBeNull()
    })

    it('retorna null quando EVOLUTION_API_URL não está configurado', async () => {
      config.evolution.apiUrl = ''
      const subject = await evolution.getGroupSubject('inst-1', '123@g.us')
      expect(subject).toBeNull()
    })
  })
})
