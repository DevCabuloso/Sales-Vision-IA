import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const routesDir = path.join(__dirname, '..', 'routes')

// Tabelas com tenant_id NOT NULL no schema (ver backend/src/db/schema.sql).
// Ficam de fora: tenants (é a própria tabela), users/checkout_orders/usage_events
// (tenant_id nullable, têm fluxos legítimos sem tenant conhecido ainda) e as
// tabelas de junção sem tenant_id (queue_operators, internal_group_members).
const TENANT_SCOPED_TABLES = new Set([
  'ai_configs', 'appointments', 'broadcast_campaigns', 'broadcast_contacts',
  'business_hours', 'channels', 'custom_apis', 'flow_sessions', 'flows',
  'followup_enrollment_messages', 'followup_enrollments', 'followup_sequences',
  'followup_steps', 'integrations', 'internal_groups', 'internal_messages',
  'labels', 'lead_stage_history', 'leads', 'messages', 'queues',
  'scheduled_messages', 'template_categories', 'templates', 'ticket_logs',
  'whatsapp_group_access',
])

// admin.js é do superadmin — cruza tenants de propósito (feature de monitoramento).
// webhooks.js é onde o tenant_id ainda está sendo resolvido a partir do payload
// externo (Evolution/Meta) — por definição não dá pra filtrar por um tenant que
// ainda não foi identificado.
const EXCLUDED_FILES = new Set(['admin.js', 'webhooks.js'])

const FILTER_METHODS = /\.(eq|in|match|neq|gt|gte|lt|lte|like|ilike|contains)\(/
const WRITE_METHODS = /\.(insert|upsert|update|delete)\(/

/**
 * Varre um arquivo de rota por `.from('<tabela>').select(...)` sem NENHUM
 * filtro (.eq/.in/.match/...) na mesma chamada — ou seja, uma leitura que
 * devolveria a tabela inteira de todos os tenants. Foi assim que o antigo
 * endpoint GET /api/diag vazou leads/mensagens de todos os tenants (ver
 * histórico do git — commit de remoção do endpoint).
 *
 * Não pega (de propósito, pra não virar um teste barulhento e ignorado):
 * updates/deletes/upserts, nem leituras filtradas por qualquer coluna (ex:
 * .eq('lead_id', ...) numa linha cujo tenant já foi validado em outra
 * query) — isso exigiria análise de fluxo de dados, fora do escopo de um
 * scan estático simples.
 */
function findUnscopedReads(src) {
  const findings = []
  const fromRe = /\.from\(['"](\w+)['"]\)/g
  let m
  while ((m = fromRe.exec(src))) {
    const table = m[1]
    if (!TENANT_SCOPED_TABLES.has(table)) continue

    const startIdx = m.index
    let chunk = src.slice(startIdx, startIdx + 800)
    const blankLineIdx = chunk.indexOf('\n\n')
    if (blankLineIdx !== -1) chunk = chunk.slice(0, blankLineIdx)

    const isSelect = chunk.includes('.select(')
    if (!isSelect || WRITE_METHODS.test(chunk) || FILTER_METHODS.test(chunk)) continue

    const line = src.slice(0, startIdx).split('\n').length
    findings.push({ table, line })
  }
  return findings
}

describe('isolamento de tenant — leituras sem filtro', () => {
  const files = fs.readdirSync(routesDir)
    .filter((f) => f.endsWith('.js') && !EXCLUDED_FILES.has(f))

  it('nenhuma rota lê uma tabela com tenant_id sem nenhum filtro (.eq/.in/.match/...)', () => {
    const allFindings = []
    for (const file of files) {
      const src = fs.readFileSync(path.join(routesDir, file), 'utf8')
      for (const f of findUnscopedReads(src)) {
        allFindings.push(`${file}:${f.line} — SELECT em '${f.table}' sem nenhum filtro`)
      }
    }
    expect(allFindings, allFindings.join('\n')).toEqual([])
  })
})
