import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, MessagesSquare, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'

type Stats = {
  executionsToday: number
  successRate: number
  alertsToday: number
  messagesToday: number
  aiCallsToday: number
  failureTop: { workflowName: string; reason: string; count: number }[]
}

export default function Dashboard() {
  const { token } = useAuthStore()
  const [stats, setStats] = useState<Stats | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!token) return
      const res = await apiRequest<Stats>('/api/dashboard/stats', { token })
      if ('data' in res) setStats(res.data)
      else setErr(res.error)
    }
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [token])

  const cards = [
    {
      title: '今日执行',
      value: String(stats?.executionsToday ?? 0),
      hint: `成功率 ${stats?.successRate ?? 100}%`,
      icon: <Activity className="h-4 w-4" />,
    },
    {
      title: '告警与异常',
      value: String(stats?.alertsToday ?? 0),
      hint: '今日失败执行数',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      title: '渠道消息',
      value: String(stats?.messagesToday ?? 0),
      hint: '企业微信/飞书',
      icon: <MessagesSquare className="h-4 w-4" />,
    },
    {
      title: 'AI 调用',
      value: String(stats?.aiCallsToday ?? 0),
      hint: '对话 + 知识库节点',
      icon: <Sparkles className="h-4 w-4" />,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">控制台</div>
        <div className="mt-2 text-2xl font-semibold">生产与 AI 运行态势</div>
        <div className="mt-1 text-sm text-zinc-500">数据来自执行记录、渠道消息与 AI 节点统计，每 30 秒刷新。</div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700">{err}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.title} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-zinc-500">{c.title}</div>
                <div className="mt-2 text-2xl font-semibold">{c.value}</div>
                <div className="mt-2 text-xs text-zinc-500">{c.hint}</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900">{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 lg:col-span-2">
          <div className="text-sm font-semibold">失败 TOP（近 24h）</div>
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900/40">
                <tr>
                  <th className="px-4 py-3 font-semibold">工作流</th>
                  <th className="px-4 py-3 font-semibold">原因</th>
                  <th className="px-4 py-3 font-semibold">次数</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.failureTop ?? []).map((r) => (
                  <tr key={`${r.workflowName}-${r.reason}`} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-3">{r.workflowName}</td>
                    <td className="px-4 py-3 text-zinc-500">{r.reason}</td>
                    <td className="px-4 py-3">{r.count}</td>
                  </tr>
                ))}
                {!stats?.failureTop?.length ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                      近 24 小时无失败记录
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-semibold">快捷入口</div>
          <div className="mt-3 space-y-3 text-sm">
            <Link to="/channels" className="block rounded-xl border bg-zinc-50 p-4 transition hover:bg-zinc-100 dark:bg-zinc-900/40">
              配置企业微信/飞书渠道
            </Link>
            <Link to="/ai/models" className="block rounded-xl border bg-zinc-50 p-4 transition hover:bg-zinc-100 dark:bg-zinc-900/40">
              配置 AI 模型提供商
            </Link>
            <Link to="/workflows" className="block rounded-xl border bg-zinc-50 p-4 transition hover:bg-zinc-100 dark:bg-zinc-900/40">
              创建并发布工作流
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
