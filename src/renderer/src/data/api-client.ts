/**
 * API Client — HTTP client for the Aura AI Go backend.
 *
 * Provides typed fetch wrappers that communicate with the REST API.
 * All methods return the unwrapped `data` field from the API envelope.
 * On network failure, throws an error so callers can fall back to mock data.
 */

const API_BASE = 'http://localhost:8080/api/v1'

/** Standard API response envelope from the Go backend */
interface APIEnvelope<T> {
  readonly success: boolean
  readonly data?: T
  readonly error?: string
  readonly meta?: {
    readonly total: number
    readonly page: number
    readonly limit: number
  }
}

/** Returns the stored JWT token from localStorage */
export function getAuthToken(): string | null {
  return localStorage.getItem('aura_auth_token')
}

/** Stores the JWT token in localStorage */
export function setAuthToken(token: string): void {
  localStorage.setItem('aura_auth_token', token)
}

/** Removes the JWT token from localStorage */
export function clearAuthToken(): void {
  localStorage.removeItem('aura_auth_token')
}

/** Builds Authorization header if a token is stored */
function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Makes a GET request and returns the unwrapped data */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...authHeaders() }
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  const envelope: APIEnvelope<T> = await res.json()
  if (!envelope.success) {
    throw new Error(envelope.error ?? 'Unknown API error')
  }
  return envelope.data!
}

/** Makes a POST request and returns the unwrapped data */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  const envelope: APIEnvelope<T> = await res.json()
  if (!envelope.success) {
    throw new Error(envelope.error ?? 'Unknown API error')
  }
  return envelope.data!
}

/** Makes a PATCH request and returns the unwrapped data */
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  const envelope: APIEnvelope<T> = await res.json()
  if (!envelope.success) {
    throw new Error(envelope.error ?? 'Unknown API error')
  }
  return envelope.data!
}

/** Makes a DELETE request */
export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
}

/** Makes a POST request with multipart form data (for file uploads) */
export async function apiPostFormData<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  const envelope: APIEnvelope<T> = await res.json()
  if (!envelope.success) {
    throw new Error(envelope.error ?? 'Unknown API error')
  }
  return envelope.data!
}

/** Makes a GET request and returns the response as a Blob (for file downloads) */
export async function apiGetBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...authHeaders() }
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  return res.blob()
}

/** Makes a POST request and returns the response as a Blob (for file downloads) */
export async function apiPostBlob(path: string, body: unknown): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  return res.blob()
}

// ── AI Provider endpoints ─────────────────────────────────────────────────────

import type { AIProvider, ProviderTestResult, ProviderType, SaveProviderInput } from '../../../shared/types/ai-provider.types'

/** Returns all configured AI providers for the current user. */
export async function listAIProviders(): Promise<AIProvider[]> {
  const res = await fetch(`${API_BASE}/ai-providers`, {
    headers: { ...authHeaders() }
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const envelope: APIEnvelope<AIProvider[]> = await res.json()
  if (!envelope.success) throw new Error(envelope.error ?? 'Unknown API error')
  return envelope.data ?? []
}

/** Returns a specific provider config (API key masked), or null if not configured. */
export async function getAIProvider(providerType: ProviderType): Promise<AIProvider | null> {
  const res = await fetch(`${API_BASE}/ai-providers/${providerType}`, {
    headers: { ...authHeaders() }
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const envelope: APIEnvelope<AIProvider | null> = await res.json()
  if (!envelope.success) throw new Error(envelope.error ?? 'Unknown API error')
  return envelope.data ?? null
}

/** Saves (creates or updates) an AI provider API key. Also sets it as active. */
export async function saveAIProvider(input: SaveProviderInput): Promise<AIProvider> {
  const res = await fetch(`${API_BASE}/ai-providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input)
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const envelope: APIEnvelope<AIProvider> = await res.json()
  if (!envelope.success) throw new Error(envelope.error ?? 'Unknown API error')
  return envelope.data!
}

/** Marks a specific provider as the active one. */
export async function activateAIProvider(providerType: ProviderType): Promise<AIProvider> {
  const res = await fetch(`${API_BASE}/ai-providers/${providerType}/activate`, {
    method: 'POST',
    headers: { ...authHeaders() }
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const envelope: APIEnvelope<AIProvider> = await res.json()
  if (!envelope.success) throw new Error(envelope.error ?? 'Unknown API error')
  return envelope.data!
}

/** Updates only the model for an existing provider config. */
export async function updateAIProviderModel(providerType: ProviderType, model: string): Promise<AIProvider> {
  const res = await fetch(`${API_BASE}/ai-providers/${providerType}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ model })
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const envelope: APIEnvelope<AIProvider> = await res.json()
  if (!envelope.success) throw new Error(envelope.error ?? 'Unknown API error')
  return envelope.data!
}

/** Removes a specific provider config. */
export async function deleteAIProvider(providerType: ProviderType): Promise<void> {
  const res = await fetch(`${API_BASE}/ai-providers/${providerType}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
}

/** Tests connectivity to a specific provider using the stored key. */
export async function testAIProvider(providerType: ProviderType): Promise<ProviderTestResult> {
  const res = await fetch(`${API_BASE}/ai-providers/${providerType}/test`, {
    method: 'POST',
    headers: { ...authHeaders() }
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const envelope: APIEnvelope<ProviderTestResult> = await res.json()
  if (!envelope.success) throw new Error(envelope.error ?? 'Unknown API error')
  return envelope.data!
}

// ── Analysis events ───────────────────────────────────────────────────────────

/** Analysis progress event from SSE stream */
export interface AnalysisEvent {
  readonly type: 'start' | 'page_done' | 'error' | 'complete'
  readonly totalPages?: number
  readonly page?: number
  readonly fieldsFound?: number
  readonly totalFields?: number
  readonly confidence?: number
  readonly error?: string
  readonly fields?: readonly {
    fieldName: string
    value: string
    confidence: number
    verified: boolean
  }[]
  readonly pagesSucceeded?: number
  readonly pagesFailed?: number
}
