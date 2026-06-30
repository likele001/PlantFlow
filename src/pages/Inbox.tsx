import { useEffect, useMemo, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

type Conversation = {
  id: string
  channel: 'wecom' | 'feishu'
  title: string
  updatedAt: string
}

type Message = {
  id: string
  direction: 'in' | 'out'
  senderId: string
  senderName?: string
  content: string
  createdAt: string
}

export default function Inbox() {
  const { token } = useAuthStore()
  const [items, setItems] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    async function load() {
      if (!token) return
      setErr(null)
      const res = await apiRequest<Conversation[]>('/api/conversations', { token })
      if (!('data' in res)) {
        setErr(res.error)
        return
      }
      setItems(res.data)
      setActiveId((prev) => prev ?? res.data[0]?.id ?? null)
    }
    void load()
    const t = setInterval(() => void load(), 15_000)
    return () => clearInterval(t)
  }, [token])

  useEffect(() => {
    async function loadMsgs() {
      if (!token || !activeId) {
        setMessages([])
        return
      }
      const res = await apiRequest<Message[]>(`/api/conversations/${activeId}/messages`, { token })
      if ('data' in res) setMessages(res.data)
    }
    void loadMsgs()
    const t = setInterval(() => void loadMsgs(), 10_000)
    return () => clearInterval(t)
  }, [token, activeId])

  const active = useMemo(() => items.find((i) => i.id === activeId) ?? null, [activeId, items])

  async function sendReply() {
    if (!token || !activeId || !reply.trim()) return
    setSending(true)
    const res = await apiRequest(`/api/conversations/${activeId}/reply`, {
      method: 'POST',
      token,
      body: { content: reply.trim() },
    })
    setSending(false)
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setReply('')
    const msgRes = await apiRequest<Message[]>(`/api/conversations/${activeId}/messages`, { token })
    if ('data' in msgRes) setMessages(msgRes.data)
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">会话中心</div>
        <div className="mt-2 text-2xl font-semibold">企业微信 / 飞书消息收件箱</div>
        <div className="mt-1 text-sm text-zinc-500">
          渠道回调消息会实时入库；已发布的工作流将自动触发执行。
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700">{err}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b px-5 py-4 text-sm font-semibold">会话</div>
          <div className="divide-y dark:divide-zinc-800">
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveId(c.id)}
                className={cn(
                  'flex w-full items-center gap-3 px-5 py-4 text-left transition',
                  c.id === activeId ? 'bg-zinc-50 dark:bg-zinc-900/50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/30',
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                  <MessageSquareText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{c.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                    <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 font-semibold">
                      {c.channel === 'wecom' ? '企业微信' : '飞书'}
                    </span>
                    <span className="truncate">{new Date(c.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
              </button>
            ))}
            {!items.length ? (
              <div className="px-5 py-16 text-center text-sm text-zinc-500">暂无会话，配置渠道后等待消息回调</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{active?.title ?? '请选择会话'}</div>
            <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">实时同步</div>
          </div>

          <div className="mt-4 max-h-[600px] space-y-3 overflow-y-auto">
            {active ? (
              messages.length ? (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                      m.direction === 'in'
                        ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'
                        : 'ml-auto bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950',
                    )}
                  >
                    <div className="mb-1 text-xs opacity-70">
                      {m.senderName || m.senderId} · {new Date(m.createdAt).toLocaleString()}
                    </div>
                    {m.content}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-zinc-500">
                  该会话暂无消息
                </div>
              )
            ) : (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-zinc-500">
                选择左侧会话查看消息
              </div>
            )}
          </div>
          {active ? (
            <div className="mt-4 flex gap-2 border-t pt-4 dark:border-zinc-800">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="人工回复…"
                className="h-10 flex-1 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
              <button
                type="button"
                disabled={sending}
                onClick={() => void sendReply()}
                className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
              >
                发送
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
