/**
 * AuthContext — Global authentication state for Aura AI.
 *
 * Provides: currentUser, login, register, loginWithGitHub, logout.
 * Persists the JWT in localStorage via api-client helpers.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type ReactElement
} from 'react'
import { getAuthToken, setAuthToken, clearAuthToken, apiPatch, apiPost } from '../data/api-client'

const API_BASE = 'http://localhost:8080/api/v1'

export interface AuthUser {
  id: string
  email: string
  name: string
  provider: 'local' | 'github'
  avatar_url?: string
  created_at: string
}

interface AuthResponse {
  token: string
  user: AuthUser
}

interface APIEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  loginWithGitHub: () => Promise<void>
  logout: () => void
  updateProfile: (updates: { name: string }) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function apiAuth<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const envelope: APIEnvelope<T> = await res.json()
  if (!envelope.success) {
    throw new Error(envelope.error ?? 'Authentication failed')
  }
  return envelope.data!
}

async function apiGetAuth<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Session expired')
  const envelope: APIEnvelope<T> = await res.json()
  if (!envelope.success) throw new Error(envelope.error ?? 'Request failed')
  return envelope.data!
}

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On mount, restore session from stored JWT
  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setIsLoading(false)
      return
    }
    apiGetAuth<AuthUser>('/auth/me', token)
      .then((u) => setUser(u))
      .catch(() => clearAuthToken())
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiAuth<AuthResponse>('/auth/login', { email, password })
    setAuthToken(data.token)
    setUser(data.user)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await apiAuth<AuthResponse>('/auth/register', { name, email, password })
    setAuthToken(data.token)
    setUser(data.user)
  }, [])

  const loginWithGitHub = useCallback(async () => {
    // Generate a random session ID to correlate callback
    const sessionId = crypto.randomUUID()

    // Ask backend for the GitHub authorization URL
    const res = await fetch(`${API_BASE}/auth/github?session_id=${sessionId}`)
    const envelope: APIEnvelope<{ url: string }> = await res.json()
    if (!envelope.success || !envelope.data?.url) {
      throw new Error(envelope.error ?? 'GitHub OAuth not available')
    }

    // Open the GitHub auth URL.
    // In Electron, window.open() returns null because setWindowOpenHandler
    // redirects to shell.openExternal and denies the popup. This is expected —
    // the URL still opens in the user's default browser.
    const popup = window.open(
      envelope.data.url,
      'github-auth',
      'width=600,height=700,scrollbars=yes,resizable=yes'
    )

    const isElectron = !popup // null means Electron denied the popup but opened externally

    // Listen for the result via postMessage (works in browser popup) or polling (Electron / fallback)
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        fn()
      }

      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'github-auth-success') {
          window.removeEventListener('message', messageHandler)
          clearInterval(pollInterval)
          const token: string = event.data.token
          setAuthToken(token)
          apiGetAuth<AuthUser>('/auth/me', token)
            .then((u) => settle(() => { setUser(u); resolve() }))
            .catch((err) => settle(() => reject(err)))
        } else if (event.data?.type === 'github-auth-error') {
          window.removeEventListener('message', messageHandler)
          clearInterval(pollInterval)
          settle(() => reject(new Error(event.data.error ?? 'GitHub authentication failed')))
        }
      }

      // Only listen for postMessage if we have a real popup (browser context)
      if (!isElectron) {
        window.addEventListener('message', messageHandler)
      }

      // Poll the status endpoint (primary mechanism in Electron, fallback in browser)
      const POLL_TIMEOUT_MS = 120_000 // 2 minutes
      const pollStart = Date.now()
      const pollInterval = setInterval(async () => {
        // Timeout guard
        if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
          clearInterval(pollInterval)
          window.removeEventListener('message', messageHandler)
          settle(() => reject(new Error('GitHub authentication timed out')))
          return
        }

        // In browser mode, check if popup was closed without completing
        if (!isElectron && popup && popup.closed) {
          clearInterval(pollInterval)
          window.removeEventListener('message', messageHandler)
          try {
            const statusRes = await fetch(`${API_BASE}/auth/github/status?session_id=${sessionId}`)
            const statusEnv: APIEnvelope<{ ready: boolean; token?: string }> =
              await statusRes.json()
            if (statusEnv.data?.ready && statusEnv.data.token) {
              setAuthToken(statusEnv.data.token)
              const u = await apiGetAuth<AuthUser>('/auth/me', statusEnv.data.token)
              settle(() => { setUser(u); resolve() })
            } else {
              settle(() => reject(new Error('GitHub authentication was cancelled')))
            }
          } catch {
            settle(() => reject(new Error('GitHub authentication failed')))
          }
          return
        }

        try {
          const statusRes = await fetch(`${API_BASE}/auth/github/status?session_id=${sessionId}`)
          const statusEnv: APIEnvelope<{ ready: boolean; token?: string }> = await statusRes.json()
          if (statusEnv.data?.ready && statusEnv.data.token) {
            clearInterval(pollInterval)
            window.removeEventListener('message', messageHandler)
            if (popup && !popup.closed) popup.close()
            setAuthToken(statusEnv.data.token)
            const u = await apiGetAuth<AuthUser>('/auth/me', statusEnv.data.token)
            settle(() => { setUser(u); resolve() })
          }
        } catch {
          // ignore poll errors, keep waiting
        }
      }, 2000)
    })
  }, [])

  const logout = useCallback(() => {
    clearAuthToken()
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (updates: { name: string }) => {
    const updated = await apiPatch<AuthUser>('/auth/me', updates)
    setUser(updated)
  }, [])

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await apiPost<{ message: string }>('/auth/me/password', {
        current_password: currentPassword,
        new_password: newPassword
      })
    },
    []
  )

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, loginWithGitHub, logout, updateProfile, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
