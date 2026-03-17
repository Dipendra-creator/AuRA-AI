/**
 * MockDataBanner — shown when the app is displaying mock/fallback data
 * instead of real backend data. Provides clear visual indicator of degraded mode.
 */

import { useState, useEffect, type ReactElement } from 'react'
import { isMockActive } from '../data/data-service'

export function MockDataBanner(): ReactElement | null {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Poll every 2 seconds to detect if mock fallback was activated
    const check = (): void => {
      if (isMockActive()) setVisible(true)
    }
    check()
    const interval = setInterval(check, 2000)
    return () => clearInterval(interval)
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 18px',
        background: 'rgba(251, 191, 36, 0.1)',
        border: '1px solid rgba(251, 191, 36, 0.3)',
        borderRadius: '10px',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        maxWidth: '480px',
        width: 'calc(100vw - 32px)'
      }}
    >
      <span style={{ fontSize: '16px' }}>⚠</span>
      <div style={{ flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            fontWeight: 600,
            color: '#fbbf24'
          }}
        >
          Degraded mode — showing demo data
        </p>
        <p
          style={{
            margin: '2px 0 0',
            fontSize: '11px',
            color: '#94a3b8'
          }}
        >
          Backend is unreachable. Data shown is not real. Start the Go API server to restore live
          data.
        </p>
      </div>
      <button
        onClick={() => setVisible(false)}
        style={{
          background: 'none',
          border: 'none',
          color: '#64748b',
          cursor: 'pointer',
          fontSize: '16px',
          padding: '0',
          lineHeight: 1,
          flexShrink: 0
        }}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
