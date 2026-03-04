/**
 * DocumentSelectorPanel — lets users select from already-processed documents
 * in the system for use in the pipeline workflow. Replaces the IngestUploadZone.
 * Fetches documents via the existing API and shows a searchable, checkable list.
 */
import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import type { AuraDocument } from '@shared/types/document.types'
import { getDocumentsData } from '@renderer/data/data-service'
import { Search, FileText, CheckSquare, Square, Loader2 } from 'lucide-react'

interface DocumentSelectorPanelProps {
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}

/** Status colour mapping */
const STATUS_COLORS: Record<string, string> = {
  processed: '#10b981',
  processing: '#f59e0b',
  reviewing: '#8b5cf6',
  pending: '#6b7280',
  error: '#ef4444'
}

/** Document type badge colours */
const TYPE_COLORS: Record<string, string> = {
  invoice: '#3b82f6',
  contract: '#8b5cf6',
  receipt: '#10b981',
  expense: '#f59e0b',
  other: '#6b7280'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentSelectorPanel({
  selectedIds,
  onSelectionChange
}: DocumentSelectorPanelProps): ReactElement {
  const [documents, setDocuments] = useState<AuraDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Fetch documents on mount
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getDocumentsData()
      .then((result) => {
        if (!cancelled) {
          setDocuments(result.documents as AuraDocument[])
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load documents')
          setLoading(false)
        }
      })

    return (): void => {
      cancelled = true
    }
  }, [])

  const toggleDocument = useCallback(
    (docId: string) => {
      const isSelected = selectedIds.includes(docId)
      if (isSelected) {
        onSelectionChange(selectedIds.filter((id) => id !== docId))
      } else {
        onSelectionChange([...selectedIds, docId])
      }
    },
    [selectedIds, onSelectionChange]
  )

  const selectAll = useCallback(() => {
    const filteredIds = filteredDocs.map((d) => d._id as string)
    onSelectionChange(filteredIds)
  }, [documents, searchQuery, onSelectionChange])

  const deselectAll = useCallback(() => {
    onSelectionChange([])
  }, [onSelectionChange])

  // Filter documents by search query
  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '20px 16px',
          color: 'rgba(255,255,255,0.4)'
        }}
      >
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 11 }}>Loading documents...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '12px',
          borderRadius: 8,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          fontSize: 11,
          color: '#fca5a5',
          lineHeight: 1.5
        }}
      >
        ⚠️ {error}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div
        style={{
          padding: '16px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.1)',
          textAlign: 'center',
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          lineHeight: 1.5
        }}
      >
        No documents found. Upload documents from the Documents page first.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Search bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderRadius: 6,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        <Search size={12} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documents..."
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 11,
            outline: 'none'
          }}
        />
      </div>

      {/* Selection controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 2px'
        }}
      >
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
          {selectedIds.length} of {documents.length} selected
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={selectAll}
            style={{
              background: 'none',
              border: 'none',
              color: '#60a5fa',
              fontSize: 9,
              cursor: 'pointer',
              padding: 0
            }}
          >
            All
          </button>
          <button
            onClick={deselectAll}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 9,
              cursor: 'pointer',
              padding: 0
            }}
          >
            None
          </button>
        </div>
      </div>

      {/* Document list */}
      <div
        style={{
          maxHeight: 240,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent'
        }}
      >
        {filteredDocs.length === 0 ? (
          <div
            style={{
              padding: '12px',
              textAlign: 'center',
              fontSize: 10,
              color: 'rgba(255,255,255,0.3)'
            }}
          >
            No documents match &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isSelected = selectedIds.includes(doc._id as string)
            const statusColor = STATUS_COLORS[doc.status] ?? '#6b7280'
            const typeColor = TYPE_COLORS[doc.type] ?? '#6b7280'

            return (
              <div
                key={doc._id}
                onClick={() => toggleDocument(doc._id as string)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 8px',
                  borderRadius: 8,
                  background: isSelected ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isSelected ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  userSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                  }
                }}
              >
                {/* Checkbox */}
                {isSelected ? (
                  <CheckSquare size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                ) : (
                  <Square size={14} style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                )}

                {/* File icon */}
                <FileText size={14} style={{ color: statusColor, flexShrink: 0 }} />

                {/* Document info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'rgba(255,255,255,0.85)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.2
                    }}
                  >
                    {doc.name}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 2
                    }}
                  >
                    {/* Type badge */}
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: typeColor,
                        padding: '1px 4px',
                        borderRadius: 3,
                        background: `${typeColor}15`
                      }}
                    >
                      {doc.type}
                    </span>

                    {/* Status dot */}
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: statusColor,
                        display: 'inline-block'
                      }}
                    />

                    {/* Size */}
                    <span
                      style={{
                        fontSize: 8,
                        color: 'rgba(255,255,255,0.3)'
                      }}
                    >
                      {formatBytes(doc.fileSize)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* CSS animation for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
