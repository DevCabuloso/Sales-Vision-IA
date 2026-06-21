import { chat } from './openai.js'

const STAGES = ['Novo Lead', 'Em Qualificação', 'Qualificado', 'Reunião Agendada', 'Perdido']

/**
 * Analisa o histórico da conversa e retorna campos estruturados para o lead.
 * Retorna { score, intention, stage, interests }.
 */
export async function analyzeLead(history) {
  const transcript = history
    .map((m) => `${m.role === 'lead' ? 'Lead' : 'IA'}: ${m.text}`)
    .join('\n')

  const messages = [
    {
      role: 'system',
      content:
        'Você é um analista de SDR. A partir da conversa, avalie o lead e responda ' +
        'APENAS um JSON com: score (0-100, quão pronto para comprar), intention ' +
        '(frase curta sobre o que ele quer), stage (um de: ' + STAGES.join(', ') + '), ' +
        'interests (array de palavras-chave). Sem markdown, só o JSON.',
    },
    { role: 'user', content: transcript || '(sem mensagens ainda)' },
  ]

  const msg = await chat({
    messages,
    temperature: 0,
    responseFormat: { type: 'json_object' },
  })

  let parsed = {}
  try {
    parsed = JSON.parse(msg.content)
  } catch {
    parsed = {}
  }

  return {
    score: clampScore(parsed.score),
    intention: typeof parsed.intention === 'string' ? parsed.intention.slice(0, 200) : null,
    stage: STAGES.includes(parsed.stage) ? parsed.stage : 'Em Qualificação',
    interests: Array.isArray(parsed.interests) ? parsed.interests.slice(0, 10) : [],
  }
}

function clampScore(s) {
  const n = Number(s)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}
