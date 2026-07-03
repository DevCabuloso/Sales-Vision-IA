import { supabase, unwrap } from '../db/supabase.js'
import * as whatsapp from './whatsapp/index.js'

/**
 * Entry point chamado pelo orchestrator para cada mensagem inbound.
 * Retorna true se o flow tratou a mensagem (AI não deve rodar).
 */
export async function processFlowMessage({ tenantId, leadId, text, channelId }) {
  try {
    const session = await getActiveSession(tenantId, leadId)
    if (session) {
      await resumeFlow(session, text, tenantId, leadId)
      return true
    }
    const flow = await findTriggeredFlow(tenantId, text, channelId)
    if (flow) {
      await startFlow(flow, tenantId, leadId)
      return true
    }
    return false
  } catch (e) {
    console.error('[flowEngine] erro:', e.message)
    return false
  }
}

// ─── Sessão ────────────────────────────────────────────────────────────────

async function getActiveSession(tenantId, leadId) {
  const rows = unwrap(
    await supabase.from('flow_sessions')
      .select('*').eq('tenant_id', tenantId).eq('lead_id', leadId).eq('status', 'active').limit(1)
  )
  return rows?.[0] || null
}

// ─── Gatilho ───────────────────────────────────────────────────────────────

async function findTriggeredFlow(tenantId, text, channelId) {
  const rows = unwrap(
    await supabase.from('flows').select('*').eq('tenant_id', tenantId).eq('status', 'active')
  )
  if (!rows?.length) return null
  const lower = (text || '').toLowerCase().trim()

  // 1. Keyword-triggered (qualquer canal ou canal específico)
  for (const flow of rows) {
    if (flow.channel_id && channelId && flow.channel_id !== channelId) continue
    const kws = (flow.trigger_keywords || []).filter(Boolean)
    if (kws.some(kw => lower.includes(kw.toLowerCase()))) return flow
  }

  // 2. Canal vinculado sem keyword → qualquer mensagem ativa o fluxo
  if (channelId) {
    const linked = rows.find(f => f.channel_id === channelId && !(f.trigger_keywords?.length))
    if (linked) return linked
  }

  return null
}

// ─── Iniciar ───────────────────────────────────────────────────────────────

async function startFlow(flow, tenantId, leadId) {
  const nodes = flow.nodes || []
  const edges = flow.edges || []
  const startNode = nodes.find(n => n.data?.nodeType === 'start')
  if (!startNode) return

  const firstEdge = edges.find(e => e.source === startNode.id)
  const firstNode = firstEdge ? nodes.find(n => n.id === firstEdge.target) : null
  if (!firstNode) return

  const session = unwrap(
    await supabase.from('flow_sessions').insert({
      tenant_id: tenantId, flow_id: flow.id, lead_id: leadId,
      current_node_id: startNode.id, variables: {}, status: 'active',
      last_activity_at: new Date().toISOString(),
    }).select().single()
  )
  if (session) await executeNode(flow, firstNode, session, tenantId, leadId)
}

// ─── Retomar ───────────────────────────────────────────────────────────────

async function resumeFlow(session, userText, tenantId, leadId) {
  const rows = unwrap(await supabase.from('flows').select('*').eq('id', session.flow_id).limit(1))
  const flow = rows?.[0]
  if (!flow) { await closeSession(session.id, 'error'); return }

  // Timeout
  const elapsed = (Date.now() - new Date(session.last_activity_at).getTime()) / 60000
  if (elapsed > (flow.timeout_minutes || 30)) {
    await closeSession(session.id, 'timeout')
    if (flow.fallback_text) {
      const phone = await getLeadPhone(tenantId, leadId)
      if (phone) await whatsapp.sendText(tenantId, phone, flow.fallback_text).catch(() => {})
    }
    return
  }

  const currentNode = (flow.nodes || []).find(n => n.id === session.current_node_id)
  if (!currentNode) { await closeSession(session.id, 'error'); return }

  let variables = { ...session.variables }

  // Se o nó atual captura variável, armazena a resposta do usuário
  if (currentNode.data?.nodeType === 'variable' && currentNode.data?.variableName) {
    variables[currentNode.data.variableName] = userText
    await supabase.from('flow_sessions')
      .update({ variables, last_activity_at: new Date().toISOString() }).eq('id', session.id)
  } else {
    await supabase.from('flow_sessions')
      .update({ last_activity_at: new Date().toISOString() }).eq('id', session.id)
  }

  // Encontra próxima aresta
  const lower = (userText || '').toLowerCase().trim()
  const outEdges = (flow.edges || []).filter(e => e.source === currentNode.id)

  // Aresta keyword tem prioridade
  let nextEdge = outEdges.find(e => {
    if ((e.data?.edgeType || e.type) !== 'keyword') return false
    const kws = (e.data?.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    return kws.some(kw => lower.includes(kw))
  })

  // Fallback: aresta padrão
  if (!nextEdge) {
    nextEdge = outEdges.find(e => {
      const t = e.data?.edgeType || e.type
      return t === 'default' || t === 'smoothstep' || (!t && t !== 'auto')
    })
  }

  if (!nextEdge) {
    if (flow.fallback_text) {
      const phone = await getLeadPhone(tenantId, leadId)
      if (phone) await whatsapp.sendText(tenantId, phone, flow.fallback_text).catch(() => {})
    }
    return
  }

  const nextNode = (flow.nodes || []).find(n => n.id === nextEdge.target)
  if (nextNode) await executeNode(flow, nextNode, { ...session, variables }, tenantId, leadId)
}

// ─── Executar nó ───────────────────────────────────────────────────────────

async function executeNode(flow, node, session, tenantId, leadId) {
  const nodeType = node.data?.nodeType || node.type
  const phone = await getLeadPhone(tenantId, leadId)

  await supabase.from('flow_sessions')
    .update({ current_node_id: node.id, last_activity_at: new Date().toISOString() })
    .eq('id', session.id)

  const autoAdvance = async (updatedSession = session) => {
    const autoEdge = (flow.edges || []).find(
      e => e.source === node.id && (e.data?.edgeType === 'auto' || e.type === 'auto')
    )
    if (autoEdge) {
      const next = (flow.nodes || []).find(n => n.id === autoEdge.target)
      if (next) await executeNode(flow, next, updatedSession, tenantId, leadId)
    }
  }

  switch (nodeType) {
    case 'message': {
      const text = interpolate(node.data?.text || '', session.variables)
      if (phone && text) {
        await whatsapp.sendText(tenantId, phone, text).catch(e => console.warn('[flowEngine] msg:', e.message))
        await saveMsg(tenantId, leadId, 'ai', text)
      }
      await autoAdvance()
      break
    }

    case 'delay': {
      const ms = Math.min((node.data?.seconds || 1) * 1000, 300_000)
      setTimeout(async () => {
        try {
          const s = unwrap(
            await supabase.from('flow_sessions').select('*').eq('id', session.id).eq('status', 'active').limit(1)
          )
          if (s?.[0]) await autoAdvance(s[0])
        } catch { /* silencioso */ }
      }, ms)
      break
    }

    case 'variable': {
      if (node.data?.prompt && phone) {
        const text = interpolate(node.data.prompt, session.variables)
        await whatsapp.sendText(tenantId, phone, text).catch(() => {})
        await saveMsg(tenantId, leadId, 'ai', text)
      }
      // fica aguardando resposta do usuário
      break
    }

    case 'condition': {
      const varVal = node.data?.variableName ? (session.variables[node.data.variableName] || '') : ''
      const lower = varVal.toLowerCase()
      const outEdges = (flow.edges || []).filter(e => e.source === node.id)

      let match = outEdges.find(e => {
        const kws = (e.data?.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
        return kws.some(kw => lower.includes(kw))
      })
      if (!match) match = outEdges.find(e => {
        const t = e.data?.edgeType || e.type
        return t === 'default' || !t
      })

      if (match) {
        const next = (flow.nodes || []).find(n => n.id === match.target)
        if (next) await executeNode(flow, next, session, tenantId, leadId)
      }
      break
    }

    case 'transfer': {
      const msg = node.data?.message ? interpolate(node.data.message, session.variables) : null
      if (msg && phone) {
        await whatsapp.sendText(tenantId, phone, msg).catch(() => {})
        await saveMsg(tenantId, leadId, 'ai', msg)
      }
      await supabase.from('leads')
        .update({ human_takeover: true, updated_at: new Date().toISOString() }).eq('id', leadId)
      await saveMsg(tenantId, leadId, 'system', '— Atendimento transferido para humano pelo chatbot —')
      await closeSession(session.id, 'transferred')
      break
    }

    case 'webhook': {
      try {
        const url = interpolate(node.data?.url || '', session.variables)
        const method = node.data?.method || 'POST'
        const bodyStr = node.data?.body ? interpolate(node.data.body, session.variables) : null

        const resp = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr || undefined,
          signal: AbortSignal.timeout(10_000),
        })

        if (node.data?.saveVariable) {
          try {
            const data = await resp.json()
            const newVars = {
              ...session.variables,
              [node.data.saveVariable]: typeof data === 'string' ? data : JSON.stringify(data),
            }
            await supabase.from('flow_sessions').update({ variables: newVars }).eq('id', session.id)
            session = { ...session, variables: newVars }
          } catch { /* ignora parse error */ }
        }
      } catch (e) {
        console.warn('[flowEngine] webhook:', e.message)
      }
      await autoAdvance()
      break
    }

    case 'kanban': {
      if (node.data?.stage) {
        await supabase.from('leads')
          .update({ stage: node.data.stage, updated_at: new Date().toISOString() }).eq('id', leadId)
      }
      await autoAdvance()
      break
    }

    case 'end': {
      await closeSession(session.id, 'completed')
      break
    }

    default:
      await autoAdvance()
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

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
  await supabase.from('messages').insert({ tenant_id: tenantId, lead_id: leadId, role, text }).catch(() => {})
}

async function closeSession(id, status) {
  await supabase.from('flow_sessions').update({ status }).eq('id', id).catch(() => {})
}
