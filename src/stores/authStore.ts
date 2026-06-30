import { create } from 'zustand'
import { apiRequest } from '@/utils/api'

type AuthUser = {
  id: string
  email: string
  role: string
}

type AuthTenant = {
  id: string
  name: string
}

type AuthState = {
  token: string | null
  user: AuthUser | null
  tenant: AuthTenant | null
  error: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  hydrate: () => void
  setAuth: (token: string, user: AuthUser, tenant: AuthTenant | null) => void
}

type LoginResponse = {
  token: string
  user: AuthUser
  tenant: AuthTenant | null
}

function readPersisted(): Pick<AuthState, 'token' | 'user' | 'tenant'> {
  try {
    const raw = localStorage.getItem('wf_auth')
    if (!raw) return { token: null, user: null, tenant: null }
    const parsed = JSON.parse(raw) as { token?: string; user?: AuthUser; tenant?: AuthTenant }
    return {
      token: typeof parsed.token === 'string' ? parsed.token : null,
      user: parsed.user ?? null,
      tenant: parsed.tenant ?? null,
    }
  } catch {
    return { token: null, user: null, tenant: null }
  }
}

function persist(s: Pick<AuthState, 'token' | 'user' | 'tenant'>) {
  try {
    localStorage.setItem('wf_auth', JSON.stringify(s))
  } catch {}
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  tenant: null,
  error: null,
  isLoading: false,
  hydrate: () => {
    const p = readPersisted()
    set({ token: p.token, user: p.user, tenant: p.tenant })
  },
  login: async (email, password) => {
    set({ isLoading: true, error: null })
    const res = await apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    if (!('data' in res)) {
      set({ isLoading: false, error: res.error })
      return false
    }

    const next = { token: res.data.token, user: res.data.user, tenant: res.data.tenant }
    persist(next)
    set({ ...next, isLoading: false, error: null })
    return true
  },
  logout: async () => {
    const token = get().token
    set({ isLoading: true, error: null })
    if (token) {
      await apiRequest('/api/auth/logout', { method: 'POST', token }).catch(() => null)
    }
    persist({ token: null, user: null, tenant: null })
    set({ token: null, user: null, tenant: null, isLoading: false })
  },
  setAuth: (token, user, tenant) => {
    persist({ token, user, tenant })
    set({ token, user, tenant, isLoading: false, error: null })
  },
}))
