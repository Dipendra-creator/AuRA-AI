/**
 * FileDropZone — drag and drop file upload area.
 * Displays upload instructions and handles drag events with visual feedback.
 */

import { useState, useCallback, type ReactElement, type DragEvent } from 'react'

interface FileDropZoneProps {
    readonly onFilesSelected?: (files: FileList) => void
}

export function FileDropZone({ onFilesSelected }: FileDropZoneProps): ReactElement {
    const [isDragging, setIsDragging] = useState(false)

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

    const handleDrop = useCallback(
        (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(false)

            if (e.dataTransfer.files.length > 0) {
                onFilesSelected?.(e.dataTransfer.files)
            }
        },
        [onFilesSelected]
    )

    const handleClick = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = '.pdf,.jpg,.jpeg,.png,.docx'
        input.onchange = (): void => {
            if (input.files && input.files.length > 0) {
                onFilesSelected?.(input.files)
            }
        }
        input.click()
    }, [onFilesSelected])

    return (
        <div
            className={`drop-zone glass-panel ${isDragging ? 'active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <div className="drop-zone-icon">
                <span>☁️</span>
            </div>
            <h4>Drop files here to process</h4>
            <p>
                Upload PDF, JPG, PNG or DOCX. Aura AI will automatically extract data
                and route it to your workflows.
            </p>
            <button className="drop-zone-btn" onClick={(e) => e.stopPropagation()}>
                Select Files
            </button>
        </div>
    )
}
