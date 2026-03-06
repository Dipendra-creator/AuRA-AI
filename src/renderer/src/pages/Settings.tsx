/**
 * Settings page — app configuration and backend connection status.
 * Checks real backend health on mount.
 */

import { useState, useEffect, type ReactElement } from 'react'
import { checkBackendHealth, type HealthStatus } from '../data/data-service'

function getStatusDisplay(
  isLoading: boolean,
  isConnected: boolean,
  health: HealthStatus | null | undefined
): string {
  if (isLoading) return '...'
  if (isConnected && health) return health.status
  return 'Unreachable'
}

function getMongoStatusText(isLoading: boolean, isConnected: boolean): string {
  if (isLoading) return 'Checking...'
  if (isConnected) return 'Connected'
  return 'Disconnected'
}

export function Settings(): ReactElement {
  const [health, setHealth] = useState<HealthStatus | null | undefined>(undefined) // undefined = loading

  useEffect(() => {
    checkBackendHealth().then(setHealth)
  }, [])

  const isConnected = health !== null && health !== undefined
  const isLoading = health === undefined

  return (
    <>
      {/* Header */}
      <header className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Configure your Aura AI workspace and preferences.</p>
        </div>
      </header>

      {/* Backend Connection */}
      <div className="settings-section">
        <h3>Backend Server</h3>
        <div className="settings-card glass-panel">
          <div className="settings-row">
            <span className="settings-label">Go API Server</span>
            <div className="settings-status">
              {isLoading ? (
                <span style={{ color: 'var(--color-text-secondary)' }}>Checking...</span>
              ) : (
                <>
                  <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
                  <span
                    style={{
                      color: isConnected
                        ? 'var(--color-accent-emerald)'
                        : 'var(--color-accent-red, #ef4444)'
                    }}
                  >
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">API Base URL</span>
            <span className="settings-value">http://localhost:8080/api/v1</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Status</span>
            <span className="settings-value">
              {getStatusDisplay(isLoading, isConnected, health)}
            </span>
          </div>
          {isConnected && health.database && (
            <div className="settings-row">
              <span className="settings-label">Database</span>
              <span className="settings-value">{health.database}</span>
            </div>
          )}
        </div>
      </div>

      {/* Database Connection */}
      <div className="settings-section">
        <h3>Database Connection</h3>
        <div className="settings-card glass-panel">
          <div className="settings-row">
            <span className="settings-label">MongoDB</span>
            <div className="settings-status">
              <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
              <span
                style={{
                  color: isConnected
                    ? 'var(--color-accent-emerald)'
                    : 'var(--color-accent-red, #ef4444)'
                }}
              >
                {getMongoStatusText(isLoading, isConnected)}
              </span>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">Connection URI</span>
            <span className="settings-value">mongodb://localhost:27017</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Database</span>
            <span className="settings-value">
              {isConnected && health.database ? health.database : 'aura_ai'}
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Collection</span>
            <span className="settings-value">documents</span>
          </div>
        </div>
      </div>

      {/* AI Configuration */}
      <div className="settings-section">
        <h3>AI Configuration</h3>
        <div className="settings-card glass-panel">
          <div className="settings-row">
            <span className="settings-label">AI Core Version</span>
            <span className="settings-value">v3.4</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Model</span>
            <span className="settings-value">Stable Model 4.2</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">OCR Engine</span>
            <div className="settings-status">
              <span className="status-dot connected" />
              <span style={{ color: 'var(--color-accent-emerald)' }}>Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* General */}
      <div className="settings-section">
        <h3>General</h3>
        <div className="settings-card glass-panel">
          <div className="settings-row">
            <span className="settings-label">Theme</span>
            <span className="settings-value">Dark</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Language</span>
            <span className="settings-value">English</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Auto-update</span>
            <span className="settings-value">Enabled</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Version</span>
            <span className="settings-value">1.0.0</span>
          </div>
        </div>
      </div>
    </>
  )
}
