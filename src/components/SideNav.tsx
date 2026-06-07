import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Activity, Blocks, BookOpen, Bot, Inbox, LayoutDashboard, MessageCircleMore, Settings2, Sparkles, Workflow } from 'lucide-react'

type NavItem = {
  to: string
  label: string
  icon: React.ReactNode
}

const items: NavItem[] = [
  { to: '/dashboard', label: '控制台', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/workflows', label: '工作流', icon: <Workflow className="h-4 w-4" /> },
  { to: '/executions', label: '执行中心', icon: <Activity className="h-4 w-4" /> },
  { to: '/inbox', label: '会话中心', icon: <Inbox className="h-4 w-4" /> },
  { to: '/channels', label: '渠道接入', icon: <MessageCircleMore className="h-4 w-4" /> },
  { to: '/connectors', label: '连接器', icon: <Blocks className="h-4 w-4" /> },
  { to: '/ai/models', label: 'AI 模型', icon: <Sparkles className="h-4 w-4" /> },
  { to: '/ai/apps', label: '对话应用', icon: <Bot className="h-4 w-4" /> },
  { to: '/ai/knowledge', label: '知识库', icon: <BookOpen className="h-4 w-4" /> },
  { to: '/admin', label: '系统管理', icon: <Settings2 className="h-4 w-4" /> },
]

export default function SideNav() {
  const location = useLocation()

  return (
    <div className="flex h-full w-60 flex-col border-r border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="px-2 pb-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          导航
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {items.map((it) => {
          const active = location.pathname === it.to || (it.to !== '/dashboard' && location.pathname.startsWith(it.to + '/'))
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
                active
                  ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900/60',
              )}
            >
              <span className={cn(active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400')}>
                {it.icon}
              </span>
              <span className="truncate">{it.label}</span>
            </Link>
          )
        })}
      </div>

      <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
        <div className="font-semibold text-zinc-800 dark:text-zinc-100">演示账号</div>
        <div className="mt-1">admin@example.com / admin123</div>
      </div>
    </div>
  )
}
