import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'

type Msg = { role: 'user' | 'assistant'; content: string }

export default function ChatWidget() {
  const { apiKey } = useParams<{ apiKey: string }>()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || !apiKey || loading) return
    setInput('')
    setErr(null)
    setMessages((m) => [...m, { role: 'user', content: text }])
    setLoading(true)

    try {
      const res = await fetch('/api/v1/chat/completions/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ message: text, user: 'web' }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistant = ''
      setMessages((m) => [...m, { role: 'assistant', content: '' }])

      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const json = JSON.parse(line.slice(5)) as { delta?: string; error?: string; done?: boolean }
          if (json.error) throw new Error(json.error)
          if (json.delta) {
            assistant += json.delta
            setMessages((m) => {
              const copy = [...m]
              copy[copy.length - 1] = { role: 'assistant', content: assistant }
              return copy
            })
          }
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-2xl text-sm font-semibold">对话助手</div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-4">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap',
                m.role === 'user'
                  ? 'ml-auto bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'bg-white border dark:border-zinc-800 dark:bg-zinc-900',
              )}
            >
              {m.content || (loading && i === messages.length - 1 ? '…' : '')}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {err ? <div className="mt-2 text-sm text-red-600">{err}</div> : null}
        <div className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            placeholder="输入消息…"
            className="h-11 flex-1 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void send()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
          >
            <Send className="h-4 w-4" /> 发送
          </button>
        </div>
      </main>
    </div>
  )
}
