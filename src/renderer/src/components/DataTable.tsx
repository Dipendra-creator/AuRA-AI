/**
 * DataTable — glassmorphism document activity table.
 * Displays documents with status badges, confidence bars, and actions.
 */

import { type ReactElement } from 'react'
import type { AuraDocument } from '../../../shared/types/document.types'

interface DataTableProps {
    readonly documents: readonly AuraDocument[]
    readonly title?: string
    readonly onViewAll?: () => void
}

function getDocumentIcon(mimeType: string): string {
    if (mimeType.includes('pdf')) return '📕'
    if (mimeType.includes('image')) return '🖼️'
    if (mimeType.includes('word')) return '📘'
    return '📄'
}

function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 90) return 'high'
    if (confidence >= 70) return 'medium'
    return 'low'
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} mins ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
}

export function DataTable({
    documents,
    title = 'Recent Activity',
    onViewAll
}: DataTableProps): ReactElement {
    return (
        <section>
            <div className="table-header">
                <h4>{title}</h4>
                {onViewAll && <button onClick={onViewAll}>View All Documents</button>}
            </div>

            <div className="glass-panel" style={{ overflow: 'hidden' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Document Name</th>
                            <th>Status</th>
                            <th>Confidence</th>
                            <th>Date</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {documents.map((doc) => (
                            <tr key={doc._id}>
                                <td>
                                    <div className="document-name-cell">
                                        <span className="document-icon">
                                            {getDocumentIcon(doc.mimeType)}
                                        </span>
                                        <span className="document-filename">{doc.name}</span>
                                    </div>
                                </td>
                                <td>
                                    <span className={`status-badge ${doc.status}`}>
                                        {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                                    </span>
                                </td>
                                <td>
                                    <div className="confidence-cell">
                                        <div className="confidence-bar">
                                            <div
                                                className={`confidence-bar-fill ${getConfidenceLevel(doc.confidence)}`}
                                                style={{ width: `${doc.confidence}%` }}
                                            />
                                        </div>
                                        <span className="confidence-value">{doc.confidence}%</span>
                                    </div>
                                </td>
                                <td className="date-cell">
                                    {formatRelativeTime(doc.createdAt)}
                                </td>
                                <td className="actions-cell">
                                    <button className="actions-btn" title="More actions">⋯</button>
                                </td>
                            </tr>
                        ))}
                        {documents.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '48px' }}>
                                    <div className="empty-state">
                                        <span className="empty-state-icon">📄</span>
                                        <h3>No documents yet</h3>
                                        <p>Upload your first document to get started with AI-powered extraction.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
