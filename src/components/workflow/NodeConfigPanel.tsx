import { useState } from 'react'
import type { WorkflowNode } from '@/lib/workflow-nodes'
import { Braces, Copy, Trash2 } from 'lucide-react'
import VariablePicker from './VariablePicker'

type Kbase = { id: string; name: string }
type Connector = { id: string; name: string }
type Wf = { id: string; name: string }

export default function NodeConfigPanel(props: {
  node: WorkflowNode | null
  nodes: WorkflowNode[]
  kbases: Kbase[]
  connectors?: Connector[]
  workflows?: Wf[]
  tenantId?: string
  onChange: (key: string, value: unknown) => void
  onDuplicate?: () => void
  onDelete?: () => void
}) {
  const { node, nodes, kbases, connectors = [], workflows = [], tenantId, onChange, onDuplicate, onDelete } = props
  const [varTarget, setVarTarget] = useState<string | null>(null)

  if (!node) {
    return (
      <div className="mt-4 space-y-3 text-sm text-zinc-500">
        <p>点击画布中的节点进行配置</p>
        <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-xs leading-relaxed dark:border-zinc-700">
          <div className="font-semibold text-zinc-700 dark:text-zinc-200">快速上手</div>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>从左侧<strong>拖拽</strong>或点击添加节点</li>
            <li>从节点右侧圆点<strong>拖到</strong>下一节点连线</li>
            <li>条件分支：绿=是，红=否</li>
            <li>保存 → 发布 → 运行</li>
          </ol>
        </div>
      </div>
    )
  }

  const webhookUrl =
    node.type === 'trigger.webhook' && tenantId
      ? `${window.location.origin}/api/hooks/${tenantId}/${node.config.path ?? ''}`
      : ''

  function insertVar(expr: string) {
    if (!varTarget) return
    onChange(varTarget, String(node.config[varTarget] ?? '') + expr)
    setVarTarget(null)
  }

  const cases = (node.config.cases ?? []) as { match: string; id: string }[]

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs text-zinc-400">{node.type}</div>
        <div className="flex gap-1">
          {onDuplicate ? (
            <button type="button" onClick={onDuplicate} className="rounded-lg border p-1.5 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900" title="复制节点">
              <Copy className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" onClick={onDelete} className="rounded-lg border p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="删除节点">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <Field label="节点名称" value={node.label} onChange={(v) => onChange('__label__', v)} />

      {node.type === 'trigger.webhook' ? (
        <>
          <Field label="路径标识" value={String(node.config.path ?? '')} onChange={(v) => onChange('path', v)} />
          {webhookUrl ? (
            <div className="rounded-xl bg-zinc-50 p-3 text-xs break-all text-zinc-600 dark:bg-zinc-900">
              <div className="font-semibold">Webhook 地址</div>
              <div className="mt-1">{webhookUrl}</div>
            </div>
          ) : null}
        </>
      ) : null}

      {node.type === 'trigger.cron' ? (
        <>
          <Field label="Cron 表达式" value={String(node.config.cron ?? '')} onChange={(v) => onChange('cron', v)} onPickVar={() => setVarTarget('cron')} />
          <Field label="时区" value={String(node.config.timezone ?? 'Asia/Shanghai')} onChange={(v) => onChange('timezone', v)} />
          <div className="text-xs text-zinc-500">示例：0 9 * * * = 每天 9:00</div>
        </>
      ) : null}

      {node.type === 'logic.switch' ? (
        <>
          <Field label="路由值" value={String(node.config.value ?? '')} onChange={(v) => onChange('value', v)} onPickVar={() => setVarTarget('value')} />
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>分支规则</span>
              <button
                type="button"
                className="text-blue-600"
                onClick={() =>
                  onChange('cases', [...cases, { match: '新分支', id: `case_${cases.length}` }])
                }
              >
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
                <button
                  type="button"
                  className="text-xs text-red-500"
                  onClick={() => onChange('cases', cases.filter((_, j) => j !== i))}
                >
                  删
                </button>
              </div>
            ))}
          </div>
          <div className="text-xs text-zinc-500">从对应出口连线；未匹配走「默认」</div>
        </>
      ) : null}

      {node.type === 'logic.loop' ? (
        <>
          <Field label="列表数据" value={String(node.config.items ?? '[]')} onChange={(v) => onChange('items', v)} multiline onPickVar={() => setVarTarget('items')} />
          <Field label="变量名" value={String(node.config.itemVar ?? 'item')} onChange={(v) => onChange('itemVar', v)} />
          <Field label="最大次数" value={String(node.config.maxIterations ?? 20)} onChange={(v) => onChange('maxIterations', Number(v) || 20)} />
        </>
      ) : null}

      {node.type === 'logic.if' ? (
        <>
          <Field label="左值" value={String(node.config.left ?? '')} onChange={(v) => onChange('left', v)} onPickVar={() => setVarTarget('left')} />
          <label className="block text-xs text-zinc-500">
            运算符
            <select
              value={String(node.config.operator ?? 'contains')}
              onChange={(e) => onChange('operator', e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="contains">包含</option>
              <option value="not_contains">不包含</option>
              <option value="equals">等于</option>
              <option value="not_equals">不等于</option>
              <option value="not_empty">非空</option>
              <option value="empty">为空</option>
              <option value="gt">大于</option>
              <option value="lt">小于</option>
            </select>
          </label>
          <Field label="右值" value={String(node.config.right ?? '')} onChange={(v) => onChange('right', v)} onPickVar={() => setVarTarget('right')} />
        </>
      ) : null}

      {node.type === 'logic.parallel' ? (
        <div className="rounded-xl bg-sky-500/10 p-3 text-xs text-sky-900 dark:text-sky-100">
          从「支路1」「支路2」分别连线，末端接「汇合」节点。超过 2 路可复制多个并行节点。
        </div>
      ) : null}

      {node.type === 'logic.merge' ? (
        <label className="block text-xs text-zinc-500">
          汇合模式
          <select
            value={String(node.config.mode ?? 'all')}
            onChange={(e) => onChange('mode', e.target.value)}
            className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <option value="all">等待全部分支</option>
            <option value="any">任一分支完成</option>
          </select>
        </label>
      ) : null}

      {node.type === 'workflow.sub' ? (
        <>
          <label className="block text-xs text-zinc-500">
            目标工作流
            <select
              value={String(node.config.targetWorkflowId ?? '')}
              onChange={(e) => onChange('targetWorkflowId', e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="">请选择</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {node.type === 'ai.chat' || node.type === 'ai.agent' ? (
        <>
          <Field label="系统提示" value={String(node.config.systemPrompt ?? '')} onChange={(v) => onChange('systemPrompt', v)} multiline onPickVar={() => setVarTarget('systemPrompt')} />
          <Field label="用户提示" value={String(node.config.userPrompt ?? '')} onChange={(v) => onChange('userPrompt', v)} multiline onPickVar={() => setVarTarget('userPrompt')} />
        </>
      ) : null}

      {node.type === 'ai.agent' ? (
        <>
          <Field label="最大步数" value={String(node.config.maxSteps ?? 4)} onChange={(v) => onChange('maxSteps', Number(v) || 4)} />
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input type="checkbox" checked={node.config.enableHttp !== false} onChange={(e) => onChange('enableHttp', e.target.checked)} />
            启用 HTTP 工具
          </label>
        </>
      ) : null}

      {(node.type === 'ai.knowledge' || node.type === 'ai.agent') ? (
        <label className="block text-xs text-zinc-500">
          知识库
          <select
            value={String(node.config.kbaseId ?? '')}
            onChange={(e) => onChange('kbaseId', e.target.value)}
            className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <option value="">请选择</option>
            {kbases.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      {node.type === 'ai.knowledge' ? (
        <>
          <Field label="检索词" value={String(node.config.query ?? '')} onChange={(v) => onChange('query', v)} onPickVar={() => setVarTarget('query')} />
          <Field label="Top K" value={String(node.config.topK ?? 5)} onChange={(v) => onChange('topK', Number(v) || 5)} />
        </>
      ) : null}

      {node.type === 'http.request' ? (
        <>
          <label className="block text-xs text-zinc-500">
            连接器
            <select
              value={String(node.config.connectorId ?? '')}
              onChange={(e) => onChange('connectorId', e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="">不使用</option>
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <Field label="URL" value={String(node.config.url ?? '')} onChange={(v) => onChange('url', v)} onPickVar={() => setVarTarget('url')} />
          <Field label="Method" value={String(node.config.method ?? 'GET')} onChange={(v) => onChange('method', v)} />
          <Field label="Body" value={String(node.config.body ?? '')} onChange={(v) => onChange('body', v)} multiline onPickVar={() => setVarTarget('body')} />
        </>
      ) : null}

      {node.type === 'channel.send' ? (
        <>
          <label className="block text-xs text-zinc-500">
            渠道
            <select
              value={String(node.config.channel ?? 'wecom')}
              onChange={(e) => onChange('channel', e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="wecom">企业微信</option>
              <option value="feishu">飞书</option>
            </select>
          </label>
          {String(node.config.channel ?? 'wecom') === 'feishu' ? (
            <Field
              label="飞书群 chat_id"
              value={String(node.config.receiveId ?? '')}
              onChange={(v) => onChange('receiveId', v)}
              placeholder="oc_xxxxxxxx（渠道页测试发送时可获取）"
            />
          ) : (
            <Field
              label="接收人 UserId（可选）"
              value={String(node.config.toUser ?? '')}
              onChange={(v) => onChange('toUser', v)}
              placeholder="留空则回复当前会话"
            />
          )}
          <Field label="内容" value={String(node.config.content ?? '')} onChange={(v) => onChange('content', v)} multiline onPickVar={() => setVarTarget('content')} />
        </>
      ) : null}

      {node.type === 'logic.delay' ? (
        <Field label="延迟(ms)" value={String(node.config.ms ?? 300)} onChange={(v) => onChange('ms', Number(v) || 0)} />
      ) : null}

      <div className="space-y-2 border-t pt-3 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          <Braces className="h-4 w-4" />
          插入变量
          {varTarget ? <span className="text-xs font-normal text-blue-600">点击插入到「{varTarget}」</span> : null}
        </div>
        <VariablePicker nodes={nodes} currentNodeId={node.id} onInsert={insertVar} />
      </div>
    </div>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  onPickVar?: () => void
}) {
  const cls = 'mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950'
  return (
    <label className="block text-xs text-zinc-500">
      <span className="flex items-center justify-between">
        {props.label}
        {props.onPickVar ? (
          <button type="button" onClick={props.onPickVar} className="text-[10px] text-blue-600">
            {'{{ }}'}
          </button>
        ) : null}
      </span>
      {props.multiline ? (
        <textarea value={props.value} onChange={(e) => props.onChange(e.target.value)} rows={3} className={cls} />
      ) : (
        <input value={props.value} onChange={(e) => props.onChange(e.target.value)} className={cls} />
      )}
    </label>
  )
}
