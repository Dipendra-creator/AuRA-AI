/**
 * AIProviderContext — Global AI provider state for Aura AI.
 *
 * Fetches the list of configured AI providers on mount and exposes:
 *   - providers:       all configured providers
 *   - activeProvider:  the one currently marked active (or null)
 *   - isConfigured:    true when at least one provider is active
 *   - activeModelName: display-friendly model string
 *   - activeProviderName: display-friendly provider name
 *   - refresh():       re-fetch from backend (call after save/delete)
 *   - isLoading:       true during initial fetch
 *
 * Wrap the app in <AIProviderProvider> (inside AuthProvider so the JWT is available).
 * Consume with the useAIProvider() hook.
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
import { listAIProviders } from '../data/api-client'
import type { AIProvider, ProviderType } from '../../../shared/types/ai-provider.types'

// ── Provider display names ────────────────────────────────────────────────────

const PROVIDER_DISPLAY_NAMES: Record<ProviderType, string> = {
  kilo_code: 'Kilo Code',
  github_copilot: 'GitHub Copilot'
}

function getProviderDisplayName(type: ProviderType): string {
  return PROVIDER_DISPLAY_NAMES[type] ?? type
}

// ── Context value ─────────────────────────────────────────────────────────────

interface AIProviderContextValue {
  /** All configured providers for the current user. */
  providers: AIProvider[]
  /** The provider currently marked as active, or null. */
  activeProvider: AIProvider | null
  /** True when at least one provider is active and configured. */
  isConfigured: boolean
  /** Display-friendly name of the active provider (e.g. "GitHub Copilot"). */
  activeProviderName: string | null
  /** Model string of the active provider (e.g. "gpt-4o-mini"). */
  activeModelName: string | null
  /** Re-fetch providers from the backend. Call after save/delete/activate. */
  refresh: () => Promise<void>
  /** True during the initial load. */
  isLoading: boolean
}

const AIProviderContext = createContext<AIProviderContextValue | null>(null)

// ── Provider component ────────────────────────────────────────────────────────

export function AIProviderProvider({ children }: { children: ReactNode }): ReactElement {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchProviders = useCallback(async () => {
    try {
      const list = await listAIProviders()
      setProviders(list)
    } catch {
      // Backend might be down — keep previous state or empty
      setProviders([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  const activeProvider = providers.find((p) => p.isActive) ?? null

  const value: AIProviderContextValue = {
    providers,
    activeProvider,
    isConfigured: activeProvider !== null,
    activeProviderName: activeProvider ? getProviderDisplayName(activeProvider.type) : null,
    activeModelName: activeProvider?.model ?? null,
    refresh: fetchProviders,
    isLoading
  }

  return <AIProviderContext value={value}>{children}</AIProviderContext>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAIProvider(): AIProviderContextValue {
  const ctx = useContext(AIProviderContext)
  if (!ctx) throw new Error('useAIProvider must be used inside AIProviderProvider')
  return ctx
}
