import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Workflow } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

export default function Login() {
  const navigate = useNavigate()
  const { token, login, error, isLoading, hydrate } = useAuthStore()
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('admin123')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    if (token) {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate, token])

  const showError = useMemo(() => localError ?? error, [error, localError])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-950">
              <Workflow className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">工厂工作流平台</div>
              <div className="text-xs text-zinc-400">可视化编排 · AI · 渠道接入</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-zinc-400 sm:flex">
            <ShieldCheck className="h-4 w-4" />
            <span>私有化 · 多租户 · 审计留痕</span>
          </div>
        </div>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-xs text-zinc-200">
              面向生产报工与智能客服的工作流中枢
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight">
              把消息、数据、AI
              <span className="block text-zinc-300">编排成可追踪的自动化</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-zinc-400">
              从企业微信/飞书群消息到报工系统、设备告警，再到你的 OpenAI 兼容模型：统一在一个画布里连接、运行、审计与复盘。
            </p>

            <div className="mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { title: '工作流编排', desc: '触发器、条件、并行、重试' },
                { title: 'AI 节点', desc: '默认模型与私有模型统一接入' },
                { title: '会话中心', desc: '机器人/人工协同，留痕质检' },
                { title: '可观测', desc: '执行日志、输入输出快照、告警' },
              ].map((c) => (
                <div key={c.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="text-sm font-semibold text-zinc-100">{c.title}</div>
                  <div className="mt-1 text-xs text-zinc-400">{c.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-md">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.8)]">
              <div className="text-sm font-semibold">登录</div>
              <div className="mt-1 text-xs text-zinc-400">演示模式：账号已内置在服务端内存中</div>

              <form
                className="mt-6 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault()
                  setLocalError(null)
                  const ok = await login(email, password)
                  if (!ok) setLocalError('登录失败，请检查账号密码')
                }}
              >
                <label className="block">
                  <div className="mb-1 text-xs text-zinc-400">邮箱</div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      'h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-100 outline-none transition',
                      'focus:border-zinc-500 focus:ring-4 focus:ring-zinc-500/10',
                    )}
                    placeholder="you@company.com"
                    autoComplete="email"
                  />
                </label>

                <label className="block">
                  <div className="mb-1 text-xs text-zinc-400">密码</div>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    className={cn(
                      'h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-100 outline-none transition',
                      'focus:border-zinc-500 focus:ring-4 focus:ring-zinc-500/10',
                    )}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                  />
                </label>

                {showError ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                    {showError}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isLoading}
                  className={cn(
                    'group inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition',
                    'hover:bg-white disabled:cursor-not-allowed disabled:opacity-70',
                  )}
                >
                  <span>{isLoading ? '登录中…' : '进入控制台'}</span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </button>
              </form>

              <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-400">
                <div className="font-semibold text-zinc-200">接下来</div>
                <div className="mt-1">1) 在“连接器/渠道接入”配置企业微信、飞书</div>
                <div>2) 在“AI 中心”配置你的 OpenAI 兼容模型与默认模型</div>
                <div>3) 创建工作流，把消息和业务系统串起来</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

