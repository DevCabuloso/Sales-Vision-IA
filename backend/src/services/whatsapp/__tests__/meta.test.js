import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockState = vi.hoisted(() => ({ getCredentials: null }))

vi.mock('../../../config/index.js', () => ({
  config: { meta: { graphVersion: 'v21.0', verifyToken: 'sdr-verify', appSecret: '' } },
}))

vi.mock('../../integrations.js', () => ({
  getCredentials: (...args) => mockState.getCredentials(...args),
}))

const meta = await import('../meta.js')

describe('whatsapp/meta', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockState.getCredentials = vi.fn()
  })

  describe('sendText', () => {
    it('lança erro quando o tenant não tem Meta WhatsApp conectado', async () => {
      mockState.getCredentials.mockResolvedValue(null)
      await expect(meta.sendText('tenant-1', '5511988887777', 'Oi')).rejects.toThrow('Meta WhatsApp não conectado para este cliente.')
    })

    it('lança erro quando faltam credenciais (accessToken/phoneNumberId)', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: {}, meta: {} })
      await expect(meta.sendText('tenant-1', '5511988887777', 'Oi')).rejects.toThrow('Credenciais Meta incompletas')
    })

    it('envia a mensagem de texto usando o endpoint e token corretos', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid-1' }] }) })

      const result = await meta.sendText('tenant-1', '5511988887777', 'Olá!')

      expect(result).toEqual({ id: 'wamid-1', provider: 'meta_whatsapp' })
      expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v21.0/phone-1/messages')
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-abc')
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body).toMatchObject({ messaging_product: 'whatsapp', to: '5511988887777', type: 'text', text: { body: 'Olá!' } })
    })

    it('inclui o contexto de resposta quando quotedWaId é fornecido', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      await meta.sendText('tenant-1', '5511988887777', 'Resposta', { quotedWaId: 'wamid-original' })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.context).toEqual({ message_id: 'wamid-original' })
    })

    it('lança erro com a mensagem retornada pela API quando a resposta não é ok', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'token expirado' } }) })

      await expect(meta.sendText('tenant-1', '5511988887777', 'Oi')).rejects.toThrow('token expirado')
    })
  })

  describe('sendLocation', () => {
    it('envia a localização corretamente', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid-2' }] }) })

      const result = await meta.sendLocation('tenant-1', '5511988887777', { latitude: -23.5, longitude: -46.6, name: 'Escritório', address: 'Rua X' })

      expect(result).toEqual({ id: 'wamid-2', provider: 'meta_whatsapp' })
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.location).toEqual({ latitude: -23.5, longitude: -46.6, name: 'Escritório', address: 'Rua X' })
    })
  })

  describe('sendMedia', () => {
    it('faz upload do arquivo e depois envia a mensagem com o media_id retornado', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      const fetchMock = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'media-123' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: 'wamid-3' }] }) })

      const result = await meta.sendMedia('tenant-1', '5511988887777', { buffer: Buffer.from('img'), mimetype: 'image/png', filename: 'foto.png', caption: 'Olha' })

      expect(result).toEqual({ id: 'wamid-3', provider: 'meta_whatsapp' })
      expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v21.0/phone-1/media')
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(secondBody.type).toBe('image')
      expect(secondBody.image).toEqual({ id: 'media-123', caption: 'Olha' })
    })

    it('lança erro quando o upload falha', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: 'arquivo grande demais' } }) })

      await expect(meta.sendMedia('tenant-1', '5511988887777', { buffer: Buffer.from('x'), mimetype: 'image/png', filename: 'x.png' }))
        .rejects.toThrow('arquivo grande demais')
    })

    it('lança erro quando o upload não retorna media_id', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })

      await expect(meta.sendMedia('tenant-1', '5511988887777', { buffer: Buffer.from('x'), mimetype: 'image/png', filename: 'x.png' }))
        .rejects.toThrow('Meta não retornou media_id após upload.')
    })

    it('inclui filename para documentos', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'media-doc' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: 'wamid-4' }] }) })

      await meta.sendMedia('tenant-1', '5511988887777', { buffer: Buffer.from('pdf'), mimetype: 'application/pdf', filename: 'contrato.pdf' })

      const body = JSON.parse(vi.mocked(global.fetch).mock.calls[1][1].body)
      expect(body.type).toBe('document')
      expect(body.document.filename).toBe('contrato.pdf')
    })
  })

  describe('downloadMedia', () => {
    it('resolve a URL temporária do media_id e baixa os bytes', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://lookaside.fbsbx.com/x', mime_type: 'image/png' }) })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new TextEncoder().encode('bytes-da-imagem').buffer })

      const result = await meta.downloadMedia('tenant-1', 'media-123')

      expect(result.mimetype).toBe('image/png')
      expect(Buffer.isBuffer(result.buffer)).toBe(true)
    })

    it('lança erro quando não consegue resolver a URL do media', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { message: 'mídia expirada' } }) })

      await expect(meta.downloadMedia('tenant-1', 'media-123')).rejects.toThrow('mídia expirada')
    })

    it('lança erro quando o download dos bytes falha', async () => {
      mockState.getCredentials.mockResolvedValue({ credentials: { accessToken: 'token-abc' }, meta: { phoneNumberId: 'phone-1' } })
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://lookaside.fbsbx.com/x' }) })
        .mockResolvedValueOnce({ ok: false, status: 500 })

      await expect(meta.downloadMedia('tenant-1', 'media-123')).rejects.toThrow('Falha ao baixar mídia da Meta (500)')
    })
  })

  describe('parseWebhook', () => {
    it('extrai mensagem de texto com nome do contato resolvido', () => {
      const body = {
        entry: [{ changes: [{ value: {
          metadata: { phone_number_id: 'phone-1' },
          contacts: [{ wa_id: '5511988887777', profile: { name: 'Ana' } }],
          messages: [{ from: '5511988887777', id: 'wamid-1', type: 'text', text: { body: 'Oi!' } }],
        } }] }],
      }
      const result = meta.parseWebhook(body)
      expect(result).toEqual([{ from: '5511988887777', text: 'Oi!', phoneNumberId: 'phone-1', pushName: 'Ana', waMessageId: 'wamid-1', replyToWaId: null }])
    })

    it('extrai mensagem de mídia com caption e fallback de nome do arquivo', () => {
      const body = {
        entry: [{ changes: [{ value: {
          metadata: { phone_number_id: 'phone-1' },
          messages: [{ from: '5511988887777', id: 'wamid-2', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg' } }],
        } }] }],
      }
      const result = meta.parseWebhook(body)
      expect(result[0]).toMatchObject({ text: '[image]', mediaType: 'image', mediaId: 'media-1', mediaMimeType: 'image/jpeg' })
    })

    it('captura o replyToWaId de mensagens com contexto', () => {
      const body = {
        entry: [{ changes: [{ value: {
          messages: [{ from: '5511988887777', id: 'wamid-3', type: 'text', text: { body: 'resposta' }, context: { id: 'wamid-original' } }],
        } }] }],
      }
      expect(meta.parseWebhook(body)[0].replyToWaId).toBe('wamid-original')
    })

    it('retorna array vazio quando não há mensagens', () => {
      expect(meta.parseWebhook({ entry: [{ changes: [{ value: {} }] }] })).toEqual([])
    })
  })

  describe('parseWebhookStatuses', () => {
    it('extrai status de entrega com erro quando presente', () => {
      const body = {
        entry: [{ changes: [{ value: {
          metadata: { phone_number_id: 'phone-1' },
          statuses: [{ id: 'wamid-1', recipient_id: '5511988887777', status: 'failed', errors: [{ message: 'número inválido' }] }],
        } }] }],
      }
      const result = meta.parseWebhookStatuses(body)
      expect(result).toEqual([{ messageId: 'wamid-1', recipientId: '5511988887777', status: 'failed', phoneNumberId: 'phone-1', error: 'número inválido' }])
    })

    it('retorna error null quando não há erro reportado', () => {
      const body = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid-2', recipient_id: '5511', status: 'delivered' }] } }] }] }
      expect(meta.parseWebhookStatuses(body)[0].error).toBeNull()
    })
  })
})
