/**
 * Sidebar navigation component — macOS-style sidebar layout.
 * Fixed width with brand, nav links, team indicators, and storage.
 * Matches the aura_ai_dashboard_overview design.
 */

import { type ReactElement, type ReactNode } from 'react'
import { LayoutDashboard, FileText, GitBranch, Diamond, Link, Sparkles, Settings, Download } from './Icons'
import type { AuthUser } from '../contexts/AuthContext'

interface SidebarProps {
  readonly activePage: string
  readonly onNavigate: (page: string) => void
  readonly onLogout?: () => void
  readonly user?: AuthUser | null
}

interface NavItem {
  readonly id: string
  readonly label: string
  readonly icon: ReactNode
}

const mainNavItems: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'documents', label: 'Documents', icon: <FileText size={18} /> },
  { id: 'workflows', label: 'Pipelines', icon: <GitBranch size={18} /> },
  { id: 'downloads', label: 'Downloads', icon: <Download size={18} /> },
  { id: 'ai-models', label: 'Templates', icon: <Diamond size={18} /> },
  { id: 'analytics', label: 'API', icon: <Link size={18} /> }
]

const teamItems = [
  { label: 'Marketing', color: 'emerald' as const },
  { label: 'Legal Review', color: 'purple' as const }
]

export function Sidebar({ activePage, onNavigate, onLogout, user }: SidebarProps): ReactElement {
  return (
    <aside className="sidebar">
      <div>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Sparkles size={20} />
          </div>
          <div className="sidebar-brand-text">
            <h1>Aura AI</h1>
            <p>Automation</p>
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="nav-section">
          {mainNavItems.map((item, index) => (
            <button
              key={item.id}
              className={`nav-link ${activePage === item.id ? 'active' : ''} nav-link-animate`}
              style={{ animationDelay: `${index * 40}ms` }}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-link-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Team Section */}
        <div>
          <p className="nav-section-label">Team</p>
          <div className="nav-section">
            {teamItems.map((team) => (
              <button key={team.label} className="nav-link">
                <span className={`team-dot ${team.color}`} />
                <span>{team.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div>
        <div className="storage-indicator">
          <p>Usage Limit</p>
          <div className="progress-bar">
            <div
              className="progress-bar-fill animate-bar-fill"
              style={{ '--target-width': '75%' } as React.CSSProperties}
            />
          </div>
          <small>7,500 / 10,000 docs</small>
        </div>
        <button className="sidebar-settings" onClick={() => onNavigate('settings')}>
          <span>
            <Settings size={16} />
          </span>
          <span>Settings</span>
        </button>
        {user && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              ) : (
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: 'rgba(33,213,237,0.15)', border: '1px solid rgba(33,213,237,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 600, color: '#21d5ed'
                }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 500, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
                <p style={{ margin: 0, fontSize: '10px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
              </div>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                style={{
                  width: '100%', padding: '6px 8px', background: 'rgba(220,38,38,0.08)',
                  border: '1px solid rgba(220,38,38,0.15)', borderRadius: '6px',
                  color: '#f87171', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit'
                }}
              >
                Sign Out
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
