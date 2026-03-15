/**
 * Downloads page — lists all files exported by pipeline runs.
 * Users can download or delete individual files.
 */

import { useState, useEffect, useCallback, type ReactElement } from 'react'
import {
  Download,
  Trash2,
  FileText,
  FileSpreadsheet,
  FileJson,
  FolderOpen,
  RefreshCw
} from 'lucide-react'
import type { ToastType } from '../components/Toast'
import { listExportFiles, deleteExportFile, downloadExportFile, type ExportFile } from '../data/data-service'

interface DownloadsProps {
  readonly addToast: (type: ToastType, text: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function FileIcon({ mimeType }: { readonly mimeType: string }): ReactElement {
  if (mimeType === 'text/csv') return <FileText size={16} style={{ color: '#34d399' }} />
  if (mimeType.includes('spreadsheet')) return <FileSpreadsheet size={16} style={{ color: '#60a5fa' }} />
  if (mimeType === 'application/json') return <FileJson size={16} style={{ color: '#fbbf24' }} />
  return <FileText size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
}

export function Downloads({ addToast }: DownloadsProps): ReactElement {
  const [files, setFiles] = useState<ExportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set())
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set())

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listExportFiles()
      // Sort newest first
      setFiles([...result].sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()))
    } catch {
      addToast('error', 'Failed to load export files')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleDownload = useCallback(async (file: ExportFile) => {
    setDownloadingFiles((prev) => new Set(prev).add(file.name))
    try {
      const blob = await downloadExportFile(file.downloadUrl)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      addToast('error', `Failed to download "${file.name}"`)
    } finally {
      setDownloadingFiles((prev) => {
        const next = new Set(prev)
        next.delete(file.name)
        return next
      })
    }
  }, [addToast])

  const handleDelete = useCallback(async (file: ExportFile) => {
    setDeletingFiles((prev) => new Set(prev).add(file.name))
    try {
      await deleteExportFile(file.name)
      setFiles((prev) => prev.filter((f) => f.name !== file.name))
      addToast('success', `Deleted "${file.name}"`)
    } catch {
      addToast('error', `Failed to delete "${file.name}"`)
    } finally {
      setDeletingFiles((prev) => {
        const next = new Set(prev)
        next.delete(file.name)
        return next
      })
    }
  }, [addToast])

  const handleClearAll = useCallback(async () => {
    if (files.length === 0) return
    const toDelete = [...files]
    for (const f of toDelete) {
      try {
        await deleteExportFile(f.name)
      } catch {
        // continue deleting others
      }
    }
    setFiles([])
    addToast('success', `Cleared ${toDelete.length} export file${toDelete.length === 1 ? '' : 's'}`)
  }, [files, addToast])

  return (
    <div style={{ padding: '0 32px', maxWidth: 1000, margin: '0 auto', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '28px 0 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 24
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.95)',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}
          >
            <Download size={22} style={{ color: '#6366f1' }} />
            Downloads
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            Files exported by pipeline runs
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={loadFiles}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 12,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
            Refresh
          </button>

          {files.length > 0 && (
            <button
              onClick={handleClearAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.08)',
                color: '#f87171',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <Trash2 size={13} />
              Clear All
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          Loading...
        </div>
      ) : files.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 64,
            color: 'rgba(255,255,255,0.25)',
            gap: 12
          }}
        >
          <FolderOpen size={40} />
          <p style={{ margin: 0, fontSize: 14 }}>No exported files yet</p>
          <p style={{ margin: 0, fontSize: 12 }}>
            Run a pipeline with an Export node to generate downloadable files.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto auto',
              padding: '6px 14px',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)',
              gap: 12
            }}
          >
            <span>File</span>
            <span style={{ textAlign: 'right' }}>Size</span>
            <span style={{ textAlign: 'right', minWidth: 140 }}>Modified</span>
            <span />
          </div>

          {files.map((file) => (
            <div
              key={file.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)',
                gap: 12,
                transition: 'background 0.1s'
              }}
            >
              {/* Name + icon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <FileIcon mimeType={file.mimeType} />
                <span
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.85)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {file.name}
                </span>
              </div>

              {/* Size */}
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
                {formatBytes(file.size)}
              </span>

              {/* Date */}
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', minWidth: 140, textAlign: 'right' }}>
                {formatDate(file.modifiedAt)}
              </span>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => handleDownload(file)}
                  disabled={downloadingFiles.has(file.name)}
                  title="Download"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(99,102,241,0.3)',
                    background: 'rgba(99,102,241,0.1)',
                    color: '#a5b4fc',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: downloadingFiles.has(file.name) ? 'not-allowed' : 'pointer',
                    opacity: downloadingFiles.has(file.name) ? 0.5 : 1
                  }}
                >
                  <Download size={12} />
                  {downloadingFiles.has(file.name) ? '...' : 'Download'}
                </button>
                <button
                  onClick={() => handleDelete(file)}
                  disabled={deletingFiles.has(file.name)}
                  title="Delete"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(239,68,68,0.25)',
                    background: 'rgba(239,68,68,0.07)',
                    color: '#f87171',
                    cursor: deletingFiles.has(file.name) ? 'not-allowed' : 'pointer',
                    opacity: deletingFiles.has(file.name) ? 0.5 : 1
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
