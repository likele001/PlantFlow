import type { NodeConfigProps } from './types'

export default function LogicTryConfig(_props: NodeConfigProps) {
  return (
    <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100 space-y-1">
      <div className="font-semibold">错误捕获节点</div>
      <div>从「分支」出口连线到正常执行的节点</div>
      <div>从「catch」出口连线到错误处理的节点</div>
      <div className="text-amber-700 dark:text-amber-300">捕获的错误可通过 <code>{'{{vars.__try_error}}'}</code> 获取</div>
    </div>
  )
}
