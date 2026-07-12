import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../config/index.js', () => ({
  config: { openai: { apiKey: 'env-key', model: 'gpt-4o-mini' } },
}))

import { config } from '../../../config/index.js'
import { chat, transcribeAudio } from '../openai.js'

describe('ai/openai service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    config.openai.apiKey = 'env-key'
  })

  describe('chat', () => {
    it('lança erro quando não há chave OpenAI (nem do tenant, nem do .env)', async () => {
      config.openai.apiKey = ''
      await expect(chat({ messages: [] })).rejects.toThrow('Nenhuma chave OpenAI configurada')
    })

    it('usa a chave do tenant quando fornecida, sobrepondo a global', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'oi' } }] }),
      })

      await chat({ messages: [{ role: 'user', content: 'oi' }], apiKey: 'tenant-key' })

      const [, opts] = fetchMock.mock.calls[0]
      expect(opts.headers.Authorization).toBe('Bearer tenant-key')
    })

    it('monta o body com model/temperature/tools/tool_choice/response_format quando fornecidos', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      })
      const tools = [{ type: 'function', function: { name: 'x' } }]

      await chat({
        messages: [{ role: 'user', content: 'oi' }],
        tools,
        toolChoice: 'auto',
        temperature: 0.7,
        maxTokens: 500,
        model: 'gpt-4o',
        responseFormat: { type: 'json_object' },
      })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.model).toBe('gpt-4o')
      expect(body.temperature).toBe(0.7)
      expect(body.max_tokens).toBe(500)
      expect(body.tools).toEqual(tools)
      expect(body.tool_choice).toBe('auto')
      expect(body.response_format).toEqual({ type: 'json_object' })
    })

    it('usa o model padrão da config quando não é passado explicitamente', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      })
      await chat({ messages: [] })
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.model).toBe('gpt-4o-mini')
    })

    it('retorna a mensagem do primeiro choice', async () => {
      const assistantMsg = { role: 'assistant', content: 'Olá!', tool_calls: undefined }
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: assistantMsg }] }),
      })
      const result = await chat({ messages: [] })
      expect(result).toEqual(assistantMsg)
    })

    it('lança erro com a mensagem da API quando a resposta não é ok', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'chave inválida' } }),
      })
      await expect(chat({ messages: [] })).rejects.toThrow('chave inválida')
    })

    it('lança erro genérico com status quando a API não retorna error.message', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      })
      await expect(chat({ messages: [] })).rejects.toThrow('OpenAI erro 500')
    })
  })

  describe('transcribeAudio', () => {
    it('lança erro quando não há chave OpenAI', async () => {
      config.openai.apiKey = ''
      await expect(transcribeAudio(Buffer.from('x'), 'audio/ogg')).rejects.toThrow('Nenhuma chave OpenAI configurada')
    })

    it('retorna o texto transcrito em caso de sucesso', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'transcrição de teste' }),
      })
      const result = await transcribeAudio(Buffer.from('audio-bytes'), 'audio/ogg', 'nota.ogg')
      expect(result).toBe('transcrição de teste')
    })

    it('lança erro com mensagem da API quando falha', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'arquivo inválido' } }),
      })
      await expect(transcribeAudio(Buffer.from('x'), 'audio/ogg')).rejects.toThrow('arquivo inválido')
    })

    it('retorna string vazia quando a API não retorna texto', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) })
      const result = await transcribeAudio(Buffer.from('x'), 'audio/ogg')
      expect(result).toBe('')
    })
  })
})
