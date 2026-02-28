/**
 * DocumentAnalysis — split-view document analysis panel.
 * Left: Document preview placeholder. Right: Extracted data fields with confidence.
 * Matches the document_upload_analysis design.
 * Re-scan and Approve buttons now wired to the backend API.
 */

import { useState, type ReactElement } from 'react'
import type { AuraDocument } from '../../../shared/types/document.types'

interface DocumentAnalysisProps {
    readonly document: AuraDocument
    readonly onClose: () => void
    readonly onRescan?: () => void
    readonly onApprove?: () => void
}

/** Determines confidence color class */
function getConfidenceClass(confidence: number): string {
    if (confidence >= 0.9) return 'conf-high'
    if (confidence >= 0.7) return 'conf-medium'
    return 'conf-low'
}

/** Formats confidence as percentage */
function formatConfidence(confidence: number): string {
    return `${Math.round(confidence * 100)}%`
}

/** Determines confidence icon */
function getConfidenceIcon(confidence: number): string {
    if (confidence >= 0.9) return '●'
    if (confidence >= 0.7) return '!'
    return '▲'
}

export function DocumentAnalysis({ document, onClose, onRescan, onApprove }: DocumentAnalysisProps): ReactElement {
    const [rescanning, setRescanning] = useState(false)
    const [approving, setApproving] = useState(false)

    const overallConfidence = document.extractedFields.length > 0
        ? Math.round(
            (document.extractedFields.reduce((sum, f) => sum + f.confidence, 0) /
                document.extractedFields.length) *
            1000
        ) / 10
        : 0

    const handleRescan = async (): Promise<void> => {
        if (!onRescan) return
        setRescanning(true)
        try {
            onRescan()
        } finally {
            setRescanning(false)
        }
    }

    const handleApprove = async (): Promise<void> => {
        if (!onApprove) return
        setApproving(true)
        try {
            onApprove()
        } finally {
            setApproving(false)
        }
    }

    return (
        <div className="doc-analysis animate-fade-in">
            {/* Top Bar */}
            <div className="doc-analysis-topbar">
                <button className="doc-analysis-back" onClick={onClose}>
                    ← Back to Documents
                </button>
                <div className="doc-analysis-badges">
                    <span className="badge-model">STABLE MODEL 4.2</span>
                    <span className="badge-ocr">OCR ACTIVE</span>
                </div>
            </div>

            {/* Breadcrumb */}
            <div className="doc-analysis-breadcrumb">
                <span>HOME</span>
                <span className="breadcrumb-sep">›</span>
                <span>PROCESSING QUEUE</span>
                <span className="breadcrumb-sep">›</span>
                <span className="breadcrumb-active">{document.name.toUpperCase()}</span>
            </div>

            {/* Split View */}
            <div className="doc-analysis-split">
                {/* Left Pane — Document Preview */}
                <div className="doc-analysis-preview">
                    <div className="doc-preview-header">
                        <div className="doc-preview-title">
                            <span>📄</span>
                            <span>Document Preview</span>
                        </div>
                        <div className="doc-preview-zoom">
                            <button className="zoom-btn" title="Zoom Out">🔍−</button>
                            <button className="zoom-btn" title="Zoom In">🔍+</button>
                        </div>
                    </div>
                    <div className="doc-preview-body glass-panel">
                        {/* Placeholder document representation */}
                        <div className="doc-placeholder">
                            <div className="doc-placeholder-header">
                                <div className="doc-placeholder-logo" />
                                <div className="doc-placeholder-title-area">
                                    <span className="doc-placeholder-invoice-label">INVOICE</span>
                                    <div className="doc-placeholder-lines">
                                        <div className="line-short" />
                                        <div className="line-short" />
                                    </div>
                                </div>
                            </div>
                            <div className="doc-placeholder-separator" />
                            <div className="doc-placeholder-body">
                                <div className="doc-placeholder-lines">
                                    <div className="line-long" />
                                    <div className="line-medium" />
                                    <div className="line-long" />
                                    <div className="line-medium" />
                                    <div className="line-short" />
                                </div>
                                <div className="doc-placeholder-highlight" />
                                <div className="doc-placeholder-lines">
                                    <div className="line-long" />
                                    <div className="line-long" />
                                    <div className="line-medium" />
                                    <div className="line-short" />
                                </div>
                            </div>
                            <div className="doc-placeholder-footer">
                                <div className="line-medium" />
                                <div className="line-long" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Pane — Extracted Data */}
                <div className="doc-analysis-extracted">
                    <div className="extracted-header">
                        <div className="extracted-header-title">
                            <span>📊</span>
                            <h3>Extracted Data</h3>
                        </div>
                        <span className={`overall-confidence ${getConfidenceClass(overallConfidence / 100)}`}>
                            {overallConfidence}% Overall Confidence
                        </span>
                    </div>

                    <div className="extracted-fields-list">
                        {document.extractedFields.map((field, index) => (
                            <div
                                key={field.fieldName}
                                className={`extracted-field-card glass-panel ${getConfidenceClass(field.confidence)}`}
                                style={{ animationDelay: `${index * 60}ms` }}
                            >
                                <div className="field-card-header">
                                    <span className="field-label">{field.fieldName.toUpperCase()}</span>
                                    <span className={`field-confidence ${getConfidenceClass(field.confidence)}`}>
                                        <span className="conf-icon">{getConfidenceIcon(field.confidence)}</span>
                                        {formatConfidence(field.confidence)}
                                    </span>
                                </div>
                                <div className="field-card-value">
                                    <span className="field-value">{field.value}</span>
                                    <button className="field-edit-btn" title="Edit field">✏️</button>
                                </div>
                                <div className="field-confidence-bar">
                                    <div
                                        className={`confidence-bar-fill ${field.confidence >= 0.9 ? 'high' : field.confidence >= 0.7 ? 'medium' : 'low'} animate-bar-fill`}
                                        style={{ '--target-width': `${field.confidence * 100}%` } as React.CSSProperties}
                                    />
                                </div>
                                {field.confidence < 0.7 && (
                                    <p className="field-warning">
                                        OCR detected potential character overlap. Please verify manually.
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="doc-analysis-actions">
                <button className="btn-ghost action-btn">
                    ⚙️ Schema Customization
                </button>
                <button
                    className="btn-ghost action-btn"
                    onClick={handleRescan}
                    disabled={rescanning}
                >
                    {rescanning ? '⏳ Scanning...' : '🔄 Re-scan'}
                </button>
                <button className="btn-ghost action-btn" onClick={onClose}>
                    Dismiss
                </button>
                <button
                    className="btn-primary action-btn action-btn-primary"
                    onClick={handleApprove}
                    disabled={approving}
                >
                    {approving ? '⏳ Approving...' : 'Approve & Export 📤'}
                </button>
            </div>
        </div>
    )
}
