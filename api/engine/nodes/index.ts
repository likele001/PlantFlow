import { nodeRegistry } from './registry.js'
import { triggerManual, triggerWebhook, triggerCron, triggerWecom, triggerFeishu, triggerTaobao, triggerChat } from './triggers.js'
import { logicIf, logicSwitch, logicLoop, logicSet, logicDelay, logicParallel, logicMerge, workflowSub } from './logic.js'
import { aiChat, aiKnowledge, aiAgent, createEmbedding } from './ai.js'
import { httpRequest, channelSend } from './integration.js'
import { logicCode } from './code.js'
import { logicTry, logicCatch } from './trycatch.js'
import { logicJsonParse, logicSplit, logicJoin, logicDate } from './data.js'

nodeRegistry.register(triggerManual)
nodeRegistry.register(triggerWebhook)
nodeRegistry.register(triggerCron)
nodeRegistry.register(triggerWecom)
nodeRegistry.register(triggerFeishu)
nodeRegistry.register(triggerTaobao)
nodeRegistry.register(triggerChat)
nodeRegistry.register(logicIf)
nodeRegistry.register(logicSwitch)
nodeRegistry.register(logicLoop)
nodeRegistry.register(logicSet)
nodeRegistry.register(logicDelay)
nodeRegistry.register(logicParallel)
nodeRegistry.register(logicMerge)
nodeRegistry.register(workflowSub)
nodeRegistry.register(aiChat)
nodeRegistry.register(aiKnowledge)
nodeRegistry.register(aiAgent)
nodeRegistry.register(httpRequest)
nodeRegistry.register(channelSend)
nodeRegistry.register(logicCode)
nodeRegistry.register(logicTry)
nodeRegistry.register(logicCatch)
nodeRegistry.register(logicJsonParse)
nodeRegistry.register(logicSplit)
nodeRegistry.register(logicJoin)
nodeRegistry.register(logicDate)

export { nodeRegistry, createEmbedding }
export { searchKnowledge } from './ai.js'
