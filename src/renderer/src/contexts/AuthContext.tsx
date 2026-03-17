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
import { getAuthToken, setAuthToken, clearAuthToken } from '../data/api-client'

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

    // Open a popup window for GitHub auth
    const popup = window.open(
      envelope.data.url,
      'github-auth',
      'width=600,height=700,scrollbars=yes,resizable=yes'
    )

    if (!popup) {
      throw new Error('Could not open GitHub auth popup. Please allow popups for this app.')
    }

    // Listen for postMessage from the callback page
    await new Promise<void>((resolve, reject) => {
      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'github-auth-success') {
          window.removeEventListener('message', messageHandler)
          clearInterval(pollInterval)
          const token: string = event.data.token
          setAuthToken(token)
          // Fetch user info with the new token
          apiGetAuth<AuthUser>('/auth/me', token)
            .then((u) => {
              setUser(u)
              resolve()
            })
            .catch(reject)
        } else if (event.data?.type === 'github-auth-error') {
          window.removeEventListener('message', messageHandler)
          clearInterval(pollInterval)
          reject(new Error(event.data.error ?? 'GitHub authentication failed'))
        }
      }

      window.addEventListener('message', messageHandler)

      // Also poll the status endpoint as a fallback (in case postMessage is blocked)
      const pollInterval = setInterval(async () => {
        if (popup.closed) {
          // Popup closed — check status one last time
          clearInterval(pollInterval)
          window.removeEventListener('message', messageHandler)
          try {
            const statusRes = await fetch(`${API_BASE}/auth/github/status?session_id=${sessionId}`)
            const statusEnv: APIEnvelope<{ ready: boolean; token?: string }> =
              await statusRes.json()
            if (statusEnv.data?.ready && statusEnv.data.token) {
              setAuthToken(statusEnv.data.token)
              const u = await apiGetAuth<AuthUser>('/auth/me', statusEnv.data.token)
              setUser(u)
              resolve()
            } else {
              reject(new Error('GitHub authentication was cancelled'))
            }
          } catch {
            reject(new Error('GitHub authentication failed'))
          }
          return
        }

        try {
          const statusRes = await fetch(`${API_BASE}/auth/github/status?session_id=${sessionId}`)
          const statusEnv: APIEnvelope<{ ready: boolean; token?: string }> = await statusRes.json()
          if (statusEnv.data?.ready && statusEnv.data.token) {
            clearInterval(pollInterval)
            window.removeEventListener('message', messageHandler)
            popup.close()
            setAuthToken(statusEnv.data.token)
            const u = await apiGetAuth<AuthUser>('/auth/me', statusEnv.data.token)
            setUser(u)
            resolve()
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

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, loginWithGitHub, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
