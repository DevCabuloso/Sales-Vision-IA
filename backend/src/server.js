import { createApp } from './app.js'
import { config } from './config/index.js'
import { startScheduler } from './services/scheduler.js'
import { assertSingleInstance } from './utils/assertSingleInstance.js'

assertSingleInstance()

// Rede de segurança para erros fora do ciclo request/response do Express
// (ex.: código de inicialização, timers soltos futuros). Loga com stack
// antes de sair, para o PM2 reiniciar o processo com o motivo visível no
// log em vez de um crash silencioso sem contexto.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason)
  process.exit(1)
})
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err)
  process.exit(1)
})

const app = createApp()

app.listen(config.port, config.host, () => {
  console.log(`[SDR IA] backend rodando em http://${config.host}:${config.port}`)
  console.log(`[SDR IA] ambiente: ${config.env}`)
})

startScheduler()

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
