/**
 * DocumentAnalysis — split-view document analysis panel.
 * Left: PDF preview + extracted raw text.
 * Right: Extracted data fields with confidence.
 * Hover over a field highlights its value in the raw text.
 * Export to CSV/Excel supported.
 */

import { useState, useMemo, type ReactElement } from 'react'
import type { AuraDocument } from '../../../shared/types/document.types'
import { exportDocument } from '../data/data-service'

const API_BASE = 'http://localhost:8080/api/v1'

interface DocumentAnalysisProps {
    readonly document: AuraDocument
    readonly onClose: () => void
    readonly onRescan?: () => void
    readonly onApprove?: () => void
    readonly addToast?: (type: 'success' | 'error' | 'info', text: string) => void
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

/** Triggers a browser download from a Blob */
function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/** Derives the served file URL from the filePath */
function getFileUrl(filePath: string): string {
    const filename = filePath.split('/').pop() ?? filePath
    return `${API_BASE}/files/${filename}`
}

/** Highlights matched value text in the raw text */
function highlightText(rawText: string, searchValue: string): ReactElement[] {
    if (!searchValue || !rawText) return [<span key="all">{rawText}</span>]

    const parts: ReactElement[] = []
    const searchLower = searchValue.toLowerCase()
    const textLower = rawText.toLowerCase()
    let lastIndex = 0
    let idx = textLower.indexOf(searchLower)
    let keyId = 0

    while (idx !== -1) {
        if (idx > lastIndex) {
            parts.push(<span key={keyId++}>{rawText.slice(lastIndex, idx)}</span>)
        }
        parts.push(
            <mark key={keyId++} className="text-highlight">
                {rawText.slice(idx, idx + searchValue.length)}
            </mark>
        )
        lastIndex = idx + searchValue.length
        idx = textLower.indexOf(searchLower, lastIndex)
    }

    if (lastIndex < rawText.length) {
        parts.push(<span key={keyId++}>{rawText.slice(lastIndex)}</span>)
    }

    return parts.length > 0 ? parts : [<span key="all">{rawText}</span>]
}

/** Processing step map */
function getStepLabel(step: string): string {
    const map: Record<string, string> = {
        extracting_text: '📝 Extracting text from document...',
        ai_analysis: '🧠 AI is analyzing the extracted text...',
        complete: '✅ Analysis complete',
        failed: '❌ Analysis failed'
    }
    return map[step] ?? step
}

export function DocumentAnalysis({ document: doc, onClose, onRescan, onApprove, addToast }: DocumentAnalysisProps): ReactElement {
    const [rescanning, setRescanning] = useState(false)
    const [approving, setApproving] = useState(false)
    const [exportingCSV, setExportingCSV] = useState(false)
    const [exportingExcel, setExportingExcel] = useState(false)
    const [hoveredField, setHoveredField] = useState<string | null>(null)
    const [showRawText, setShowRawText] = useState(false)

    const overallConfidence = doc.extractedFields.length > 0
        ? Math.round(
            (doc.extractedFields.reduce((sum, f) => sum + f.confidence, 0) /
                doc.extractedFields.length) *
            1000
        ) / 10
        : 0

    const fileUrl = useMemo(() => getFileUrl(doc.filePath), [doc.filePath])
    const isPDF = doc.mimeType.includes('pdf')
    const isProcessing = doc.status === 'processing'

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

    const handleExport = async (format: 'csv' | 'xlsx'): Promise<void> => {
        const setLoading = format === 'csv' ? setExportingCSV : setExportingExcel
        setLoading(true)
        try {
            const blob = await exportDocument(doc._id, format)
            const ext = format === 'csv' ? 'csv' : 'xlsx'
            const baseName = doc.name.replace(/\.[^/.]+$/, '').replace(/\s+/g, '_')
            downloadBlob(blob, `${baseName}_extracted.${ext}`)
            addToast?.('success', `Exported "${doc.name}" as ${ext.toUpperCase()}`)
        } catch (err) {
            addToast?.('error', `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setLoading(false)
        }
    }

    const hasFields = doc.extractedFields.length > 0

    return (
        <div className="doc-analysis animate-fade-in">
            {/* Top Bar */}
            <div className="doc-analysis-topbar">
                <button className="doc-analysis-back" onClick={onClose}>
                    ← Back to Documents
                </button>
                <div className="doc-analysis-badges">
                    <span className="badge-model">MINIMAX M2.5</span>
                    <span className="badge-ocr">OCR ACTIVE</span>
                    {isProcessing && (
                        <span className="badge-processing">
                            <span className="processing-spinner" /> {getStepLabel(doc.processingStep)}
                        </span>
                    )}
                </div>
            </div>

            {/* Breadcrumb */}
            <div className="doc-analysis-breadcrumb">
                <span>HOME</span>
                <span className="breadcrumb-sep">›</span>
                <span>PROCESSING QUEUE</span>
                <span className="breadcrumb-sep">›</span>
                <span className="breadcrumb-active">{doc.name.toUpperCase()}</span>
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
                        {doc.rawText && (
                            <button
                                className={`btn-ghost raw-text-toggle ${showRawText ? 'active' : ''}`}
                                onClick={() => setShowRawText(!showRawText)}
                            >
                                {showRawText ? '📄 Show PDF' : '📝 Show Text'}
                            </button>
                        )}
                    </div>

                    <div className="doc-preview-body glass-panel">
                        {showRawText && doc.rawText ? (
                            /* Raw text view with highlights */
                            <div className="raw-text-panel">
                                <pre className="raw-text-content">
                                    {hoveredField
                                        ? highlightText(doc.rawText, hoveredField)
                                        : doc.rawText
                                    }
                                </pre>
                            </div>
                        ) : isPDF ? (
                            /* Actual PDF preview */
                            <embed
                                src={fileUrl}
                                type="application/pdf"
                                className="pdf-embed"
                            />
                        ) : (
                            /* Non-PDF placeholder */
                            <div className="doc-placeholder">
                                <div className="doc-placeholder-header">
                                    <div className="doc-placeholder-logo" />
                                    <div className="doc-placeholder-title-area">
                                        <span className="doc-placeholder-invoice-label">{doc.name}</span>
                                    </div>
                                </div>
                                <div className="doc-placeholder-separator" />
                                {doc.rawText && (
                                    <pre className="raw-text-content">{doc.rawText.slice(0, 2000)}</pre>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Pane — Extracted Data */}
                <div className="doc-analysis-extracted">
                    <div className="extracted-header">
                        <div className="extracted-header-title">
                            <span>📊</span>
                            <h3>Extracted Data</h3>
                        </div>
                        {hasFields && (
                            <span className={`overall-confidence ${getConfidenceClass(overallConfidence / 100)}`}>
                                {overallConfidence}% Overall Confidence
                            </span>
                        )}
                    </div>

                    {isProcessing && (
                        <div className="processing-indicator glass-panel">
                            <div className="processing-indicator-spinner" />
                            <div className="processing-indicator-text">
                                <p className="processing-indicator-step">{getStepLabel(doc.processingStep)}</p>
                                <p className="processing-indicator-hint">This may take a moment...</p>
                            </div>
                        </div>
                    )}

                    {!hasFields && !isProcessing && (
                        <div className="extracted-empty glass-panel">
                            <span className="empty-state-icon">🔍</span>
                            <p>No fields extracted yet. Click <strong>Re-scan</strong> to analyze this document with AI.</p>
                        </div>
                    )}

                    <div className="extracted-fields-list">
                        {doc.extractedFields.map((field, index) => (
                            <div
                                key={field.fieldName}
                                className={`extracted-field-card glass-panel ${getConfidenceClass(field.confidence)} ${hoveredField === field.value ? 'field-hovered' : ''}`}
                                style={{ animationDelay: `${index * 60}ms` }}
                                onMouseEnter={() => setHoveredField(field.value)}
                                onMouseLeave={() => setHoveredField(null)}
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
                    disabled={rescanning || isProcessing}
                >
                    {rescanning ? '⏳ Scanning...' : '🔄 Re-scan'}
                </button>

                {/* Export Buttons — only show when there are extracted fields */}
                {hasFields && (
                    <div className="export-btn-group">
                        <button
                            className="btn-ghost action-btn export-btn"
                            onClick={() => handleExport('csv')}
                            disabled={exportingCSV}
                        >
                            {exportingCSV ? '⏳ Exporting...' : '📄 Export CSV'}
                        </button>
                        <button
                            className="btn-ghost action-btn export-btn"
                            onClick={() => handleExport('xlsx')}
                            disabled={exportingExcel}
                        >
                            {exportingExcel ? '⏳ Exporting...' : '📊 Export Excel'}
                        </button>
                    </div>
                )}

                <button className="btn-ghost action-btn" onClick={onClose}>
                    Dismiss
                </button>
                <button
                    className="btn-primary action-btn action-btn-primary"
                    onClick={handleApprove}
                    disabled={approving || isProcessing}
                >
                    {approving ? '⏳ Approving...' : 'Approve ✓'}
                </button>
            </div>
        </div>
    )
}
