/**
 * local server entry file, for local development
 */
import app, { initDb } from './app.js'
import { startExecutionWorker } from './engine/queue.js'
import { startScheduler } from './engine/scheduler.js'

/**
 * start server with port
 */
const PORT = process.env.PORT || 5000

async function main() {
  await initDb()
  startExecutionWorker()
  startScheduler()

  const server = app.listen(PORT, () => {
    console.log(`Server ready on port ${PORT}`)
  })

  const shutdown = (sig: string) => {
    console.log(`${sig} signal received`)
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('Fatal startup error', err)
  process.exit(1)
})
