/**
 * AuthPage — Login / Register screen for Aura AI.
 *
 * Tabs: Sign In | Create Account
 * SSO:  GitHub OAuth button
 */

import { useState, type FormEvent, type ReactElement } from 'react'
import { useAuth } from '../contexts/AuthContext'

type Tab = 'login' | 'register'

export function AuthPage(): ReactElement {
  const { login, register, loginWithGitHub } = useAuth()
  const [tab, setTab] = useState<Tab>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [githubLoading, setGitHubLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        await register(name, email, password)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleGitHub() {
    setError('')
    setGitHubLoading(true)
    try {
      await loginWithGitHub()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'GitHub authentication failed')
    } finally {
      setGitHubLoading(false)
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Logo / Brand */}
        <div style={styles.brand}>
          <div style={styles.logoMark}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="#21d5ed" strokeWidth="2" />
              <path
                d="M10 20 L16 10 L22 20"
                stroke="#21d5ed"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="16" cy="20" r="2" fill="#a855f7" />
            </svg>
          </div>
          <h1 style={styles.brandName}>Aura AI</h1>
          <p style={styles.brandTagline}>Intelligent document processing</p>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'login' ? styles.tabActive : {}) }}
            onClick={() => {
              setTab('login')
              setError('')
            }}
          >
            Sign In
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'register' ? styles.tabActive : {}) }}
            onClick={() => {
              setTab('register')
              setError('')
            }}
          >
            Create Account
          </button>
        </div>

        {/* GitHub SSO */}
        <button style={styles.githubBtn} onClick={handleGitHub} disabled={githubLoading || loading}>
          <GitHubIcon />
          <span>{githubLoading ? 'Redirecting...' : 'Continue with GitHub'}</span>
        </button>

        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {tab === 'register' && (
            <div style={styles.field}>
              <label style={styles.label}>Full Name</label>
              <input
                style={styles.input}
                type="text"
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder={tab === 'register' ? 'Minimum 8 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <button type="submit" style={styles.submitBtn} disabled={loading || githubLoading}>
            {loading ? 'Please wait...' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p style={styles.footerNote}>
          By continuing, you agree to Aura AI&apos;s Terms of Service.
        </p>
      </div>
    </div>
  )
}

function GitHubIcon(): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.303 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--color-bg-dark, #0f172a)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    // Subtle radial glow
    backgroundImage:
      'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(33,213,237,0.08) 0%, transparent 70%)'
  },
  card: {
    background: 'rgba(30,41,59,0.8)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '16px',
    padding: '40px 36px',
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)'
  },
  brand: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px'
  },
  logoMark: {
    width: '52px',
    height: '52px',
    background: 'rgba(33,213,237,0.08)',
    border: '1px solid rgba(33,213,237,0.2)',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4px'
  },
  brandName: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#f1f5f9',
    margin: 0,
    letterSpacing: '-0.3px'
  },
  brandTagline: {
    fontSize: '13px',
    color: '#64748b',
    margin: 0
  },
  tabs: {
    display: 'flex',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '10px',
    padding: '3px',
    gap: '2px'
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: '#64748b',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit'
  },
  tabActive: {
    background: 'rgba(33,213,237,0.12)',
    color: '#21d5ed',
    border: '1px solid rgba(33,213,237,0.2)'
  },
  githubBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    color: '#f1f5f9',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit'
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'rgba(255,255,255,0.07)'
  },
  dividerText: {
    fontSize: '12px',
    color: '#475569',
    whiteSpace: 'nowrap'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#94a3b8',
    letterSpacing: '0.02em'
  },
  input: {
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#f1f5f9',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s'
  },
  errorText: {
    fontSize: '13px',
    color: '#f87171',
    margin: 0,
    padding: '8px 12px',
    background: 'rgba(220,38,38,0.1)',
    border: '1px solid rgba(220,38,38,0.2)',
    borderRadius: '8px'
  },
  submitBtn: {
    padding: '11px 16px',
    background: 'linear-gradient(135deg, rgba(33,213,237,0.2), rgba(168,85,247,0.15))',
    border: '1px solid rgba(33,213,237,0.3)',
    borderRadius: '10px',
    color: '#21d5ed',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginTop: '4px',
    fontFamily: 'inherit'
  },
  footerNote: {
    textAlign: 'center',
    fontSize: '11px',
    color: '#334155',
    margin: 0
  }
}
