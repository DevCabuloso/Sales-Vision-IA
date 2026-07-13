// Normalização de telefone usada em vários pontos do backend (leads, contatos,
// broadcast, chat, orchestrator) — extraída para um único lugar em vez de
// repetir `.replace(/\D/g, '')` em cada arquivo.
export function normalizePhone(raw) {
  return (raw || '').replace(/\D/g, '')
}
