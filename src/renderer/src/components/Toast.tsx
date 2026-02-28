/**
 * Toast — lightweight notification component for success/error feedback.
 * Shows at top-right, auto-dismisses after 4s, supports stacking.
 */

import { useState, useEffect, useCallback, type ReactElement } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
    readonly id: string
    readonly type: ToastType
    readonly text: string
}

interface ToastContainerProps {
    readonly toasts: readonly ToastMessage[]
    readonly onDismiss: (id: string) => void
}

function ToastItem({
    toast,
    onDismiss
}: {
    toast: ToastMessage
    onDismiss: (id: string) => void
}): ReactElement {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(toast.id), 4000)
        return () => clearTimeout(timer)
    }, [toast.id, onDismiss])

    const icon = toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'

    return (
        <div className={`toast toast-${toast.type} animate-slide-in-right`}>
            <span className="toast-icon">{icon}</span>
            <span className="toast-text">{toast.text}</span>
            <button className="toast-close" onClick={() => onDismiss(toast.id)}>
                ✕
            </button>
        </div>
    )
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps): ReactElement {
    return (
        <div className="toast-container">
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
            ))}
        </div>
    )
}

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
