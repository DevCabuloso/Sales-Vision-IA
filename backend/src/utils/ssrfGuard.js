import dns from 'node:dns/promises'
import net from 'node:net'

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
 * Extrai o IPv4 embutido de um endereço IPv6 "IPv4-mapped"/"IPv4-compatible"
 * (ex.: "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:169.254.169.254"),
 * nas formas decimal-pontuada OU hex normalizada (é assim que `new URL(...).hostname`
 * devolve o host — normaliza pra hex antes da gente ver). Sem isso, um atacante
 * contorna PRIVATE_RANGES (que só reconhece IPv4 puro) embrulhando o IP privado
 * num literal IPv6. Retorna a string IPv4 equivalente, ou null se `addr` não for
 * um mapeamento IPv4-em-IPv6.
 */
function ipv4FromMappedIPv6(addr) {
  const a = addr.toLowerCase()

  let m = a.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (m) return m[1]
  m = a.match(/^(?:0{1,4}:){5}ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (m) return m[1]

  let hextets
  if (a.includes('::')) {
    const idx = a.indexOf('::')
    const head = a.slice(0, idx)
    const tail = a.slice(idx + 2)
    const headParts = head ? head.split(':').filter(Boolean) : []
    const tailParts = tail ? tail.split(':').filter(Boolean) : []
    const missing = 8 - headParts.length - tailParts.length
    if (missing < 0) return null
    hextets = [...headParts, ...Array(missing).fill('0'), ...tailParts]
  } else {
    hextets = a.split(':')
  }
  if (hextets.length !== 8) return null

  const isMapped = hextets.slice(0, 5).every((h) => /^0{1,4}$/.test(h)) && /^0{0,3}ffff$/.test(hextets[5])
  if (!isMapped) return null
  const hi = parseInt(hextets[6], 16)
  const lo = parseInt(hextets[7], 16)
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join('.')
}

function isPrivateAddress(rawAddr) {
  const addr = rawAddr.replace(/^\[|\]$/g, '')
  if (PRIVATE_RANGES.some((re) => re.test(addr))) return true
  if (net.isIP(addr) === 6) {
    const mapped = ipv4FromMappedIPv6(addr)
    if (mapped && PRIVATE_RANGES.some((re) => re.test(mapped))) return true
  }
  return false
}

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
  if (isPrivateAddress(hostname)) {
    throw new Error('URL aponta para rede privada ou loopback — não permitido.')
  }

  try {
    const { address } = await dns.lookup(hostname.replace(/^\[|\]$/g, ''))
    if (isPrivateAddress(address)) {
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
