/**
 * This is a API server
 */

import fs from 'node:fs'
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import tenantRoutes from './routes/tenants.js'
import workflowRoutes from './routes/workflows.js'
import conversationRoutes from './routes/conversations.js'
import channelRoutes from './routes/channels.js'
import aiRoutes from './routes/ai.js'
import executionRoutes from './routes/executions.js'
import knowledgeRoutes from './routes/knowledge.js'
import connectorRoutes from './routes/connectors.js'
import dashboardRoutes from './routes/dashboard.js'
import adminRoutes from './routes/admin.js'
import hooksRoutes from './routes/hooks.js'
import appsRoutes from './routes/apps.js'
import chatApiRoutes from './routes/chat-api.js'
import healthRoutes from './routes/health.js'
import engineRoutes from './routes/engine.js'
import { requireAuth } from './middleware/auth.js'
import { initDb } from './db.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/hooks', hooksRoutes)
app.use('/api/v1/chat', chatApiRoutes)
app.use('/api/apps', requireAuth, appsRoutes)
app.use('/api/tenants', requireAuth, tenantRoutes)
app.use('/api/workflows', requireAuth, workflowRoutes)
app.use('/api/conversations', requireAuth, conversationRoutes)
app.use('/api/channels', channelRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/executions', requireAuth, executionRoutes)
app.use('/api/knowledge', requireAuth, knowledgeRoutes)
app.use('/api/connectors', requireAuth, connectorRoutes)
app.use('/api/dashboard', requireAuth, dashboardRoutes)
app.use('/api/admin', requireAuth, adminRoutes)
app.use('/api/engine', requireAuth, engineRoutes)
app.use('/api/health', healthRoutes)

/**
 * 前端静态资源（Docker 单容器 / 无 Nginx 时也能打开页面）
 * 编译后 dist 与 dist-api 同级：../dist
 */
const distDir = path.resolve(__dirname, '../dist')
const indexHtml = path.join(distDir, 'index.html')

if (fs.existsSync(indexHtml)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    res.sendFile(indexHtml, (err) => {
      if (err) next(err)
    })
  })
}

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] unhandled error', error)
  if (req.path.startsWith('/api')) {
    res.status(500).json({ success: false, error: 'Server internal error' })
    return
  }
  res.status(500).send('Server internal error')
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ success: false, error: 'API not found' })
    return
  }
  res.status(404).send('Not found')
})

export { initDb }
export default app
