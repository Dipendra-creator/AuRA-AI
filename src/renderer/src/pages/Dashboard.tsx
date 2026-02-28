/**
 * Dashboard page — main overview screen.
 * Stats grid (4 cards), AI accuracy chart, activity timeline, recent activity table,
 * file upload zone, and floating AI assistant.
 * Data sourced from mock data service.
 */

import { useState, useMemo, type ReactElement } from 'react'
import { StatCard } from '../components/StatCard'
import { FileDropZone } from '../components/FileDropZone'
import { DataTable } from '../components/DataTable'
import { AccuracyChart } from '../components/AccuracyChart'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { getDashboardData } from '../data/mock-data.service'

export function Dashboard(): ReactElement {
    const [showBubble, setShowBubble] = useState(true)

    const { stats, chartData, activityTimeline, recentDocuments } = useMemo(
        () => getDashboardData(),
        []
    )

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

            {/* Stats Grid — 4 cards per design */}
            <div className="stats-grid">
                <StatCard
                    icon="📄"
                    label="Total Documents"
                    value={stats.totalDocuments.toLocaleString()}
                    change={stats.documentsProcessedChange}
                    glowColor="cyan"
                    iconColor="cyan"
                />
                <StatCard
                    icon="✓"
                    label="Accuracy %"
                    value={`${stats.accuracyRate}%`}
                    change={stats.accuracyChange}
                    glowColor="purple"
                    iconColor="purple"
                />
                <StatCard
                    icon="⏱"
                    label="Avg. Processing Time"
                    value={`${stats.avgProcessingTime}s`}
                    change={stats.processingTimeChange}
                    glowColor="cyan"
                    iconColor="cyan"
                />
                <StatCard
                    icon="⚡"
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
            <FileDropZone />

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
                    ✦
                </button>
            </div>
        </>
    )
}
