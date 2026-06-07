import { useEffect, type ReactNode } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Workflows from '@/pages/Workflows'
import WorkflowEditor from '@/pages/WorkflowEditor'
import Inbox from '@/pages/Inbox'
import Channels from '@/pages/Channels'
import Admin from '@/pages/Admin'
import Connectors from '@/pages/Connectors'
import Executions from '@/pages/Executions'
import Knowledge from '@/pages/Knowledge'
import AIModels from '@/pages/AIModels'
import Apps from '@/pages/Apps'
import ChatWidget from '@/pages/ChatWidget'
import AppShell from '@/components/AppShell'
import { useAuthStore } from '@/stores/authStore'

function RequireAuth(props: { children: ReactNode }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <>{props.children}</>
}

export default function App() {
  const { hydrate } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/chat/:apiKey" element={<ChatWidget />} />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/workflows/:id/editor" element={<WorkflowEditor />} />
          <Route path="/executions" element={<Executions />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/channels" element={<Channels />} />
          <Route path="/connectors" element={<Connectors />} />
          <Route path="/ai/knowledge" element={<Knowledge />} />
          <Route path="/ai/models" element={<AIModels />} />
          <Route path="/ai/apps" element={<Apps />} />
          <Route path="/admin" element={<Admin />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
