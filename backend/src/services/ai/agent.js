import { chat } from './openai.js'
import { getFreeBusy, createEvent } from '../googleCalendar.js'
import { supabase, unwrap } from '../../db/supabase.js'
import { decryptJSON } from '../crypto.js'

// Ferramentas que a IA pode chamar durante a conversa.
const tools = [
  {
    type: 'function',
    function: {
      name: 'consultar_horarios_livres',
      description: 'Consulta horários ocupados no Google Calendar para sugerir horários livres ao lead.',
      parameters: {
        type: 'object',
        properties: {
          dia_inicio: { type: 'string', description: 'Data/hora ISO do início da busca' },
          dia_fim: { type: 'string', description: 'Data/hora ISO do fim da busca' },
        },
        required: ['dia_inicio', 'dia_fim'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendar_reuniao',
      description: 'Cria uma reunião no Google Calendar com link do Meet quando o lead confirma um horário.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          inicio: { type: 'string', description: 'Data/hora ISO de início' },
          fim: { type: 'string', description: 'Data/hora ISO de fim' },
        },
        required: ['titulo', 'inicio', 'fim'],
      },
    },
  },
]

function defaultSystemPrompt(tenantName) {
  const now = new Date().toISOString()
  return (
    `Você é um SDR (pré-vendedor) da empresa ${tenantName || 'nossa empresa'}, conversando por WhatsApp. ` +
    `Data/hora atual: ${now} (America/Sao_Paulo). ` +
    'Seja cordial, objetivo e humano — mensagens curtas, como WhatsApp real. ' +
    'Seu objetivo: entender a necessidade do lead, qualificar e, quando fizer sentido, agendar uma reunião. ' +
    'Para sugerir horários, use consultar_horarios_livres antes de propor. ' +
    'Só use agendar_reuniao quando o lead confirmar explicitamente um horário. ' +
    'Nunca invente horários sem consultar a agenda.'
  )
}

export function buildSystemContent(aiCfg, tenantName) {
  const now = new Date().toISOString()
  if (!aiCfg?.system_prompt && !aiCfg?.main_prompt) {
    return defaultSystemPrompt(tenantName) + knowledgeBaseSuffix(aiCfg)
  }
  let content = aiCfg?.system_prompt
    ? `${aiCfg.system_prompt}\nData/hora atual: ${now} (America/Sao_Paulo).`
    : `Data/hora atual: ${now} (America/Sao_Paulo).`
  if (aiCfg?.main_prompt) {
    content += `\n\n---\n${aiCfg.main_prompt}`
  }
  return content + knowledgeBaseSuffix(aiCfg)
}

function knowledgeBaseSuffix(aiCfg) {
  if (!aiCfg?.knowledge_base) return ''
  return (
    '\n\n---\nBase de conhecimento (catálogo de produtos/serviços da empresa). ' +
    'Use estas informações para responder o cliente com precisão sobre produtos, preços e condições. ' +
    'Não invente itens que não estejam aqui:\n' +
    aiCfg.knowledge_base
  )
}

/** Busca configuração de IA do tenant (com fallback para padrões). */
async function getTenantAIConfig(tenantId) {
  try {
    const rows = unwrap(
      await supabase.from('ai_configs').select('*').eq('tenant_id', tenantId).limit(1)
    )
    return rows[0] || null
  } catch {
    return null
  }
}

/**
 * Processa um turno da conversa.
 * @returns { reply, scheduled }  scheduled = dados do evento se agendou
 */
export async function runAgent({ tenantId, tenantName, history }) {
  const aiCfg = await getTenantAIConfig(tenantId)
  const apiKey = aiCfg?.openai_api_key ? decryptJSON(aiCfg.openai_api_key) : undefined

  const sysContent = buildSystemContent(aiCfg, tenantName)
  const messages = [{ role: 'system', content: sysContent }]

  messages.push(
    ...history
      .filter((m) => m.role === 'lead' || m.role === 'ai' || m.role === 'agent')
      .map((m) => ({
        role: m.role === 'lead' ? 'user' : 'assistant',
        content: m.text || '',
      }))
  )

  let scheduled = null

  // loop de tool-calls (máx 4 iterações para evitar loop infinito)
  for (let i = 0; i < 4; i++) {
    const msg = await chat({
      messages,
      tools,
      temperature: aiCfg?.temperature ?? 0.4,
      maxTokens:   aiCfg?.max_tokens,
      model:       aiCfg?.model,
      apiKey,
    })
    messages.push(msg)

    if (!msg.tool_calls?.length) {
      return { reply: msg.content || '', scheduled }
    }

    for (const call of msg.tool_calls) {
      const args = safeParse(call.function.arguments)
      let result

      try {
        if (call.function.name === 'consultar_horarios_livres') {
          const busy = await getFreeBusy(tenantId, {
            timeMin: args.dia_inicio,
            timeMax: args.dia_fim,
          })
          result = { busy }
        } else if (call.function.name === 'agendar_reuniao') {
          const busy = await getFreeBusy(tenantId, {
            timeMin: args.inicio,
            timeMax: args.fim,
          })
          if (busy.length > 0) {
            result = { ok: false, conflito: true, error: 'Este horário já está ocupado na agenda. Informe o lead e sugira outro horário disponível.' }
          } else {
            const ev = await createEvent(tenantId, {
              summary: args.titulo,
              description: 'Reunião agendada automaticamente pelo SDR IA.',
              start: args.inicio,
              end: args.fim,
            })
            scheduled = { ...ev, title: args.titulo, start: args.inicio, end: args.fim }
            result = { ok: true, meetingLink: ev.meetingLink }
          }
        } else {
          result = { error: 'ferramenta desconhecida' }
        }
      } catch (e) {
        result = { error: e.message }
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  return { reply: 'Pode me confirmar, por favor?', scheduled }
}

function safeParse(s) {
  try { return JSON.parse(s) } catch { return {} }
}
