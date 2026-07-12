import { createApp } from './app.js'
import { config } from './config/index.js'
import { startScheduler } from './services/scheduler.js'
import { assertSingleInstance } from './utils/assertSingleInstance.js'

assertSingleInstance()

const app = createApp()

app.listen(config.port, () => {
  console.log(`[SDR IA] backend rodando em http://localhost:${config.port}`)
  console.log(`[SDR IA] ambiente: ${config.env}`)
})

startScheduler()

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
