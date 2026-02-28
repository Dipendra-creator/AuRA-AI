/**
 * Sidebar navigation component — macOS-style sidebar layout.
 * Fixed width 256px with brand, nav links, team indicators, and storage.
 */

import { type ReactElement } from 'react'

interface SidebarProps {
    readonly activePage: string
    readonly onNavigate: (page: string) => void
}

interface NavItem {
    readonly id: string
    readonly label: string
    readonly icon: string
}

const mainNavItems: readonly NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'documents', label: 'Documents', icon: '📄' },
    { id: 'workflows', label: 'Workflows', icon: '🔀' },
    { id: 'ai-models', label: 'AI Models', icon: '🧠' },
    { id: 'analytics', label: 'Analytics', icon: '📈' }
]

const teamItems = [
    { label: 'Marketing', color: 'emerald' as const },
    { label: 'Legal Review', color: 'purple' as const }
]

export function Sidebar({ activePage, onNavigate }: SidebarProps): ReactElement {
    return (
        <aside className="sidebar">
            <div>
                {/* Brand */}
                <div className="sidebar-brand">
                    <div className="sidebar-brand-icon">✦</div>
                    <div className="sidebar-brand-text">
                        <h1>Aura AI</h1>
                        <p>Enterprise</p>
                    </div>
                </div>

                {/* Main Navigation */}
                <nav className="nav-section">
                    {mainNavItems.map((item) => (
                        <button
                            key={item.id}
                            className={`nav-link ${activePage === item.id ? 'active' : ''}`}
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
                    <p>Storage Usage</p>
                    <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: '65%' }} />
                    </div>
                    <small>6.5GB of 10GB used</small>
                </div>
                <button
                    className="sidebar-settings"
                    onClick={() => onNavigate('settings')}
                >
                    <span>⚙️</span>
                    <span>Settings</span>
                </button>
            </div>
        </aside>
    )
}
