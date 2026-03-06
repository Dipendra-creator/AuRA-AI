/**
 * DocumentAnalysis — split-view document analysis panel.
 * Left: PDF preview rendered via react-pdf with text highlighting.
 * Right: Extracted data fields with confidence.
 * Hover over a field highlights its value in the PDF text layer.
 * Export to CSV/Excel supported.
 */

import { useState, useMemo, useCallback, type ReactElement, type ReactNode } from 'react'
import type { AnalysisProgress } from '../pages/Documents'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import type { AuraDocument, SchemaField } from '../../../shared/types/document.types'
import { exportDocument } from '../data/data-service'
import { SchemaCustomization } from './SchemaCustomization'
import { ExtractedDataTable } from './ExtractedDataTable'
import {
  FileText,
  BarChart3,
  FileSearch,
  Brain,
  CheckCircle,
  XCircle,
  AlignLeft,
  Settings,
  RefreshCw,
  FileDown,
  Loader2,
  Check,
  AlertTriangle,
  ArrowLeft,
  Sparkles
} from './Icons'

// Configure PDF.js worker — served from public/ directory
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const API_BASE = 'http://localhost:8080/api/v1'

interface DocumentAnalysisProps {
  readonly document: AuraDocument
  readonly onClose: () => void
  readonly onRescan?: () => void
  readonly onApprove?: () => void
  readonly addToast?: (type: 'success' | 'error' | 'info', text: string) => void
  readonly analysisProgress?: AnalysisProgress | null
  readonly onSchemaExtract?: (schema: SchemaField[]) => void
}

function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.9) return 'conf-high'
  if (confidence >= 0.7) return 'conf-medium'
  return 'conf-low'
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function getFileUrl(filePath: string): string {
  const filename = filePath.split('/').pop() ?? filePath
  return `${API_BASE}/files/${filename}`
}

function getStepLabel(step: string): ReactNode {
  const map: Record<string, ReactNode> = {
    extracting_text: (
      <>
        <FileSearch size={14} /> Extracting text from document...
      </>
    ),
    ai_analysis: (
      <>
        <Brain size={14} /> AI is analyzing the extracted text...
      </>
    ),
    complete: (
      <>
        <CheckCircle size={14} /> Analysis complete
      </>
    ),
    failed: (
      <>
        <XCircle size={14} /> Analysis failed
      </>
    )
  }
  return map[step] ?? step
}

/** Highlights matched value in raw text view */
function highlightRawText(rawText: string, searchValue: string): ReactElement[] {
  if (!searchValue || !rawText) return [<span key="all">{rawText}</span>]
  const parts: ReactElement[] = []
  const searchLower = searchValue.toLowerCase()
  const textLower = rawText.toLowerCase()
  let lastIndex = 0
  let idx = textLower.indexOf(searchLower)
  let keyId = 0
  while (idx !== -1) {
    if (idx > lastIndex) parts.push(<span key={keyId++}>{rawText.slice(lastIndex, idx)}</span>)
    parts.push(
      <mark key={keyId++} className="text-highlight">
        {rawText.slice(idx, idx + searchValue.length)}
      </mark>
    )
    lastIndex = idx + searchValue.length
    idx = textLower.indexOf(searchLower, lastIndex)
  }
  if (lastIndex < rawText.length) parts.push(<span key={keyId++}>{rawText.slice(lastIndex)}</span>)
  return parts.length > 0 ? parts : [<span key="all">{rawText}</span>]
}

export function DocumentAnalysis({
  document: doc,
  onClose,
  onRescan,
  onApprove,
  addToast,
  analysisProgress,
  onSchemaExtract
}: Readonly<DocumentAnalysisProps>): ReactElement {
  const [rescanning, setRescanning] = useState(false)
  const [approving, setApproving] = useState(false)
  const [exportingCSV, setExportingCSV] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [hoveredField, setHoveredField] = useState<string | null>(null)
  const [showRawText, setShowRawText] = useState(false)
  const [numPages, setNumPages] = useState<number>(0)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [rightPanelTab, setRightPanelTab] = useState<'data' | 'schema'>('data')

  const DEFAULT_WIDTH = 480
  const pageWidth = Math.round(DEFAULT_WIDTH * (zoomLevel / 100))
  const handleZoomIn = (): void => setZoomLevel((z) => Math.min(z + 20, 200))
  const handleZoomOut = (): void => setZoomLevel((z) => Math.max(z - 20, 30))
  const handleZoomReset = (): void => setZoomLevel(100)

  const overallConfidence =
    doc.extractedFields.length > 0
      ? Math.round(
          (doc.extractedFields.reduce((sum, f) => sum + f.confidence, 0) /
            doc.extractedFields.length) *
            1000
        ) / 10
      : 0

  const fileUrl = useMemo(() => getFileUrl(doc.filePath), [doc.filePath])
  const isPDF = doc.mimeType.includes('pdf')
  const isProcessing = doc.status === 'processing'

  // Custom text renderer for highlighting field values in the PDF text layer
  const customTextRenderer = useCallback(
    ({ str }: { str: string }) => {
      if (!hoveredField) return str
      const regex = new RegExp(
        `(${hoveredField.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)})`,
        'gi'
      )
      const parts = str.split(regex)
      return parts
        .map((part) =>
          regex.test(part)
            ? `<mark style="background-color: rgba(0, 209, 255, 0.35); color: #00d1ff; padding: 1px 3px; border-radius: 3px;">${part}</mark>`
            : part
        )
        .join('')
    },
    [hoveredField]
  )

  /** Renders the document preview content without nested ternaries */
  const renderPreviewContent = (): ReactNode => {
    if (showRawText && doc.rawText) {
      return (
        <div className="raw-text-panel">
          <pre className="raw-text-content">
            {hoveredField ? highlightRawText(doc.rawText, hoveredField) : doc.rawText}
          </pre>
        </div>
      )
    }

    if (isPDF) {
      return (
        <div className="pdf-viewer-container">
          <Document
            file={fileUrl}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n)
              setPdfError(null)
            }}
            onLoadError={(err) => setPdfError(err.message)}
            loading={
              <div className="pdf-loading">
                <div className="processing-indicator-spinner" />
                <p>Loading PDF preview...</p>
              </div>
            }
            error={
              <div className="pdf-error">
                <p>
                  <AlertTriangle size={16} /> Could not load PDF preview
                </p>
                {pdfError && <p className="pdf-error-detail">{pdfError}</p>}
              </div>
            }
          >
            {Array.from({ length: numPages }, (_, i) => (
              <Page
                key={`page-${i + 1}`}
                pageNumber={i + 1}
                width={pageWidth}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                customTextRenderer={hoveredField ? customTextRenderer : undefined}
              />
            ))}
          </Document>
          {numPages > 0 && (
            <div className="pdf-page-count">
              {numPages} page{numPages === 1 ? '' : 's'}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="doc-placeholder">
        <div className="doc-placeholder-header">
          <div className="doc-placeholder-logo" />
          <div className="doc-placeholder-title-area">
            <span className="doc-placeholder-invoice-label">{doc.name}</span>
          </div>
        </div>
        <div className="doc-placeholder-separator" />
        {doc.rawText && <pre className="raw-text-content">{doc.rawText.slice(0, 2000)}</pre>}
      </div>
    )
  }

  const renderDataTab = (): ReactNode => {
    return (
      <>
        <div className="extracted-header">
          <div className="extracted-header-title">
            <span>
              <BarChart3 size={16} />
            </span>
            <h3>Extracted Data</h3>
          </div>
          {hasFields && (
            <span className={`overall-confidence ${getConfidenceClass(overallConfidence / 100)}`}>
              {overallConfidence}% Overall Confidence
            </span>
          )}
        </div>

        {(isProcessing || analysisProgress?.active) && (
          <div className="processing-indicator glass-panel">
            <div className="processing-indicator-spinner" />
            <div className="processing-indicator-text">
              <p className="processing-indicator-step">{getStepLabel(doc.processingStep)}</p>
              {analysisProgress && analysisProgress.totalPages > 0 && (
                <div className="analysis-progress">
                  <div className="analysis-progress-bar">
                    <div
                      className="analysis-progress-fill"
                      style={{
                        width: `${(analysisProgress.pagesProcessed / analysisProgress.totalPages) * 100}%`
                      }}
                    />
                  </div>
                  <p className="analysis-progress-text">
                    Page {analysisProgress.pagesProcessed} of {analysisProgress.totalPages}{' '}
                    processed
                    {analysisProgress.fieldsFound > 0 && (
                      <span className="analysis-fields-count">
                        {' '}
                        · {analysisProgress.fieldsFound} fields found
                      </span>
                    )}
                  </p>
                </div>
              )}
              {(!analysisProgress || analysisProgress.totalPages === 0) && (
                <p className="processing-indicator-hint">This may take a moment...</p>
              )}
            </div>
          </div>
        )}

        {!hasFields && !isProcessing && !analysisProgress?.active && (
          <div className="schema-prompt glass-panel">
            <div className="schema-prompt-icon">
              <Brain size={32} />
            </div>
            <h3 className="schema-prompt-title">Configure Data Extraction</h3>
            <p className="schema-prompt-description">
              Would you like to customize the extraction schema? Define specific fields and rules to
              guide the AI, or extract with default settings.
            </p>
            <div className="schema-prompt-actions">
              <button
                className="schema-prompt-btn schema-prompt-btn-secondary"
                onClick={() => setRightPanelTab('schema')}
              >
                <Settings size={16} />
                Customize Schema
              </button>
              <button
                className="schema-prompt-btn schema-prompt-btn-primary"
                onClick={() => onRescan?.()}
              >
                <Sparkles size={16} />
                Extract with Defaults
              </button>
            </div>
          </div>
        )}

        {analysisProgress && analysisProgress.pagesFailed > 0 && !analysisProgress.active && (
          <div
            className="extracted-field-card glass-panel conf-low"
            style={{ marginBottom: '12px' }}
          >
            <div className="field-card-header">
              <span className="field-label">
                <AlertTriangle size={14} /> PARTIAL FAILURE
              </span>
            </div>
            <div className="field-card-value">
              <span className="field-value">
                {analysisProgress.pagesFailed} page
                {analysisProgress.pagesFailed === 1 ? '' : 's'} failed during analysis.
                {analysisProgress.pagesSucceeded > 0 &&
                  ` ${analysisProgress.pagesSucceeded} page${analysisProgress.pagesSucceeded === 1 ? '' : 's'} succeeded.`}{' '}
                Results shown are from successfully processed pages.
              </span>
            </div>
          </div>
        )}

        {hasFields && (
          <ExtractedDataTable
            fields={doc.extractedFields}
            schema={doc.appliedSchema}
            hoveredField={hoveredField}
            onHoverField={setHoveredField}
          />
        )}
      </>
    )
  }

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
      const baseName = doc.name.replace(/\.[^/.]+$/, '').replaceAll(/\s+/g, '_')
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
          <ArrowLeft size={16} /> Back to Documents
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
        {/* Left — Document Preview */}
        <div className="doc-analysis-preview">
          <div className="doc-preview-header">
            <div className="doc-preview-title">
              <span>
                <FileText size={16} />
              </span>
              <span>Document Preview</span>
            </div>
            <div className="doc-preview-controls">
              {isPDF && !showRawText && (
                <div className="zoom-controls">
                  <button
                    className="zoom-btn"
                    onClick={handleZoomOut}
                    disabled={zoomLevel <= 30}
                    title="Zoom out"
                  >
                    −
                  </button>
                  <span className="zoom-level">{zoomLevel}%</span>
                  <button
                    className="zoom-btn"
                    onClick={handleZoomIn}
                    disabled={zoomLevel >= 200}
                    title="Zoom in"
                  >
                    +
                  </button>
                  <button
                    className="zoom-btn zoom-btn-reset"
                    onClick={handleZoomReset}
                    title="Reset zoom"
                  >
                    ⟲
                  </button>
                </div>
              )}
              {doc.rawText && (
                <button
                  className={`btn-ghost raw-text-toggle ${showRawText ? 'active' : ''}`}
                  onClick={() => setShowRawText(!showRawText)}
                >
                  {showRawText ? (
                    <>
                      <FileText size={14} /> Show PDF
                    </>
                  ) : (
                    <>
                      <AlignLeft size={14} /> Show Text
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="doc-preview-body glass-panel">{renderPreviewContent()}</div>
        </div>

        {/* Right — Extracted Data / Schema Customization */}
        <div className="doc-analysis-extracted">
          {/* Tab Toggle */}
          <div className="analysis-schema-toggle">
            <button
              className={`schema-toggle-btn ${rightPanelTab === 'data' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('data')}
            >
              Extracted Data
            </button>
            <button
              className={`schema-toggle-btn ${rightPanelTab === 'schema' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('schema')}
            >
              Schema
            </button>
          </div>

          {rightPanelTab === 'schema' ? (
            <SchemaCustomization
              onExtract={(schema) => {
                onSchemaExtract?.(schema)
                setRightPanelTab('data')
              }}
              extracting={isProcessing || analysisProgress?.active}
              addToast={addToast}
            />
          ) : (
            renderDataTab()
          )}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="doc-analysis-actions">
        <button
          className="btn-ghost action-btn"
          onClick={() => setRightPanelTab(rightPanelTab === 'schema' ? 'data' : 'schema')}
        >
          <Settings size={14} /> {rightPanelTab === 'schema' ? 'View Data' : 'Schema'}
        </button>
        <button
          className="btn-ghost action-btn"
          onClick={handleRescan}
          disabled={rescanning || isProcessing}
        >
          {rescanning ? (
            <>
              <Loader2 size={14} className="spin" /> Scanning...
            </>
          ) : (
            <>
              <RefreshCw size={14} /> Re-scan
            </>
          )}
        </button>
        {hasFields && (
          <div className="export-btn-group">
            <button
              className="btn-ghost action-btn export-btn"
              onClick={() => handleExport('csv')}
              disabled={exportingCSV}
            >
              {exportingCSV ? (
                <>
                  <Loader2 size={14} className="spin" /> Exporting...
                </>
              ) : (
                <>
                  <FileDown size={14} /> Export CSV
                </>
              )}
            </button>
            <button
              className="btn-ghost action-btn export-btn"
              onClick={() => handleExport('xlsx')}
              disabled={exportingExcel}
            >
              {exportingExcel ? (
                <>
                  <Loader2 size={14} className="spin" /> Exporting...
                </>
              ) : (
                <>
                  <BarChart3 size={14} /> Export Excel
                </>
              )}
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
          {approving ? (
            <>
              <Loader2 size={14} className="spin" /> Approving...
            </>
          ) : (
            <>
              Approve <Check size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
