/**
 * DataTable — glassmorphism document activity table.
 * Displays documents with status badges, processing steps, confidence bars, dates, and actions.
 */

import { type ReactElement, type ReactNode } from 'react'
import type { AuraDocument } from '../../../shared/types/document.types'
import {
  FileText,
  Image,
  File,
  FileSearch,
  Brain,
  CheckCircle,
  XCircle,
  Trash2,
  MoreVertical
} from './Icons'

interface DataTableProps {
  readonly documents: readonly AuraDocument[]
  readonly title?: string
  readonly showViewAll?: boolean
  readonly onViewAll?: () => void
  readonly onDocumentClick?: (doc: AuraDocument) => void
  readonly onDocumentDelete?: (doc: AuraDocument) => void
}

/** Maps mime type to document icon */
function getDocumentIcon(mimeType: string): ReactNode {
  if (mimeType.includes('pdf')) return <FileText size={16} className="icon-pdf" />
  if (mimeType.includes('image')) return <Image size={16} className="icon-image" />
  if (mimeType.includes('word')) return <FileText size={16} className="icon-word" />
  return <File size={16} />
}

/** Maps document type to readable label */
function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    invoice: 'Invoice',
    contract: 'Contract',
    receipt: 'Receipt',
    expense: 'Expense',
    other: 'Document'
  }
  return map[type] ?? 'Document'
}

/** Returns confidence level class name */
function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 90) return 'high'
  if (confidence >= 70) return 'medium'
  return 'low'
}

/** Formats ISO date to readable format */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Maps processing step to a user-friendly label with icon */
function getProcessingStepLabel(step: string): ReactNode {
  const map: Record<string, ReactNode> = {
    extracting_text: (
      <>
        <FileSearch size={14} /> Extracting text...
      </>
    ),
    ai_analysis: (
      <>
        <Brain size={14} /> AI analyzing...
      </>
    ),
    complete: (
      <>
        <CheckCircle size={14} /> Complete
      </>
    ),
    failed: (
      <>
        <XCircle size={14} /> Failed
      </>
    )
  }
  return map[step] ?? ''
}

/** Renders the status cell — shows processing step with animation when processing */
function StatusCell({ doc }: { doc: AuraDocument }): ReactElement {
  if (doc.status === 'processing' && doc.processingStep) {
    return (
      <div className="status-processing-cell">
        <span className="status-badge processing">
          <span className="processing-spinner" />
          PROCESSING
        </span>
        <span className="processing-step-label">{getProcessingStepLabel(doc.processingStep)}</span>
      </div>
    )
  }

  return <span className={`status-badge ${doc.status}`}>{doc.status.toUpperCase()}</span>
}

export function DataTable({
  documents,
  title = 'Recent Activity',
  showViewAll = false,
  onViewAll,
  onDocumentClick,
  onDocumentDelete
}: DataTableProps): ReactElement {
  return (
    <section className="animate-fade-in">
      <div className="table-header">
        <h4>{title}</h4>
        {(showViewAll || onViewAll) && (
          <button className="table-view-all" onClick={onViewAll}>
            View all
          </button>
        )}
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc, index) => (
              <tr
                key={doc._id}
                className={`table-row-animate ${doc.status === 'processing' ? 'row-processing' : ''}`}
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => onDocumentClick?.(doc)}
              >
                <td>
                  <div className="document-name-cell">
                    <span className="document-icon">{getDocumentIcon(doc.mimeType)}</span>
                    <span className="document-filename">{doc.name}</span>
                  </div>
                </td>
                <td>
                  <span className="document-type-label">{getTypeLabel(doc.type)}</span>
                </td>
                <td>
                  <StatusCell doc={doc} />
                </td>
                <td>
                  {doc.status === 'processing' ? (
                    <span className="confidence-value" style={{ opacity: 0.4 }}>
                      —
                    </span>
                  ) : (
                    <div className="confidence-cell">
                      <div className="confidence-bar">
                        <div
                          className={`confidence-bar-fill ${getConfidenceLevel(doc.confidence)} animate-bar-fill`}
                          style={{ '--target-width': `${doc.confidence}%` } as React.CSSProperties}
                        />
                      </div>
                      <span className="confidence-value">{doc.confidence}%</span>
                    </div>
                  )}
                </td>
                <td className="date-cell">{formatDate(doc.createdAt)}</td>
                <td className="actions-cell">
                  {onDocumentDelete && (
                    <button
                      className="actions-btn actions-btn-delete"
                      title="Delete document"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDocumentDelete(doc)
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button className="actions-btn" title="More actions">
                    <MoreVertical size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '48px' }}>
                  <div className="empty-state">
                    <span className="empty-state-icon">
                      <FileText size={32} />
                    </span>
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
