import dns from 'node:dns/promises'

// Bloqueia hosts/IPs privados, loopback e link-local (proteção contra SSRF).
const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fd/,
  /^fe80:/i,
]

/**
 * Lança se a URL apontar (por hostname literal OU resolução DNS) pra rede
 * privada/loopback/link-local. Não pega redirects — ver safeFetch() abaixo
 * pra isso.
 */
export async function assertPublicUrl(rawUrl) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Só URLs http/https são permitidas.')
  }

  const hostname = url.hostname
  if (hostname === 'localhost') {
    throw new Error('URL aponta para rede privada ou loopback — não permitido.')
  }
  if (PRIVATE_RANGES.some((re) => re.test(hostname))) {
    throw new Error('URL aponta para rede privada ou loopback — não permitido.')
  }

  try {
    const { address } = await dns.lookup(hostname)
    if (PRIVATE_RANGES.some((re) => re.test(address))) {
      throw new Error('URL resolve para endereço de rede privada — não permitido.')
    }
  } catch (e) {
    if (e.message.includes('não permitido')) throw e
    // Falha de DNS: deixa o fetch de verdade falhar naturalmente.
  }
}

const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * fetch() que valida CADA hop de redirect contra rede privada/loopback antes
 * de segui-lo. fetch() nativo segue redirects automaticamente por padrão —
 * um host externo (validado, público) controlado por um atacante pode
 * responder com um 3xx apontando pra um IP interno, contornando qualquer
 * checagem feita só na URL original. Por isso usamos `redirect: 'manual'`
 * e revalidamos a cada hop em vez de confiar no fetch pra seguir sozinho.
 */
export async function safeFetch(rawUrl, options = {}, redirectsLeft = MAX_REDIRECTS) {
  await assertPublicUrl(rawUrl)
  const resp = await fetch(rawUrl, { ...options, redirect: 'manual' })

  if (REDIRECT_STATUSES.has(resp.status)) {
    if (redirectsLeft <= 0) throw new Error('Muitos redirects — abortado.')
    const location = resp.headers.get('location')
    if (!location) return resp
    const nextUrl = new URL(location, rawUrl).toString()
    // 303 sempre vira GET sem corpo; 301/302/307/308 preservam método e corpo.
    const nextOptions = resp.status === 303 ? { ...options, method: 'GET', body: undefined } : options
    return safeFetch(nextUrl, nextOptions, redirectsLeft - 1)
  }

  return resp
}
