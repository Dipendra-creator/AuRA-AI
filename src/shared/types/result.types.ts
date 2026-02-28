/**
 * Structured result type for IPC responses.
 * Never return raw errors — always wrap in Result<T>.
 */

export type Result<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string }

/** Helper to create a success result */
export function success<T>(data: T): Result<T> {
  return { success: true, data }
}

/** Helper to create an error result */
export function failure<T>(error: string): Result<T> {
  return { success: false, error }
}
