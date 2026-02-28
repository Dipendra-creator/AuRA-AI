/**
 * Loading spinner component — matches the dark glassmorphism design.
 * Use when async data is being fetched from the API.
 */

import type { ReactElement } from 'react'

interface LoadingSpinnerProps {
    readonly message?: string
}

export function LoadingSpinner({ message = 'Loading...' }: LoadingSpinnerProps): ReactElement {
    return (
        <div className="loading-container">
            <div className="loading-spinner">
                <div className="spinner-ring" />
                <div className="spinner-ring spinner-ring-inner" />
                <span className="spinner-icon">✦</span>
            </div>
            <p className="loading-message">{message}</p>
        </div>
    )
}
