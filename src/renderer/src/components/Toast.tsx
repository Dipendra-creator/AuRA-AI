/**
 * Toast — lightweight notification component for success/error feedback.
 * Shows at top-right, auto-dismisses after 4s, supports stacking.
 */

import { useEffect, type ReactElement } from 'react'
import { CheckCircle, XCircle, Info, X } from './Icons'

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

function getToastIcon(type: ToastType): ReactElement {
  switch (type) {
    case 'success':
      return <CheckCircle size={16} />
    case 'error':
      return <XCircle size={16} />
    case 'info':
      return <Info size={16} />
  }
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

  return (
    <div className={`toast toast-${toast.type} animate-slide-in-right`}>
      <span className="toast-icon">{getToastIcon(toast.type)}</span>
      <span className="toast-text">{toast.text}</span>
      <button className="toast-close" onClick={() => onDismiss(toast.id)}>
        <X size={14} />
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
