/**
 * Dashboard page — main overview screen.
 * Stats grid, file upload zone, recent activity table, and AI assistant.
 */

import { useState, useEffect, useCallback, type ReactElement } from 'react'
import { StatCard } from '../components/StatCard'
import { FileDropZone } from '../components/FileDropZone'
import { DataTable } from '../components/DataTable'
import type { AuraDocument, DashboardStats } from '../../../shared/types/document.types'

export function Dashboard(): ReactElement {
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [documents, setDocuments] = useState<AuraDocument[]>([])
    const [showBubble, setShowBubble] = useState(true)

    const loadData = useCallback(async () => {
        try {
            const statsResult = await window.documentAPI.getStats()
            if (statsResult.success) {
                setStats(statsResult.data)
            }

            const docsResult = await window.documentAPI.list()
            if (docsResult.success) {
                setDocuments(docsResult.data)
            }
        } catch {
            console.warn('[Dashboard] Failed to load data — running in offline mode')
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleFilesSelected = useCallback(
        async (files: FileList) => {
            for (const file of Array.from(files)) {
                try {
                    await window.documentAPI.create({
                        name: file.name,
                        type: 'other',
                        mimeType: file.type as 'application/pdf',
                        filePath: file.name,
                        fileSize: file.size
                    })
                } catch {
                    console.error('[Dashboard] Failed to create document for', file.name)
                }
            }
            loadData()
        },
        [loadData]
    )

    return (
        <>
            {/* Header */}
            <header className="page-header">
                <div>
                    <h2>Overview</h2>
                    <p>
                        Good morning, Alex. Aura AI is performing at{' '}
                        {stats ? `${stats.accuracyRate}%` : '—'} accuracy today.
                    </p>
                </div>
                <div className="user-chip">
                    <button className="notification-bell">
                        🔔
                        <span className="notification-dot" />
                    </button>
                    <div className="user-divider" />
                    <div className="user-profile">
                        <div className="user-avatar">AR</div>
                        <span className="user-name">Alex Rivers</span>
                    </div>
                </div>
            </header>

            {/* Stats Grid */}
            <div className="stats-grid">
                <StatCard
                    icon="📄"
                    label="Documents Processed"
                    value={stats ? stats.totalDocuments.toLocaleString() : '—'}
                    change={stats?.documentsProcessedChange ?? 0}
                    glowColor="cyan"
                    iconColor="cyan"
                />
                <StatCard
                    icon="✓"
                    label="Accuracy Rate"
                    value={stats ? `${stats.accuracyRate}%` : '—'}
                    change={stats?.accuracyChange ?? 0}
                    glowColor="purple"
                    iconColor="purple"
                />
                <StatCard
                    icon="⏱"
                    label="Manual Time Saved"
                    value={stats ? `${stats.manualTimeSaved} hrs` : '—'}
                    change={stats?.timeSavedChange ?? 0}
                    glowColor="cyan"
                    iconColor="cyan"
                />
            </div>

            {/* Upload Zone */}
            <FileDropZone onFilesSelected={handleFilesSelected} />

            {/* Recent Activity Table */}
            <DataTable documents={documents} />

            {/* Floating AI Assistant */}
            <div className="ai-assistant">
                {showBubble && (
                    <div
                        className="ai-assistant-bubble glass-panel"
                        onClick={() => setShowBubble(false)}
                    >
                        <p>
                            I&apos;ve detected <span className="highlight">3 anomalies</span>{' '}
                            in your legal documents. Would you like to review them now?
                        </p>
                    </div>
                )}
                <button
                    className="ai-assistant-btn"
                    onClick={() => setShowBubble(!showBubble)}
                    title="AI Assistant"
                >
                    ✦
                </button>
            </div>
        </>
    )
}
