import { useState } from 'react'
import { Field, type NodeConfigProps } from './types'

export default function LogicSwitchConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  const cases = (node.config.cases ?? []) as { match: string; id: string }[]

  return (
    <>
      <Field label="路由值" value={String(node.config.value ?? '')} onChange={(v) => onChange('value', v)} onPickVar={() => onFocusField('value')} />
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>分支规则</span>
          <button type="button" className="text-blue-600" onClick={() => onChange('cases', [...cases, { match: '新分支', id: `case_${cases.length}` }])}>
            + 添加
          </button>
        </div>
        {cases.map((c, i) => (
          <div key={c.id} className="flex gap-2">
            <input
              value={c.match}
              onChange={(e) => {
                const next = [...cases]
                next[i] = { ...c, match: e.target.value }
                onChange('cases', next)
              }}
              className="h-9 flex-1 rounded-lg border px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="匹配文本"
            />
            <button type="button" className="text-xs text-red-500" onClick={() => onChange('cases', cases.filter((_, j) => j !== i))}>
              删
            </button>
          </div>
        ))}
      </div>
      <div className="text-xs text-zinc-500">从对应出口连线；未匹配走「默认」</div>
    </>
  )
}
