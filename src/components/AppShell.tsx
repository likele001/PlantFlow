import { Outlet } from 'react-router-dom'
import SideNav from '@/components/SideNav'
import TopBar from '@/components/TopBar'

export default function AppShell() {
  return (
    <div className="flex h-screen w-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

