/**
 * Flow Engine — motor de execução de chatbots.
 * Segue o ciclo: receber mensagem → sessão → nó atual → executar → avançar.
 */

import { supabase, unwrap } from '../db/supabase.js'
import * as whatsapp        from './whatsapp/index.js'
import { safeFetch }        from '../utils/ssrfGuard.js'

const HISTORY_LIMIT = 40

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Processa uma mensagem inbound. Retorna true se o flow tratou a mensagem
 * (impede que o orchestrator chame a IA).
 *
 * allowNewFlow: false quando human_takeover=true — retoma sessões existentes
 * mas não dispara novos fluxos enquanto um humano está atendendo.
 */
export async function processFlowMessage({ tenantId, leadId, text, channelId, allowNewFlow = true }) {
  try {
    // Retoma sessão ativa independente de human_takeover
    const session = await getSession(tenantId, leadId)
    if (session) {
      await resumeFlow(session, text, tenantId, leadId)
      return true
    }

    // Só inicia novo fluxo se não houver humano atendendo
    if (allowNewFlow) {
      const flow = await findTriggeredFlow(tenantId, text, channelId)
      if (flow) {
        await startFlow(flow, tenantId, leadId)
        return true
      }
    }

    return false
  } catch (e) {
    console.error('[flowEngine]', e.message, e.stack)
    return false
  }
}

// ─── Sessão ───────────────────────────────────────────────────────────────────

async function getSession(tenantId, leadId) {
  const rows = unwrap(
    await supabase.from('flow_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .eq('status', 'active')
      .limit(1)
  )
  return rows?.[0] || null
}

async function createSession(tenantId, leadId, flowId, firstNodeId) {
  return unwrap(
    await supabase.from('flow_sessions').insert({
      tenant_id:        tenantId,
      flow_id:          flowId,
      lead_id:          leadId,
      current_node_id:  firstNodeId,
      variables:        {},
      status:           'active',
      last_activity_at: new Date().toISOString(),
    }).select().single()
  )
}

async function updateSession(sessionId, patch) {
  await supabase.from('flow_sessions')
    .update({ ...patch, last_activity_at: new Date().toISOString() })
    .eq('id', sessionId)
}

async function closeSession(sessionId, status = 'completed') {
  await supabase.from('flow_sessions').update({ status }).eq('id', sessionId)
}

// ─── Gatilho ─────────────────────────────────────────────────────────────────

async function findTriggeredFlow(tenantId, text, channelId) {
  const rows = unwrap(
    await supabase.from('flows').select('*').eq('tenant_id', tenantId).eq('status', 'active')
  )
  if (!rows?.length) return null

  const lower = (text || '').toLowerCase().trim()

  // 1. Keyword match (canal específico tem prioridade)
  for (const flow of rows) {
    if (flow.channel_id && channelId && flow.channel_id !== channelId) continue
    const kws = (flow.trigger_keywords || []).filter(Boolean)
    if (kws.some(kw => lower.includes(kw.toLowerCase()))) return flow
  }

  // 2. Canal vinculado sem keywords → qualquer mensagem dispara
  if (channelId) {
    const linked = rows.find(f => f.channel_id === channelId && !f.trigger_keywords?.length)
    if (linked) return linked
  }

  return null
}

// ─── Iniciar fluxo ────────────────────────────────────────────────────────────

async function startFlow(flow, tenantId, leadId) {
  const nodes = flow.nodes || []
  if (!nodes.length) return

  // Pula nó de tipo 'inicio' se existir, começa no primeiro nó real
  const firstNode = nodes.find(n => n.tipo !== 'inicio') ?? nodes[0]
  if (!firstNode) return

  const session = await createSession(tenantId, leadId, flow.id, firstNode.id)
  if (session) await runNode(flow, firstNode, session, tenantId, leadId)
}

// ─── Retomar fluxo ────────────────────────────────────────────────────────────

async function resumeFlow(session, userText, tenantId, leadId) {
  const rows = unwrap(await supabase.from('flows').select('*').eq('id', session.flow_id).limit(1))
  const flow = rows?.[0]
  if (!flow) { await closeSession(session.id, 'error'); return }

  // Verificar timeout
  const elapsedMin = (Date.now() - new Date(session.last_activity_at).getTime()) / 60000
  if (elapsedMin > (flow.timeout_minutes || 30)) {
    await closeSession(session.id, 'timeout')
    if (flow.fallback_text) {
      const phone = await getLeadPhone(tenantId, leadId)
      if (phone) await whatsapp.sendText(tenantId, phone, flow.fallback_text).catch((e) => console.warn('[flowEngine] falha ao enviar mensagem:', e.message))
    }
    return
  }

  const currentNode = (flow.nodes || []).find(n => n.id === session.current_node_id)
  if (!currentNode) { await closeSession(session.id, 'error'); return }

  let variables = { ...(session.variables || {}) }

  // Captura de variável (formato legado)
  if (currentNode.tipo === 'captura' && currentNode.variavel) {
    variables[currentNode.variavel] = userText
    await updateSession(session.id, { variables })
  } else {
    await updateSession(session.id, {})
  }

  const updatedSession = { ...session, variables, _lastInput: userText }

  // Formato novo: passo com saida='aguardar' — rotear pela resposta
  if (currentNode.tipo === 'passo' && currentNode.saida === 'aguardar') {
    await roteiarResposta(flow, currentNode, updatedSession, userText, tenantId, leadId)
    return
  }

  const nextNode = getNextNode(flow.nodes, currentNode, updatedSession)
  if (nextNode) {
    await runNode(flow, nextNode, updatedSession, tenantId, leadId)
  } else if (flow.fallback_text) {
    const phone = await getLeadPhone(tenantId, leadId)
    if (phone) await whatsapp.sendText(tenantId, phone, flow.fallback_text).catch((e) => console.warn('[flowEngine] falha ao enviar mensagem:', e.message))
  }
}

// Roteamento por resposta do usuário (nó 'passo' com saida='aguardar')
async function roteiarResposta(flow, node, session, userText, tenantId, leadId) {
  const lower = (userText || '').toLowerCase().trim()
  const nodes = flow.nodes || []

  const match = (node.respostas || []).find(r =>
    r.texto && lower.includes(r.texto.toLowerCase())
  )
  const destId = match?.destino || node.padrao

  // Destinos especiais
  if (destId === '__transfer__' || destId === '__end__') {
    const fake = { id: `_special_${Date.now()}`, tipo: destId === '__transfer__' ? 'transferencia' : 'encerrar' }
    await runNode(flow, fake, session, tenantId, leadId)
    return
  }

  if (destId) {
    const next = nodes.find(n => n.id === destId)
    if (next) { await runNode(flow, next, session, tenantId, leadId); return }
  }

  // Sem match e sem padrão: avança sequencialmente
  const next = getNextNode(nodes, node, session)
  if (next) await runNode(flow, next, session, tenantId, leadId)
}

// ─── Navegação entre nós ──────────────────────────────────────────────────────

function getNextNode(nodes, currentNode, session) {
  // Condição: avalia regras e retorna nó de destino
  if (currentNode.tipo === 'condicao') {
    const destId = evaluateConditions(currentNode, session)
    return destId ? (nodes.find(n => n.id === destId) || null) : null
  }

  // Destino explícito via campo `proximo`
  if (currentNode.proximo) {
    return nodes.find(n => n.id === currentNode.proximo) || null
  }

  // Próximo na sequência do array
  const idx = nodes.findIndex(n => n.id === currentNode.id)
  if (idx >= 0 && idx < nodes.length - 1) return nodes[idx + 1]

  return null
}

// ─── Executar nó ─────────────────────────────────────────────────────────────

async function runNode(flow, node, session, tenantId, leadId) {
  await updateSession(session.id, { current_node_id: node.id })

  const phone = await getLeadPhone(tenantId, leadId)
  const vars  = session.variables || {}

  // Avança para o próximo nó automaticamente
  const advance = async (newVars) => {
    const s = { ...session, variables: newVars ?? vars }
    const next = getNextNode(flow.nodes, node, s)
    if (next) await runNode(flow, next, s, tenantId, leadId)
  }

  switch (node.tipo) {

    // ── Passo (formato novo): mensagem + saída configurável ──
    case 'passo': {
      const txt = interpolate(node.mensagem || '', vars)
      if (phone && txt) {
        await whatsapp.sendText(tenantId, phone, txt).catch((e) => console.warn('[flowEngine] falha ao enviar mensagem:', e.message))
        await saveMsg(tenantId, leadId, 'ai', txt)
      }
      switch (node.saida) {
        case 'aguardar':
          // Aguarda próxima mensagem — resumeFlow() vai rotear
          break
        case 'transferir': {
          const msg = node.msg_transferencia ? interpolate(node.msg_transferencia, vars) : null
          if (msg && phone) {
            await whatsapp.sendText(tenantId, phone, msg).catch((e) => console.warn('[flowEngine] falha ao enviar mensagem:', e.message))
            await saveMsg(tenantId, leadId, 'ai', msg)
          }
          await supabase.from('leads')
            .update({
              human_takeover: true,
              ...(node.queue_id ? { queue_id: node.queue_id } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadId)
          await saveMsg(tenantId, leadId, 'system', '— Atendimento transferido para humano pelo chatbot —')
          await closeSession(session.id, 'transferred')
          break
        }
        case 'encerrar':
          await closeSession(session.id, 'completed')
          break
        default: // 'avancar'
          await advance()
      }
      break
    }

    // ── Mensagem: envia texto e avança ──
    case 'mensagem': {
      const txt = interpolate(node.conteudo || '', vars)
      if (phone && txt) {
        await whatsapp.sendText(tenantId, phone, txt).catch((e) => console.warn('[flowEngine] falha ao enviar mensagem:', e.message))
        await saveMsg(tenantId, leadId, 'ai', txt)
      }
      await advance()
      break
    }

    // ── Captura: envia pergunta e AGUARDA resposta do usuário ──
    case 'captura': {
      const txt = interpolate(node.pergunta || '', vars)
      if (phone && txt) {
        await whatsapp.sendText(tenantId, phone, txt).catch((e) => console.warn('[flowEngine] falha ao enviar mensagem:', e.message))
        await saveMsg(tenantId, leadId, 'ai', txt)
      }
      // Não avança — próximo resumeFlow() tratará a resposta
      break
    }

    // ── Condição: avalia regras e redireciona ──
    case 'condicao': {
      await advance() // getNextNode já avalia as regras
      break
    }

    // ── IA: chama o agente de IA com o histórico da conversa ──
    case 'ia': {
      try {
        const { runAgent }  = await import('./ai/agent.js')
        const tenantRows    = unwrap(await supabase.from('tenants').select('name').eq('id', tenantId).limit(1))
        const tenantName    = tenantRows?.[0]?.name || null
        // últimas HISTORY_LIMIT mensagens (desc + reverse), mesmo limite do
        // orchestrator.js — evita query e prompt de IA sem limite em conversas longas.
        const histRows      = unwrap(
          await supabase.from('messages').select('role, text')
            .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(HISTORY_LIMIT)
        )
        const out = await runAgent({ tenantId, tenantName, history: (histRows || []).reverse() })
        if (out?.reply && phone) {
          await whatsapp.sendText(tenantId, phone, out.reply).catch((e) => console.warn('[flowEngine] falha ao enviar mensagem:', e.message))
          await saveMsg(tenantId, leadId, 'ai', out.reply)
        }
      } catch (e) {
        console.warn('[flowEngine] nó ia:', e.message)
      }
      await advance()
      break
    }

    // ── Webhook: chama API externa, salva retorno e avança ──
    case 'webhook': {
      try {
        const url    = interpolate(node.url || '', vars)
        const method = (node.metodo || 'POST').toUpperCase()
        const body   = node.corpo ? interpolate(node.corpo, vars) : null

        // safeFetch em vez de fetch direto: node.url vem do construtor de fluxo,
        // controlado por qualquer usuário autenticado do tenant (sem checagem de
        // role) — sem essa proteção seria SSRF trivial contra rede interna, com
        // a resposta exfiltrada de volta pro WhatsApp via `node.variavel`.
        const resp = await safeFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body:    method !== 'GET' && body ? body : undefined,
          signal:  AbortSignal.timeout(10_000),
        })

        let newVars = { ...vars }
        if (node.variavel) {
          try {
            const data = await resp.json()
            newVars[node.variavel] = typeof data === 'string' ? data : JSON.stringify(data)
            await updateSession(session.id, { variables: newVars })
          } catch { /* ignora erro de parse */ }
        }
        await advance(newVars)
      } catch (e) {
        console.warn('[flowEngine] webhook:', e.message)
        await advance()
      }
      break
    }

    // ── Transferência: encerra bot e passa para humano ──
    case 'transferencia': {
      const msg = node.mensagem ? interpolate(node.mensagem, vars) : null
      if (msg && phone) {
        await whatsapp.sendText(tenantId, phone, msg).catch((e) => console.warn('[flowEngine] falha ao enviar mensagem:', e.message))
        await saveMsg(tenantId, leadId, 'ai', msg)
      }
      await supabase.from('leads')
        .update({
          human_takeover: true,
          ...(node.queue_id ? { queue_id: node.queue_id } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)
      await saveMsg(tenantId, leadId, 'system', '— Atendimento transferido para humano pelo chatbot —')
      await closeSession(session.id, 'transferred')
      break
    }

    // ── Delay: aguarda X ms antes de continuar ──
    case 'delay': {
      const ms = Math.min(Number(node.tempo) || 1000, 300_000)
      setTimeout(async () => {
        try {
          const rows = unwrap(
            await supabase.from('flow_sessions').select('*')
              .eq('id', session.id).eq('status', 'active').limit(1)
          )
          if (rows?.[0]) {
            const s = { ...session, variables: rows[0].variables || vars }
            const next = getNextNode(flow.nodes, node, s)
            if (next) await runNode(flow, next, s, tenantId, leadId)
          }
        } catch { /* silencioso — sessão pode ter sido encerrada */ }
      }, ms)
      break
    }

    // ── Encerrar: fecha a sessão ──
    case 'encerrar': {
      await closeSession(session.id, 'completed')
      break
    }

    default:
      await advance()
  }
}

// ─── Avaliação de condições ───────────────────────────────────────────────────

function evaluateConditions(node, session) {
  // Valor a testar: variável específica ou última entrada do usuário
  const testVal = node.variavel
    ? String(session.variables?.[node.variavel] ?? '')
    : String(session._lastInput ?? '')

  for (const regra of (node.regras || [])) {
    if (evaluateRule(testVal, regra.operador, regra.valor ?? '')) {
      return regra.destino
    }
  }

  return node.padrao || null
}

function evaluateRule(valor, operador, alvo) {
  const v = String(valor).trim()
  const a = String(alvo).trim()

  switch (operador) {
    case 'igual':        return v.toLowerCase() === a.toLowerCase()
    case 'diferente':    return v.toLowerCase() !== a.toLowerCase()
    case 'contém':       return v.toLowerCase().includes(a.toLowerCase())
    case 'não contém':   return !v.toLowerCase().includes(a.toLowerCase())
    case 'maior':        return parseFloat(v) > parseFloat(a)
    case 'menor':        return parseFloat(v) < parseFloat(a)
    case 'regex':        try { return new RegExp(a, 'i').test(v) } catch { return false }
    case 'vazio':        return v === ''
    case 'não vazio':    return v !== ''
    default:             return false
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function interpolate(text, vars) {
  return (text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars?.[k] ?? `{{${k}}}`)
}

async function getLeadPhone(tenantId, leadId) {
  const rows = unwrap(
    await supabase.from('leads').select('phone').eq('id', leadId).eq('tenant_id', tenantId).limit(1)
  )
  return rows?.[0]?.phone || null
}

async function saveMsg(tenantId, leadId, role, text) {
  try {
    await supabase.from('messages').insert({ tenant_id: tenantId, lead_id: leadId, role, text })
  } catch { /* ignora */ }
}
