import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../test-utils/supabaseMock.js'
import { ttlClearAll } from '../../../utils/ttlCache.js'

const mockState = vi.hoisted(() => ({ box: {}, metaSendText: null, metaSendMedia: null, metaSendLocation: null, evoSendText: null, evoSendMedia: null, evoSendLocation: null, evoEditMessage: null, evoDeleteMessage: null }))

vi.mock('../../../db/supabase.js', () => ({
  get supabase() { return mockState.box.supabase },
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

vi.mock('../meta.js', () => ({
  sendText: (...a) => mockState.metaSendText(...a),
  sendMedia: (...a) => mockState.metaSendMedia(...a),
  sendLocation: (...a) => mockState.metaSendLocation(...a),
}))

vi.mock('../evolution.js', () => ({
  sendText: (...a) => mockState.evoSendText(...a),
  sendMedia: (...a) => mockState.evoSendMedia(...a),
  sendLocation: (...a) => mockState.evoSendLocation(...a),
  editMessage: (...a) => mockState.evoEditMessage(...a),
  deleteMessage: (...a) => mockState.evoDeleteMessage(...a),
}))

const whatsapp = await import('../index.js')

let supabaseMock
function setSupabase(responses) {
  supabaseMock = createSupabaseMock(responses)
  mockState.box.supabase = supabaseMock.supabase
  return supabaseMock
}

describe('whatsapp/index (dispatcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ttlClearAll()
    mockState.metaSendText = vi.fn().mockResolvedValue({ id: 'meta-1' })
    mockState.metaSendMedia = vi.fn().mockResolvedValue({ id: 'meta-2' })
    mockState.metaSendLocation = vi.fn().mockResolvedValue({ id: 'meta-3' })
    mockState.evoSendText = vi.fn().mockResolvedValue({ id: 'evo-1' })
    mockState.evoSendMedia = vi.fn().mockResolvedValue({ id: 'evo-2' })
    mockState.evoSendLocation = vi.fn().mockResolvedValue({ id: 'evo-3' })
    mockState.evoEditMessage = vi.fn().mockResolvedValue({ ok: true })
    mockState.evoDeleteMessage = vi.fn().mockResolvedValue({ ok: true })
  })

  describe('sendText', () => {
    it('usa a Meta quando feat_meta_api está habilitado', async () => {
      setSupabase({ tenants: [{ data: [{ feat_meta_api: true }], error: null }] })
      const result = await whatsapp.sendText('tenant-1', '5511988887777', 'Oi')
      expect(result).toEqual({ id: 'meta-1' })
      expect(mockState.evoSendText).not.toHaveBeenCalled()
    })

    it('usa a Evolution quando feat_evolution_api está habilitado', async () => {
      setSupabase({ tenants: [{ data: [{ feat_evolution_api: true }], error: null }] })
      const result = await whatsapp.sendText('tenant-1', '5511988887777', 'Oi')
      expect(result).toEqual({ id: 'evo-1' })
      expect(mockState.metaSendText).not.toHaveBeenCalled()
    })

    it('modo híbrido: tenta Meta primeiro e cai para Evolution se a Meta falhar', async () => {
      setSupabase({ tenants: [{ data: [{ feat_hybrid: true }], error: null }] })
      mockState.metaSendText.mockRejectedValue(new Error('token expirado'))
      const result = await whatsapp.sendText('tenant-1', '5511988887777', 'Oi')
      expect(result).toEqual({ id: 'evo-1' })
    })

    it('modo híbrido: usa a Meta quando ela funciona, sem cair para Evolution', async () => {
      setSupabase({ tenants: [{ data: [{ feat_hybrid: true }], error: null }] })
      const result = await whatsapp.sendText('tenant-1', '5511988887777', 'Oi')
      expect(result).toEqual({ id: 'meta-1' })
      expect(mockState.evoSendText).not.toHaveBeenCalled()
    })

    it('sem nenhuma flag explícita, detecta canal Evolution conectado automaticamente', async () => {
      setSupabase({
        tenants: [{ data: [{}], error: null }],
        channels: [{ data: [{ id: 'ch-1' }], error: null }],
      })
      const result = await whatsapp.sendText('tenant-1', '5511988887777', 'Oi')
      expect(result).toEqual({ id: 'evo-1' })
    })

    it('lança erro quando nenhum provider está habilitado nem há canal conectado', async () => {
      setSupabase({ tenants: [{ data: [{}], error: null }], channels: [{ data: [], error: null }] })
      await expect(whatsapp.sendText('tenant-1', '5511988887777', 'Oi')).rejects.toThrow('Nenhum provider de WhatsApp habilitado para este cliente.')
    })

    it('cacheia os feature flags do tenant — só uma query em tenants pra 2 envios seguidos', async () => {
      setSupabase({ tenants: [{ data: [{ feat_meta_api: true }], error: null }] })
      await whatsapp.sendText('tenant-cache-1', '5511988887777', 'Oi 1')
      await whatsapp.sendText('tenant-cache-1', '5511988887777', 'Oi 2')
      expect(supabaseMock.calls.filter((c) => c.table === 'tenants' && c.method === 'select').length).toBe(1)
      expect(mockState.metaSendText).toHaveBeenCalledTimes(2)
    })

    it('cacheia hasConnectedChannel — só uma query em channels pra 2 envios seguidos', async () => {
      setSupabase({ tenants: [{ data: [{}], error: null }], channels: [{ data: [{ id: 'ch-1' }], error: null }] })
      await whatsapp.sendText('tenant-cache-2', '5511988887777', 'Oi 1')
      await whatsapp.sendText('tenant-cache-2', '5511988887777', 'Oi 2')
      expect(supabaseMock.calls.filter((c) => c.table === 'channels' && c.method === 'select').length).toBe(1)
      expect(mockState.evoSendText).toHaveBeenCalledTimes(2)
    })
  })

  describe('sendMedia', () => {
    it('modo híbrido cai para Evolution quando a Meta falha para mídia', async () => {
      setSupabase({ tenants: [{ data: [{ feat_hybrid: true }], error: null }] })
      mockState.metaSendMedia.mockRejectedValue(new Error('falha upload'))
      const result = await whatsapp.sendMedia('tenant-1', '5511988887777', { buffer: Buffer.from('x'), mimetype: 'image/png' })
      expect(result).toEqual({ id: 'evo-2' })
    })
  })

  describe('sendLocation', () => {
    it('usa Evolution quando feat_evolution_api está habilitado', async () => {
      setSupabase({ tenants: [{ data: [{ feat_evolution_api: true }], error: null }] })
      const result = await whatsapp.sendLocation('tenant-1', '5511988887777', { latitude: 1, longitude: 2 })
      expect(result).toEqual({ id: 'evo-3' })
    })
  })

  describe('editMessage / deleteMessage', () => {
    it('editMessage sempre delega para a Evolution (Meta não suporta edição)', async () => {
      const result = await whatsapp.editMessage('tenant-1', { waMessageId: 'wa-1', remoteJid: 'x', newText: 'y' })
      expect(result).toEqual({ ok: true })
      expect(mockState.evoEditMessage).toHaveBeenCalled()
    })

    it('deleteMessage sempre delega para a Evolution', async () => {
      const result = await whatsapp.deleteMessage('tenant-1', { waMessageId: 'wa-1', remoteJid: 'x' })
      expect(result).toEqual({ ok: true })
      expect(mockState.evoDeleteMessage).toHaveBeenCalled()
    })
  })
})
