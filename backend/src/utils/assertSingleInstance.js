/**
 * services/orchestrator.js mantém caches em memória de processo (TTL de config
 * de tenant, dedupe de mensagens enviadas pela plataforma) que só funcionam
 * corretamente com uma única instância do processo. O PM2 injeta
 * NODE_APP_INSTANCE (0-indexed) em todo processo gerenciado quando
 * `instances` > 1 em ecosystem.config.cjs, mesmo em modo fork. Se alguém
 * escalar horizontalmente sem migrar esses caches pra um store compartilhado
 * (ex: Redis) primeiro, as instâncias divergem silenciosamente. Preferimos
 * falhar alto e cedo — a instância 0 sobe normalmente, as demais crasham no
 * boot (PM2 mostra o processo em crash loop, o que é bem mais visível do que
 * bugs de cache sutis em produção).
 */
export function assertSingleInstance(env = process.env) {
  const instance = env.NODE_APP_INSTANCE
  if (instance !== undefined && instance !== '0') {
    throw new Error(
      `[server] NODE_APP_INSTANCE=${instance} — este processo não suporta múltiplas instâncias PM2 ` +
      `(services/orchestrator.js usa caches em memória por processo). Volte "instances" para 1 em ` +
      `ecosystem.config.cjs, ou migre os caches para um store compartilhado antes de escalar horizontalmente.`
    )
  }
}
