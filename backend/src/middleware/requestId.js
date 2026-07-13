import { randomUUID } from 'node:crypto'

// Middleware simples de correlação: gera um ID único por requisição e o expõe em
// req.requestId + no header de resposta X-Request-Id. Isso permite, dado um ID
// devolvido ao cliente (ex.: num erro 500 mostrado na tela), localizar manualmente
// as linhas relevantes nos logs do PM2 caso os console.log daquele trecho já
// incluam o ID (hoje NENHUM console.log existente foi migrado para incluir
// req.requestId — isso é trabalho futuro fora do escopo desta mudança, feito sob
// demanda por handler conforme necessidade). Reaproveita o ID vindo de um proxy
// reverso (nginx/load balancer) via X-Request-Id se presente, em vez de sempre
// gerar um novo — útil se o nginx já anota esse header.
export function requestId(req, res, next) {
  const incoming = req.headers['x-request-id']
  const id = (typeof incoming === 'string' && incoming.trim()) ? incoming.trim() : randomUUID()
  req.requestId = id
  res.setHeader('X-Request-Id', id)
  next()
}
