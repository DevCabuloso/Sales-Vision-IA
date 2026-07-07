import { config } from '../../config/index.js'

const BASE = 'https://api.openai.com/v1'

/**
 * Chamada genérica ao chat completions com suporte a tools.
 * Os parâmetros `model` e `maxTokens` permitem override por tenant (ai_configs).
 */
export async function chat({ messages, tools, toolChoice = 'auto', temperature = 0.4, maxTokens, model, responseFormat }) {
  if (!config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY não configurada no .env.')
  }
  const body = {
    model: model || config.openai.model,
    messages,
    temperature,
  }
  if (maxTokens)      body.max_tokens  = maxTokens
  if (tools)          body.tools       = tools
  if (tools)          body.tool_choice = toolChoice
  if (responseFormat) body.response_format = responseFormat

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error?.message || `OpenAI erro ${res.status}`)
  }
  return data.choices?.[0]?.message
}

/** Transcreve um áudio (buffer) para texto via Whisper da OpenAI. */
export async function transcribeAudio(buffer, mimetype, filename = 'audio.ogg') {
  if (!config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY não configurada no .env.')
  }
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimetype || 'audio/ogg' }), filename)
  form.append('model', 'whisper-1')

  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openai.apiKey}` },
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error?.message || `OpenAI transcription erro ${res.status}`)
  }
  return data.text || ''
}
