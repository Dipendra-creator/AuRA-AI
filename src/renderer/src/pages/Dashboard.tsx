/**
 * Dashboard page — main overview screen.
 * Stats grid (4 cards), AI accuracy chart, activity timeline, recent activity table,
 * file upload zone, and floating AI assistant.
 * Data sourced from Go backend API with mock data fallback.
 */

import { useState, useEffect, useCallback, type ReactElement } from 'react'
import { StatCard } from '../components/StatCard'
import { FileDropZone } from '../components/FileDropZone'
import { DataTable } from '../components/DataTable'
import { AccuracyChart } from '../components/AccuracyChart'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { getDashboardData, uploadDocument, type DashboardDataBundle } from '../data/data-service'
import type { ToastType } from '../components/Toast'
import { FileText, CheckCircle, Clock, Zap, Bell, Sparkles } from '../components/Icons'

interface DashboardProps {
    readonly addToast: (type: ToastType, text: string) => void
}

export function Dashboard({ addToast }: DashboardProps): ReactElement {
    const [showBubble, setShowBubble] = useState(true)
    const [data, setData] = useState<DashboardDataBundle | null>(null)
    const [loading, setLoading] = useState(true)

    const loadData = useCallback(() => {
        getDashboardData().then((result) => {
            setData(result)
            setLoading(false)
        })
    }, [])

    useEffect(() => {
        loadData()
        // Auto-refresh every 30 seconds
        const interval = setInterval(loadData, 30_000)
        return () => clearInterval(interval)
    }, [loadData])

    const handleFilesSelected = useCallback(
        async (files: FileList) => {
            for (const file of Array.from(files)) {
                try {
                    await uploadDocument(file)
                    addToast('success', `Uploaded "${file.name}" successfully`)
                } catch (err) {
                    addToast('error', `Failed to upload "${file.name}": ${err instanceof Error ? err.message : 'Unknown error'}`)
                }
            }
            // Refresh dashboard after uploads
            loadData()
        },
        [addToast, loadData]
    )

    if (loading || !data) {
        return <LoadingSpinner message="Loading dashboard..." />
    }

    const { stats, chartData, activityTimeline, recentDocuments } = data

    return (
        <>
            {/* Header */}
            <header className="page-header">
                <div>
                    <h2>Overview</h2>
                    <p>
                        Good morning, Alex. Aura AI is performing at {stats.accuracyRate}% accuracy today.
                    </p>
                </div>
                <div className="user-chip">
                    <button className="notification-bell">
                        <Bell size={18} />
                        <span className="notification-dot" />
                    </button>
                    <div className="user-divider" />
                    <div className="user-profile">
                        <div className="user-avatar">AR</div>
                        <span className="user-name">Alex Rivers</span>
                    </div>
                </div>
            </header>

            {/* Stats Grid — 4 cards per design */}
            <div className="stats-grid">
                <StatCard
                    icon={<FileText size={20} />}
                    label="Total Documents"
                    value={stats.totalDocuments.toLocaleString()}
                    change={stats.documentsProcessedChange}
                    glowColor="cyan"
                    iconColor="cyan"
                />
                <StatCard
                    icon={<CheckCircle size={20} />}
                    label="Accuracy %"
                    value={`${stats.accuracyRate}%`}
                    change={stats.accuracyChange}
                    glowColor="purple"
                    iconColor="purple"
                />
                <StatCard
                    icon={<Clock size={20} />}
                    label="Avg. Processing Time"
                    value={`${stats.avgProcessingTime}s`}
                    change={stats.processingTimeChange}
                    glowColor="cyan"
                    iconColor="cyan"
                />
                <StatCard
                    icon={<Zap size={20} />}
                    label="Active Pipelines"
                    value={String(stats.activePipelines)}
                    change={stats.pipelinesChange}
                    glowColor="emerald"
                    iconColor="emerald"
                    isStatic={stats.pipelinesChange === 0}
                />
            </div>

            {/* Chart + Timeline row */}
            <div className="dashboard-middle-row">
                <AccuracyChart data={chartData} />
                <ActivityTimeline events={activityTimeline} />
            </div>

            {/* Upload Zone */}
            <FileDropZone onFilesSelected={handleFilesSelected} />

            {/* Recent Activity Table */}
            <DataTable documents={recentDocuments} title="Recent Documents" showViewAll />

            {/* Floating AI Assistant */}
            <div className="ai-assistant">
                {showBubble && (
                    <div
                        className="ai-assistant-bubble glass-panel"
                        onClick={() => setShowBubble(false)}
                    >
                        <p>
                            I&apos;ve detected <span className="highlight">3 anomalies</span> in your legal
                            documents. Would you like to review them now?
                        </p>
                    </div>
                )}
                <button
                    className="ai-assistant-btn"
                    onClick={() => setShowBubble(!showBubble)}
                    title="AI Assistant"
                >
                    <Sparkles size={22} />
                </button>
            </div>
        </>
    )
}
