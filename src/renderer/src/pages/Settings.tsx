/**
 * Settings page — app configuration and database connection status.
 */

import { type ReactElement } from 'react'

export function Settings(): ReactElement {
    return (
        <>
            {/* Header */}
            <header className="page-header">
                <div>
                    <h2>Settings</h2>
                    <p>Configure your Aura AI workspace and preferences.</p>
                </div>
            </header>

            {/* Database Connection */}
            <div className="settings-section">
                <h3>Database Connection</h3>
                <div className="settings-card glass-panel">
                    <div className="settings-row">
                        <span className="settings-label">MongoDB</span>
                        <div className="settings-status">
                            <span className="status-dot connected" />
                            <span style={{ color: 'var(--color-accent-emerald)' }}>Connected</span>
                        </div>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">Connection URI</span>
                        <span className="settings-value">mongodb://localhost:27017</span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">Database</span>
                        <span className="settings-value">development</span>
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
