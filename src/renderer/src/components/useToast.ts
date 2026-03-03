/**
 * useToast — hook for managing toast notification state.
 * Extracted from Toast.tsx to satisfy react-refresh/only-export-components.
 */

import { useState, useCallback } from 'react'
import type { ToastType, ToastMessage } from './Toast'

/** Hook for managing toast state */
export function useToast(): {
  toasts: readonly ToastMessage[]
  addToast: (type: ToastType, text: string) => void
  dismissToast: (id: string) => void
} {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((type: ToastType, text: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts((prev) => [...prev, { id, type, text }])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, dismissToast }
}
