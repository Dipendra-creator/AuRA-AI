/**
 * Aura AI — Root Application Component
 *
 * Manages page routing via state (not react-router for simplicity in Electron).
 * Renders sidebar + content pane layout matching macOS patterns.
 * Provides toast notification context for all pages.
 */

import { useState, type ReactElement } from 'react'
import './app.css'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Documents } from './pages/Documents'
import { Workflows } from './pages/Workflows'
import { Settings } from './pages/Settings'
import { ToastContainer, useToast, type ToastType } from './components/Toast'
import { Brain, TrendingUp } from './components/Icons'

type PageId = 'dashboard' | 'documents' | 'workflows' | 'ai-models' | 'analytics' | 'settings'

function renderPage(
  page: PageId,
  addToast: (type: ToastType, text: string) => void
): ReactElement {
  switch (page) {
    case 'dashboard':
      return <Dashboard addToast={addToast} />
    case 'documents':
      return <Documents addToast={addToast} />
    case 'workflows':
      return <Workflows addToast={addToast} />
    case 'settings':
      return <Settings />
    case 'ai-models':
      return (
        <div>
          <header className="page-header">
            <div>
              <h2>AI Models</h2>
              <p>Manage your document extraction models and training data.</p>
            </div>
          </header>
          <div className="empty-state glass-panel" style={{ padding: '64px' }}>
            <span className="empty-state-icon"><Brain size={32} /></span>
            <h3>Coming Soon</h3>
            <p>AI model management and training will be available in a future release.</p>
          </div>
        </div>
      )
    case 'analytics':
      return (
        <div>
          <header className="page-header">
            <div>
              <h2>Analytics</h2>
              <p>Insights and performance metrics for your document workflows.</p>
            </div>
          </header>
          <div className="empty-state glass-panel" style={{ padding: '64px' }}>
            <span className="empty-state-icon"><TrendingUp size={32} /></span>
            <h3>Coming Soon</h3>
            <p>Advanced analytics dashboards will be available in a future release.</p>
          </div>
        </div>
      )
    default:
      return <Dashboard addToast={addToast} />
  }
}

export default function App(): ReactElement {
  const [activePage, setActivePage] = useState<PageId>('dashboard')
  const { toasts, addToast, dismissToast } = useToast()

  return (
    <div className="app-layout">
      <Sidebar activePage={activePage} onNavigate={(page) => setActivePage(page as PageId)} />
      <main className="main-content">
        {renderPage(activePage, addToast)}
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
