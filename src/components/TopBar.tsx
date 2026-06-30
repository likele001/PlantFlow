import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Moon, Sun, Workflow } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

export default function TopBar(props: { className?: string }) {
  const { isDark, toggleTheme } = useTheme()
  const { tenant, user, logout } = useAuthStore()

  const initials = useMemo(() => {
    const email = user?.email ?? ''
    const c = email.slice(0, 2).toUpperCase()
    return c || 'U'
  }, [user?.email])

  return (
    <div
      className={cn(
        'flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950',
        props.className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950">
          <Workflow className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">工厂工作流平台</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{tenant?.name ?? '未选择租户'}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="hidden sm:inline">{isDark ? '浅色' : '深色'}</span>
        </button>

        <Link
          to="/profile"
          className="hidden items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 sm:flex"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {initials}
          </div>
          <div className="max-w-40 truncate">{user?.email ?? '未登录'}</div>
        </Link>

        <button
          type="button"
          onClick={() => void logout()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3 text-sm text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">退出</span>
        </button>
      </div>
    </div>
  )
}

