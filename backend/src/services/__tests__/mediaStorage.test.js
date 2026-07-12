import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockState = vi.hoisted(() => ({ upload: null, getPublicUrl: null }))

vi.mock('../../config/index.js', () => ({
  config: { supabase: { mediaBucket: 'chat-media' } },
}))

vi.mock('../../db/supabase.js', () => ({
  supabase: {
    storage: {
      from: (bucket) => ({
        upload: (...args) => mockState.upload(bucket, ...args),
        getPublicUrl: (...args) => mockState.getPublicUrl(bucket, ...args),
      }),
    },
  },
}))

const { uploadChatMedia } = await import('../mediaStorage.js')

describe('services/mediaStorage', () => {
  beforeEach(() => {
    mockState.upload = vi.fn().mockResolvedValue({ error: null })
    mockState.getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.exemplo.com/tenant-1/arquivo.jpg' } })
  })

  it('faz upload no bucket configurado e retorna a URL pública', async () => {
    const url = await uploadChatMedia('tenant-1', Buffer.from('bytes'), 'image/jpeg', 'foto.jpg')

    expect(url).toBe('https://cdn.exemplo.com/tenant-1/arquivo.jpg')
    expect(mockState.upload.mock.calls[0][0]).toBe('chat-media')
    const [path, buffer, opts] = mockState.upload.mock.calls[0].slice(1)
    expect(path).toMatch(/^tenant-1\/.+\.jpg$/)
    expect(opts).toEqual({ contentType: 'image/jpeg', upsert: false })
  })

  it('deriva a extensão a partir do mimetype conhecido', async () => {
    await uploadChatMedia('tenant-1', Buffer.from('x'), 'audio/ogg', 'audio-sem-nome')
    const path = mockState.upload.mock.calls[0][1]
    expect(path).toMatch(/\.ogg$/)
  })

  it('cai para a extensão do nome do arquivo quando o mimetype é desconhecido', async () => {
    await uploadChatMedia('tenant-1', Buffer.from('x'), 'application/x-custom', 'planilha.csv')
    const path = mockState.upload.mock.calls[0][1]
    expect(path).toMatch(/\.csv$/)
  })

  it('usa "bin" como extensão padrão quando não há mimetype nem nome reconhecíveis', async () => {
    await uploadChatMedia('tenant-1', Buffer.from('x'), 'application/x-custom', null)
    const path = mockState.upload.mock.calls[0][1]
    expect(path).toMatch(/\.bin$/)
  })

  it('lança erro com a mensagem do storage quando o upload falha', async () => {
    mockState.upload.mockResolvedValue({ error: { message: 'bucket cheio' } })
    await expect(uploadChatMedia('tenant-1', Buffer.from('x'), 'image/png', 'x.png'))
      .rejects.toThrow('Falha ao salvar mídia no storage: bucket cheio')
  })
})
