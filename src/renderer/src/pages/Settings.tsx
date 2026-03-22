/**
 * Settings page — app configuration, backend connection status, and user profile management.
 * Checks real backend health on mount. Allows authenticated users to update their profile.
 */

import { useState, useEffect, useCallback, type ReactElement, type FormEvent } from 'react'
import { checkBackendHealth, type HealthStatus } from '../data/data-service'
import { useAuth } from '../contexts/AuthContext'

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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ── Shared input style ────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '8px',
  color: '#f1f5f9',
  fontSize: '14px',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 180ms ease-out',
  boxSizing: 'border-box' as const
}


// ── Profile Section ───────────────────────────────────────────────────────────

function ProfileSection(): ReactElement {
  const { user, updateProfile, changePassword } = useAuth()

  // Profile form state
  const [name, setName] = useState(user?.name ?? '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Password form state (local accounts only)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Sync name field if user context updates
  useEffect(() => {
    if (user?.name) setName(user.name)
  }, [user?.name])

  const handleProfileSave = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = name.trim()
      if (!trimmed) {
        setProfileMsg({ type: 'error', text: 'Name cannot be empty.' })
        return
      }
      setProfileSaving(true)
      setProfileMsg(null)
      try {
        await updateProfile({ name: trimmed })
        setProfileMsg({ type: 'success', text: 'Profile updated successfully.' })
      } catch (err) {
        setProfileMsg({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to update profile.'
        })
      } finally {
        setProfileSaving(false)
      }
    },
    [name, updateProfile]
  )

  const handlePasswordChange = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (newPw !== confirmPw) {
        setPwMsg({ type: 'error', text: 'New passwords do not match.' })
        return
      }
      if (newPw.length < 8) {
        setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' })
        return
      }
      setPwSaving(true)
      setPwMsg(null)
      try {
        await changePassword(currentPw, newPw)
        setPwMsg({ type: 'success', text: 'Password changed successfully.' })
        setCurrentPw('')
        setNewPw('')
        setConfirmPw('')
      } catch (err) {
        setPwMsg({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to change password.'
        })
      } finally {
        setPwSaving(false)
      }
    },
    [currentPw, newPw, confirmPw, changePassword]
  )

  if (!user) return <></>

  const isLocal = user.provider === 'local'

  return (
    <>
      {/* Profile */}
      <div className="settings-section">
        <h3>Profile</h3>
        <div className="settings-card glass-panel">
          {/* Avatar + identity */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              padding: '16px 0 20px',
              borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  border: '2px solid rgba(33,213,237,0.2)',
                  objectFit: 'cover',
                  flexShrink: 0
                }}
              />
            ) : (
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(33,213,237,0.1)',
                  border: '2px solid rgba(33,213,237,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#21d5ed',
                  flexShrink: 0
                }}
              >
                {getInitials(user.name)}
              </div>
            )}
            <div>
              <p
                style={{
                  margin: 0,
                  fontWeight: 600,
                  fontSize: '15px',
                  color: '#f1f5f9'
                }}
              >
                {user.name}
              </p>
              <p style={{ margin: '2px 0 6px', fontSize: '12px', color: '#64748b' }}>{user.email}</p>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 10px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: isLocal
                    ? 'rgba(33,213,237,0.08)'
                    : 'rgba(168,85,247,0.1)',
                  border: isLocal
                    ? '1px solid rgba(33,213,237,0.2)'
                    : '1px solid rgba(168,85,247,0.2)',
                  color: isLocal ? '#21d5ed' : '#a855f7'
                }}
              >
                {isLocal ? '⚙ Local account' : '⌥ GitHub account'}
              </span>
            </div>
          </div>

          {/* Edit name form */}
          <form onSubmit={handleProfileSave}>
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <label
                style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}
                htmlFor="settings-name"
              >
                Display Name
              </label>
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                <input
                  id="settings-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                  placeholder="Your display name"
                  maxLength={80}
                />
                <button
                  type="submit"
                  disabled={profileSaving || name.trim() === user.name}
                  style={{
                    padding: '8px 18px',
                    background: profileSaving || name.trim() === user.name
                      ? 'rgba(33,213,237,0.05)'
                      : 'rgba(33,213,237,0.12)',
                    border: '1px solid rgba(33,213,237,0.2)',
                    borderRadius: '8px',
                    color: profileSaving || name.trim() === user.name ? '#475569' : '#21d5ed',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: profileSaving || name.trim() === user.name ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                    transition: 'all 180ms ease-out',
                    flexShrink: 0
                  }}
                >
                  {profileSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {profileMsg && (
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: profileMsg.type === 'success' ? '#10b981' : '#f87171'
                  }}
                >
                  {profileMsg.text}
                </p>
              )}
            </div>

            <div className="settings-row">
              <span className="settings-label">Email</span>
              <span className="settings-value">{user.email}</span>
            </div>
          </form>
        </div>
      </div>

      {/* Password change — local accounts only */}
      {isLocal && (
        <div className="settings-section">
          <h3>Security</h3>
          <div className="settings-card glass-panel">
            <form onSubmit={handlePasswordChange}>
              <div
                className="settings-row"
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}
              >
                <label
                  style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}
                  htmlFor="settings-current-pw"
                >
                  Change Password
                </label>
                <input
                  id="settings-current-pw"
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  style={inputStyle}
                  placeholder="Current password"
                  autoComplete="current-password"
                />
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  style={inputStyle}
                  placeholder="New password (min 8 characters)"
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  style={inputStyle}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    type="submit"
                    disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                    style={{
                      padding: '8px 18px',
                      background:
                        pwSaving || !currentPw || !newPw || !confirmPw
                          ? 'rgba(33,213,237,0.05)'
                          : 'rgba(33,213,237,0.12)',
                      border: '1px solid rgba(33,213,237,0.2)',
                      borderRadius: '8px',
                      color:
                        pwSaving || !currentPw || !newPw || !confirmPw ? '#475569' : '#21d5ed',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor:
                        pwSaving || !currentPw || !newPw || !confirmPw ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 180ms ease-out'
                    }}
                  >
                    {pwSaving ? 'Updating…' : 'Update Password'}
                  </button>
                  {pwMsg && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '12px',
                        color: pwMsg.type === 'success' ? '#10b981' : '#f87171'
                      }}
                    >
                      {pwMsg.text}
                    </p>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main Settings Component ───────────────────────────────────────────────────

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

      {/* Profile & Security (top priority — P0) */}
      <ProfileSection />

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
