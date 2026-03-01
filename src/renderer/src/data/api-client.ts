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

/** Makes a GET request and returns the unwrapped data */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  const envelope: APIEnvelope<T> = await res.json()
  if (!envelope.success) {
    throw new Error(envelope.error ?? 'Unknown API error')
  }
  return envelope.data as T
}

/** Makes a POST request and returns the unwrapped data */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  const envelope: APIEnvelope<T> = await res.json()
  if (!envelope.success) {
    throw new Error(envelope.error ?? 'Unknown API error')
  }
  return envelope.data as T
}

/** Makes a PATCH request and returns the unwrapped data */
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  const envelope: APIEnvelope<T> = await res.json()
  if (!envelope.success) {
    throw new Error(envelope.error ?? 'Unknown API error')
  }
  return envelope.data as T
}

/** Makes a DELETE request */
export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
}

/** Makes a POST request with multipart form data (for file uploads) */
export async function apiPostFormData<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  const envelope: APIEnvelope<T> = await res.json()
  if (!envelope.success) {
    throw new Error(envelope.error ?? 'Unknown API error')
  }
  return envelope.data as T
}

/** Makes a POST request and returns the response as a Blob (for file downloads) */
export async function apiPostBlob(path: string, body: unknown): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  return res.blob()
}
