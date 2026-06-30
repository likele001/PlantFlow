import type { FC } from 'react'
import type { NodeConfigProps } from '@/components/workflow/configs/types'
import TriggerWebhookConfig from '@/components/workflow/configs/TriggerWebhook'
import TriggerCronConfig from '@/components/workflow/configs/TriggerCron'
import LogicIfConfig from '@/components/workflow/configs/LogicIf'
import LogicSwitchConfig from '@/components/workflow/configs/LogicSwitch'
import LogicLoopConfig from '@/components/workflow/configs/LogicLoop'
import LogicParallelConfig from '@/components/workflow/configs/LogicParallel'
import LogicMergeConfig from '@/components/workflow/configs/LogicMerge'
import LogicSetConfig from '@/components/workflow/configs/LogicSet'
import LogicDelayConfig from '@/components/workflow/configs/LogicDelay'
import WorkflowSubConfig from '@/components/workflow/configs/WorkflowSub'
import AiChatConfig from '@/components/workflow/configs/AiChat'
import AiKnowledgeConfig from '@/components/workflow/configs/AiKnowledge'
import AiAgentConfig from '@/components/workflow/configs/AiAgent'
import HttpRequestConfig from '@/components/workflow/configs/HttpRequest'
import ChannelSendConfig from '@/components/workflow/configs/ChannelSend'
import CodeConfig from '@/components/workflow/configs/Code'
import LogicTryConfig from '@/components/workflow/configs/LogicTry'
import JsonParseConfig from '@/components/workflow/configs/JsonParse'
import SplitConfig from '@/components/workflow/configs/Split'
import JoinConfig from '@/components/workflow/configs/Join'
import DateConfig from '@/components/workflow/configs/Date'
import GenericConfig from '@/components/workflow/configs/GenericConfig'

const registry = new Map<string, FC<NodeConfigProps>>()

registry.set('trigger.webhook', TriggerWebhookConfig)
registry.set('trigger.cron', TriggerCronConfig)
registry.set('logic.if', LogicIfConfig)
registry.set('logic.switch', LogicSwitchConfig)
registry.set('logic.loop', LogicLoopConfig)
registry.set('logic.parallel', LogicParallelConfig)
registry.set('logic.merge', LogicMergeConfig)
registry.set('logic.set', LogicSetConfig)
registry.set('logic.delay', LogicDelayConfig)
registry.set('workflow.sub', WorkflowSubConfig)
registry.set('ai.chat', AiChatConfig)
registry.set('ai.knowledge', AiKnowledgeConfig)
registry.set('ai.agent', AiAgentConfig)
registry.set('http.request', HttpRequestConfig)
registry.set('channel.send', ChannelSendConfig)
registry.set('logic.code', CodeConfig)
registry.set('logic.try', LogicTryConfig)
registry.set('logic.json.parse', JsonParseConfig)
registry.set('logic.split', SplitConfig)
registry.set('logic.join', JoinConfig)
registry.set('logic.date', DateConfig)

export function getNodeConfigComponent(type: string): FC<NodeConfigProps> {
  return registry.get(type) ?? GenericConfig
}

export function registerNodeConfig(type: string, component: FC<NodeConfigProps>): void {
  registry.set(type, component)
}
