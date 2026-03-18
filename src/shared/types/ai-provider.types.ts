/**
 * AI Provider types — shared between the API client and the APIConfig page.
 * Currently only Kilo Code is supported as the active provider.
 */

export interface AIProvider {
  id: string
  userId: string
  type: 'kilo_code'
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
  apiKey: string
  model?: string
}
