/**
 * AI Provider types — shared between the API client and the APIConfig page.
 * Supports Kilo Code and GitHub Copilot (GitHub Models API) providers.
 */

export type ProviderType = 'kilo_code' | 'github_copilot'

export interface AIProvider {
  id: string
  userId: string
  type: ProviderType
  apiKeyPreview?: string   // e.g. "...sk3f"
  baseUrl?: string
  model?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProviderTestResult {
  success: boolean
  latencyMs: number
  message: string
  testedAt: string
}

export interface SaveProviderInput {
  providerType: ProviderType
  apiKey: string
  model?: string
}

/** Metadata about a supported provider — used by the frontend to render config cards */
export interface ProviderInfo {
  type: ProviderType
  name: string
  description: string
  icon: string
  defaultModel: string
  models: { value: string; label: string }[]
  apiKeyPlaceholder: string
  helpUrl: string
  helpText: string
}
