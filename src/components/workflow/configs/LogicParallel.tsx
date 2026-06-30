import type { NodeConfigProps } from './types'

export default function LogicParallelConfig(_props: NodeConfigProps) {
  return (
    <div className="rounded-xl bg-sky-500/10 p-3 text-xs text-sky-900 dark:text-sky-100">
      从「支路1」「支路2」分别连线，末端接「汇合」节点。超过 2 路可复制多个并行节点。
    </div>
  )
}
