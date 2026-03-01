/**
 * FileDropZone — drag and drop file upload area.
 * Displays upload instructions and handles drag events with visual feedback.
 * Shows upload progress state and file count.
 */

import { useState, useCallback, type ReactElement, type ReactNode, type DragEvent } from 'react'
import { CloudUpload, Loader2, CheckCircle, XCircle } from './Icons'

interface FileDropZoneProps {
    readonly onFilesSelected?: (files: FileList) => void
}

export function FileDropZone({ onFilesSelected }: FileDropZoneProps): ReactElement {
    const [isDragging, setIsDragging] = useState(false)
    const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }, [])

    const handleFiles = useCallback(
        async (files: FileList) => {
            if (!onFilesSelected || files.length === 0) return
            setUploadState('uploading')
            try {
                await onFilesSelected(files)
                setUploadState('success')
                setTimeout(() => setUploadState('idle'), 3000)
            } catch {
                setUploadState('error')
                setTimeout(() => setUploadState('idle'), 4000)
            }
        },
        [onFilesSelected]
    )

    const handleDrop = useCallback(
        (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(false)

            if (e.dataTransfer.files.length > 0) {
                handleFiles(e.dataTransfer.files)
            }
        },
        [handleFiles]
    )

    const handleClick = useCallback(() => {
        if (uploadState === 'uploading') return
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = '.pdf,.jpg,.jpeg,.png,.docx'
        input.onchange = (): void => {
            if (input.files && input.files.length > 0) {
                handleFiles(input.files)
            }
        }
        input.click()
    }, [handleFiles, uploadState])

    const stateIcon: Record<string, ReactNode> = {
        idle: <CloudUpload size={28} />,
        uploading: <Loader2 size={28} className="spin" />,
        success: <CheckCircle size={28} />,
        error: <XCircle size={28} />
    }

    const stateMessage = {
        idle: 'Drop files here to process',
        uploading: 'Uploading files...',
        success: 'Upload complete!',
        error: 'Upload failed — is the backend running?'
    }[uploadState]

    return (
        <div
            className={`drop-zone glass-panel ${isDragging ? 'active' : ''} ${uploadState !== 'idle' ? `drop-zone-${uploadState}` : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <div className="drop-zone-icon">
                <span>{stateIcon[uploadState]}</span>
            </div>
            <h4>{stateMessage}</h4>
            {uploadState === 'idle' && (
                <p>
                    Upload PDF, JPG, PNG or DOCX. Aura AI will automatically extract data
                    and route it to your workflows.
                </p>
            )}
            {uploadState === 'uploading' && (
                <div className="drop-zone-progress">
                    <div className="drop-zone-progress-bar" />
                </div>
            )}
            <button
                className="drop-zone-btn"
                onClick={(e) => {
                    e.stopPropagation()
                    handleClick()
                }}
                disabled={uploadState === 'uploading'}
            >
                {uploadState === 'uploading' ? 'Uploading...' : 'Select Files'}
            </button>
        </div>
    )
}
