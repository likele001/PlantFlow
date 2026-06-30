import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export default function Home() {
  const { token } = useAuthStore()
  return <Navigate to={token ? '/dashboard' : '/login'} replace />
}
