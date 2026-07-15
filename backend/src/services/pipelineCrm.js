import { config } from '../config/index.js'

/**
 * Cliente HTTP pro Pipeline CRM (pipelinecrm.com). A documentação oficial de
 * API fica atrás de login na conta do cliente (app.pipelinecrm.com/api/docs)
 * — base URL, header de auth e formato de resposta abaixo vêm de fontes de
 * terceiros (wrapper Ruby oficial, hoje arquivado, e posts de blog), NÃO
 * foram validados contra uma conta real. Assim que tivermos uma API key de
 * verdade pra testar, ajustar aqui (e não em routes/integrations.js, que só
 * chama fetchDealStages).
 */

// Aceita tanto `{ deal_stages: [...] }` quanto uma lista solta — e nos campos
// de cada item tenta os nomes mais prováveis, já que não há doc pública
// confirmando os nomes exatos.
function normalizeStage(raw, index) {
  return {
    externalId: String(raw.id ?? raw.deal_stage_id ?? index),
    name: raw.name ?? raw.stage_name ?? `Estágio ${index + 1}`,
    position: Number(raw.position ?? raw.order ?? index),
    probability: raw.probability != null ? Number(raw.probability) : null,
    pipelineExternalId: raw.pipeline_id != null ? String(raw.pipeline_id) : null,
    pipelineName: raw.pipeline_name ?? null,
  }
}

export async function fetchDealStages(apiKey) {
  const r = await fetch(`${config.pipelineCrm.apiBaseUrl}/deal_stages`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  })
  const text = await r.text()
  if (!r.ok) {
    throw new Error(`Pipeline CRM respondeu ${r.status}: ${text.slice(0, 300)}`)
  }

  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error('Pipeline CRM retornou um corpo que não é JSON válido.')
  }

  const list = Array.isArray(body) ? body : (body.deal_stages || body.data || null)
  if (!Array.isArray(list)) {
    throw new Error('Formato de resposta inesperado do Pipeline CRM (esperava uma lista de estágios).')
  }

  return list.map(normalizeStage)
}
