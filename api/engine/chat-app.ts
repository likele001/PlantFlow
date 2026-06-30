import { db } from '../store.js'
import { runWorkflow } from './executor.js'

const MAX_HISTORY = 20

export async function runChatAppMessage(input: {
  tenantId: string
  appId?: string
  workflowId: string
  message: string
  userId?: string
  sessionId?: string
}): Promise<{ reply: string; executionId: string; chatSessionId?: string }> {
  let chatSessionId: string | undefined
  let chatHistory: { role: string; content: string }[] = []

  if (input.appId) {
    const session = await db.getOrCreateChatSession({
      tenantId: input.tenantId,
      appId: input.appId,
      externalUser: input.userId ?? input.sessionId,
    })
    chatSessionId = session.id
    await db.insertChatMessage({ sessionId: session.id, role: 'user', content: input.message })

    const msgs = await db.listChatMessages(session.id)
    chatHistory = msgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content }))
  }

  const result = await runWorkflow({
    tenantId: input.tenantId,
    workflowId: input.workflowId,
    triggerType: 'trigger.chat',
    triggerData: {
      type: 'chat',
      content: input.message,
      sessionId: input.sessionId ?? crypto.randomUUID(),
      userId: input.userId ?? 'anonymous',
      channel: 'chat',
      chatHistory,
    },
    userId: input.userId,
  })

  const steps = await db.listExecutionSteps(result.executionId)
  let reply = ''

  for (let i = steps.length - 1; i >= 0; i--) {
    const out = steps[i].output as Record<string, unknown> | null
    if (!out) continue
    if (typeof out.text === 'string' && out.text) {
      reply = out.text
      break
    }
  }

  if (!reply) {
    const exec = await db.findExecution(input.tenantId, result.executionId)
    const trigger = exec?.triggerData as Record<string, unknown> | undefined
    if (result.status === 'failed') {
      reply = String(exec?.error ?? '工作流执行失败')
    } else {
      reply = String(trigger?.content ?? '（无回复内容）')
    }
  }

  if (chatSessionId) {
    await db.insertChatMessage({
      sessionId: chatSessionId,
      role: 'assistant',
      content: reply,
      executionId: result.executionId,
    })
  }

  return { reply, executionId: result.executionId, chatSessionId }
}
