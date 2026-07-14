import crypto from 'node:crypto'

// Compara duas strings em tempo constante SEM depender de terem o mesmo
// tamanho (diferente de crypto.timingSafeEqual puro, que lança se os buffers
// tiverem tamanhos diferentes). Faz hash de cada lado para um digest de
// tamanho fixo (32 bytes) antes de comparar — assim nem o timing do próprio
// check de tamanho vaza informação sobre o quão perto o valor informado está
// do secret esperado.
export function timingSafeStringEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a ?? '')).digest()
  const hashB = crypto.createHash('sha256').update(String(b ?? '')).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}
