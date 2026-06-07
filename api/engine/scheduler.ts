import cron from 'node-cron'
import { db } from '../store.js'

const tasks = new Map<string, cron.ScheduledTask>()

function taskKey(tenantId: string, workflowId: string, nodeId: string) {
  return `${tenantId}:${workflowId}:${nodeId}`
}

export async function reloadCronSchedules() {
  for (const t of tasks.values()) t.stop()
  tasks.clear()

  const triggers = await db.listAllCronTriggers()
  for (const tr of triggers) {
    const expr = String(tr.config?.cron ?? '')
    if (!expr || !cron.validate(expr)) continue
    const tz = String(tr.config?.timezone ?? 'Asia/Shanghai')
    const key = taskKey(tr.tenantId, tr.workflowId, tr.nodeId)
    try {
      const task = cron.schedule(
        expr,
        () => {
          void db.enqueueExecutionJob({
            tenantId: tr.tenantId,
            workflowId: tr.workflowId,
            triggerType: 'trigger.cron',
            triggerData: {
              type: 'cron',
              cron: expr,
              firedAt: new Date().toISOString(),
            },
          })
        },
        { timezone: tz },
      )
      tasks.set(key, task)
    } catch (e) {
      console.error('[cron] schedule failed', key, e)
    }
  }
  console.log(`[cron] loaded ${tasks.size} schedules`)
}

export function startScheduler() {
  void reloadCronSchedules()
  setInterval(() => void reloadCronSchedules(), 60_000)
}
