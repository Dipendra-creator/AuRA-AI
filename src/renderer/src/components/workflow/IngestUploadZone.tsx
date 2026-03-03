/**
 * IngestUploadZone — drag-and-drop file upload zone for the Ingest node.
 * Allows users to upload PDF, DOCX, JPG, PNG files directly from the
 * node configuration panel. Uses the existing uploadDocument API.
 */
import { useState, useRef, useCallback } from 'react'
import type { ReactElement } from 'react'
import { uploadDocument } from '@renderer/data/data-service'

interface UploadedFile {
    name: string
    size: number
    status: 'uploading' | 'done' | 'error'
    error?: string
}

interface IngestUploadZoneProps {
    acceptedFormats: string[]
}

/** Map file extensions to MIME accept attribute values */
function buildAcceptString(formats: string[]): string {
    const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png'
    }
    return formats
        .map((f) => mimeMap[f.toLowerCase()] ?? `.${f}`)
        .join(',')
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function IngestUploadZone({
    acceptedFormats
}: IngestUploadZoneProps): ReactElement {
    const [files, setFiles] = useState<UploadedFile[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleFiles = useCallback(
        async (fileList: FileList) => {
            const newFiles = Array.from(fileList)

            // Add all files as "uploading"
            setFiles((prev) => [
                ...prev,
                ...newFiles.map((f) => ({
                    name: f.name,
                    size: f.size,
                    status: 'uploading' as const
                }))
            ])

            // Upload each file
            for (const file of newFiles) {
                try {
                    await uploadDocument(file)
                    setFiles((prev) =>
                        prev.map((pf) =>
                            pf.name === file.name && pf.status === 'uploading'
                                ? { ...pf, status: 'done' as const }
                                : pf
                        )
                    )
                } catch (err) {
                    setFiles((prev) =>
                        prev.map((pf) =>
                            pf.name === file.name && pf.status === 'uploading'
                                ? {
                                    ...pf,
                                    status: 'error' as const,
                                    error: err instanceof Error ? err.message : 'Upload failed'
                                }
                                : pf
                        )
                    )
                }
            }
        },
        []
    )

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            setIsDragging(false)
            if (e.dataTransfer.files.length > 0) {
                handleFiles(e.dataTransfer.files)
            }
        },
        [handleFiles]
    )

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const onDragLeave = useCallback(() => {
        setIsDragging(false)
    }, [])

    const removeFile = useCallback((name: string) => {
        setFiles((prev) => prev.filter((f) => f.name !== name))
    }, [])

    return (
        <div>
            {/* Drag-and-drop zone */}
            <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => inputRef.current?.click()}
                style={{
                    border: `2px dashed ${isDragging ? '#3b82f6' : 'rgba(255,255,255,0.15)'}`,
                    borderRadius: 8,
                    padding: '20px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: isDragging
                        ? 'rgba(59,130,246,0.08)'
                        : 'rgba(255,255,255,0.02)'
                }}
            >
                <div
                    style={{
                        fontSize: 24,
                        marginBottom: 6,
                        opacity: 0.6
                    }}
                >
                    📄
                </div>
                <div
                    style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.6)',
                        lineHeight: 1.4
                    }}
                >
                    <strong style={{ color: '#60a5fa' }}>Click to browse</strong> or drag
                    files here
                </div>
                <div
                    style={{
                        fontSize: 9,
                        color: 'rgba(255,255,255,0.35)',
                        marginTop: 4,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}
                >
                    {acceptedFormats.join(' · ')}
                </div>
            </div>

            {/* Hidden input */}
            <input
                ref={inputRef}
                type="file"
                multiple
                accept={buildAcceptString(acceptedFormats)}
                style={{ display: 'none' }}
                onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        handleFiles(e.target.files)
                        e.target.value = ''
                    }
                }}
            />

            {/* Uploaded file list */}
            {files.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {files.map((f, i) => (
                        <div
                            key={`${f.name}-${i}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                borderRadius: 6,
                                background: 'rgba(255,255,255,0.04)',
                                fontSize: 10
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                <span style={{ flexShrink: 0 }}>
                                    {f.status === 'uploading' && '⏳'}
                                    {f.status === 'done' && '✅'}
                                    {f.status === 'error' && '❌'}
                                </span>
                                <span
                                    style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        color: 'rgba(255,255,255,0.8)'
                                    }}
                                >
                                    {f.name}
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                                    {formatBytes(f.size)}
                                </span>
                            </div>
                            {f.status !== 'uploading' && (
                                <button
                                    onClick={() => removeFile(f.name)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'rgba(255,255,255,0.35)',
                                        cursor: 'pointer',
                                        padding: '0 2px',
                                        fontSize: 12,
                                        lineHeight: 1
                                    }}
                                    title="Remove"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
