import { db } from '../store.js'
import { runWorkflow } from './executor.js'
import { redisPopJob, redisPushJob } from '../redis.js'

const POLL_MS = 400
const MAX_CONCURRENT = Math.min(Math.max(Number(process.env.WORKER_CONCURRENCY ?? 4), 1), 32)
let running = 0
let timer: ReturnType<typeof setInterval> | null = null

async function processJob(jobId: string): Promise<boolean> {
  const job = await db.claimExecutionJobById(jobId)
  if (!job) return false

  running++
  try {
    const result = await runWorkflow({
      tenantId: job.tenantId,
      workflowId: job.workflowId,
      triggerType: job.triggerType,
      triggerData: (job.triggerData ?? {}) as Record<string, unknown>,
      userId: job.userId ?? undefined,
    })
    await db.finishExecutionJob(job.id, 'done', result.executionId, null)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.finishExecutionJob(job.id, 'failed', null, msg)
  } finally {
    running--
  }
  return true
}

async function processOne(): Promise<boolean> {
  if (running >= MAX_CONCURRENT) return false

  const redisJobId = await redisPopJob()
  if (redisJobId) {
    return processJob(redisJobId)
  }

  const job = await db.claimExecutionJob()
  if (!job) return false

  running++
  try {
    const result = await runWorkflow({
      tenantId: job.tenantId,
      workflowId: job.workflowId,
      triggerType: job.triggerType,
      triggerData: (job.triggerData ?? {}) as Record<string, unknown>,
      userId: job.userId ?? undefined,
    })
    await db.finishExecutionJob(job.id, 'done', result.executionId, null)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.finishExecutionJob(job.id, 'failed', null, msg)
  } finally {
    running--
  }
  return true
}

async function tick() {
  try {
    let n = 0
    while (n < MAX_CONCURRENT && (await processOne())) n++
  } catch (e) {
    console.error('[worker] tick error', e)
  }
}

export function startExecutionWorker() {
  if (timer) return
  timer = setInterval(() => void tick(), POLL_MS)
  console.log(`[worker] execution queue started (concurrency=${MAX_CONCURRENT})`)
}

export function stopExecutionWorker() {
  if (timer) clearInterval(timer)
  timer = null
}

export async function notifyJobEnqueued(jobId: string): Promise<void> {
  await redisPushJob(jobId)
}
