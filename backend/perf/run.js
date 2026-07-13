// Testes de carga/estresse (autocannon) para os 3 endpoints com rate limit
// definidos em src/app.js: webhookLimiter (300/min), authLimiter (20/15min,
// usado em /api/billing/trial-signup e /api/billing/orders) e apiLimiter
// (600/min, geral em /api).
//
// Nenhum desses cenários precisa de um Supabase real: cada um foi escolhido
// porque a requisição é rejeitada (400/403/401) por uma checagem síncrona
// (validação Zod, comparação de secret de webhook, ou jwt.verify) que roda
// ANTES de qualquer chamada ao Supabase — ver src/routes/webhooks.js (rota
// POST /evolution, checagem do header apikey/Authorization antes do
// resolveEvolutionTenant), src/routes/billing.js (signupSchema.safeParse
// antes de qualquer supabase.from(...)) e src/middleware/auth.js (jwt.verify
// lança antes de qualquer select em `users`).
//
// Por isso o objetivo aqui é: (1) throughput/latência bruta do Express nesse
// caminho "fail fast", e (2) confirmar que o rate limiter realmente devolve
// 429 depois de cruzar o teto configurado — sem nunca tocar em um Supabase de
// verdade.
//
// Rodar: npm run test:perf --prefix backend

import http from 'node:http'
import autocannon from 'autocannon'

// IMPORTANTE: definimos valores fictícios ANTES de importar a app (e antes do
// `dotenv/config` rodar dentro de src/config/index.js). dotenv nunca sobrescreve
// uma env var já definida em process.env, então isso garante que as credenciais
// reais do backend/.env nunca são carregadas neste processo — mesmo que algum
// cenário acabasse batendo no Supabase por engano, não haveria como ele
// alcançar um projeto real.
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'http://127.0.0.1:9/perf-dummy-nao-usar'
process.env.SUPABASE_SERVICE_KEY = 'perf-dummy-service-key'
process.env.JWT_SECRET = 'perf-dummy-jwt-secret'
process.env.ENCRYPTION_KEY = 'perf-dummy-encryption-key-32-chars-xx'
process.env.EVOLUTION_WEBHOOK_SECRET = 'perf-dummy-evolution-secret'
process.env.META_APP_SECRET = ''

const { createApp } = await import('../src/app.js')

function startServer() {
  return new Promise((resolve, reject) => {
    const app = createApp()
    const server = http.createServer(app)
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function runAutocannon(opts) {
  // As rotas alvo logam console.warn/console.error a cada rejeição (secret
  // inválido, etc.) — esperado em uso normal (uma rejeição isolada), mas em
  // um teste de carga isso spamma centenas de linhas irrelevantes. Silencia
  // só durante a rajada; os prints do próprio script (fora deste escopo)
  // continuam normais.
  const realWarn = console.warn
  const realError = console.error
  console.warn = () => {}
  console.error = () => {}
  return new Promise((resolve, reject) => {
    autocannon(opts, (err, result) => {
      console.warn = realWarn
      console.error = realError
      if (err) return reject(err)
      resolve(result)
    })
  })
}

function fmtMs(n) {
  return `${n.toFixed(2)}ms`
}

function fmtKB(bytesPerSec) {
  return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
}

async function runScenario({ name, description, limiterMax, limiterWindow, opts }) {
  console.log(`\n=== ${name} ===`)
  console.log(description)
  console.log(`Limiter esperado: ${limiterMax} req / ${limiterWindow}`)
  console.log(`Enviando ${opts.amount} requisições (${opts.connections} conexões) para ${opts.url} ...`)

  const result = await runAutocannon({ timeout: 10, ...opts })

  const statusCounts = Object.fromEntries(
    Object.entries(result.statusCodeStats || {}).map(([code, v]) => [code, v.count])
  )
  const totalResponses = Object.values(statusCounts).reduce((s, n) => s + n, 0)
  const tripped = (statusCounts['429'] || 0) > 0
  const crossedThreshold = totalResponses > limiterMax
  // A checagem que importa: se enviamos mais requisições que o teto do
  // limiter dentro da janela, ele TEM que ter devolvido 429 em algum ponto.
  const pass = !crossedThreshold ? false : tripped

  console.log(`Respostas recebidas: ${totalResponses} (esperado ~${opts.amount})`)
  console.log(`Status code breakdown: ${JSON.stringify(statusCounts)}`)
  console.log(`Erros de conexão/timeout: ${result.errors} / ${result.timeouts}`)
  console.log(`Latência   — p50: ${fmtMs(result.latency.p50)}  p99: ${fmtMs(result.latency.p99)}  média: ${fmtMs(result.latency.average)}`)
  console.log(`Throughput — média: ${result.requests.average.toFixed(1)} req/s, ${fmtKB(result.throughput.average)}`)
  console.log(`Rate limiter tripou (429 presente)? ${tripped ? 'SIM' : 'NÃO'}`)
  console.log(`Resultado: ${pass ? 'PASS' : 'FAIL'}`)

  return { name, pass, totalResponses, statusCounts, tripped }
}

async function main() {
  const server = await startServer()
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`

  console.log(`Servidor de teste (createApp) escutando em ${base}`)
  console.log('Nenhuma credencial real de Supabase é usada — todos os cenários abaixo são')
  console.log('rejeitados por validação/auth ANTES de qualquer chamada ao banco.')

  const scenarios = [
    {
      name: 'webhookLimiter — POST /webhooks/evolution (secret inválido)',
      description:
        'Header apikey deliberadamente errado. src/routes/webhooks.js rejeita com 403 ' +
        'antes de resolveEvolutionTenant/qualquer supabase.from(...).',
      limiterMax: 300,
      limiterWindow: '60s',
      opts: {
        url: `${base}/webhooks/evolution`,
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: 'secret-errado-de-proposito' },
        body: JSON.stringify({ event: 'messages.upsert' }),
        amount: 500,
        connections: 20,
      },
    },
    {
      name: 'authLimiter — POST /api/billing/trial-signup (payload inválido)',
      description:
        'Body vazio. src/routes/billing.js valida com signupSchema (Zod) e devolve 400 ' +
        'antes de qualquer supabase.from(...).',
      limiterMax: 20,
      limiterWindow: '15min',
      opts: {
        url: `${base}/api/billing/trial-signup`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        amount: 50,
        connections: 5,
      },
    },
    {
      name: 'apiLimiter — GET /api/leads (JWT inválido)',
      description:
        'Bearer token quebrado. src/middleware/auth.js chama jwt.verify(), que lança ' +
        'sincronamente antes de qualquer select na tabela users — 401 sem tocar no banco.',
      limiterMax: 600,
      limiterWindow: '60s',
      opts: {
        url: `${base}/api/leads`,
        method: 'GET',
        headers: { authorization: 'Bearer isto-nao-e-um-jwt-valido' },
        amount: 700,
        connections: 20,
      },
    },
  ]

  const results = []
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario))
  }

  await new Promise((resolve) => server.close(resolve))

  console.log('\n=== Resumo ===')
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} — ${r.name}`)
  }

  const failed = results.filter((r) => !r.pass)
  if (failed.length) {
    console.log(`\n${failed.length} cenário(s) falharam: o rate limiter não tripou 429 quando deveria.`)
    process.exitCode = 1
  } else {
    console.log('\nTodos os cenários passaram: throughput medido e rate limiters confirmados.')
    process.exitCode = 0
  }
}

main().catch((err) => {
  console.error('[perf] erro fatal:', err)
  process.exitCode = 1
})
