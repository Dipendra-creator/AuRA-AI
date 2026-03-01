/**
 * Documents page — document list with search, filters, and analysis view.
 * Upload shows file immediately, analysis runs in background.
 * Polls for status updates while any document is processing.
 */

import { useState, useEffect, useMemo, useCallback, useRef, type ReactElement } from 'react'
import { DataTable } from '../components/DataTable'
import { DocumentAnalysis } from '../components/DocumentAnalysis'
import { FileDropZone } from '../components/FileDropZone'
import { LoadingSpinner } from '../components/LoadingSpinner'
import {
    getDocumentsData,
    uploadDocument,
    deleteDocument,
    analyzeDocument,
    updateDocument
} from '../data/data-service'
import type { AuraDocument } from '../../../shared/types/document.types'
import type { ToastType } from '../components/Toast'

type FilterType = 'all' | 'processed' | 'reviewing' | 'pending' | 'error'

interface DocumentsProps {
    readonly addToast: (type: ToastType, text: string) => void
}

export function Documents({ addToast }: DocumentsProps): ReactElement {
    const [searchQuery, setSearchQuery] = useState('')
    const [activeFilter, setActiveFilter] = useState<FilterType>('all')
    const [selectedDocument, setSelectedDocument] = useState<AuraDocument | null>(null)
    const [documents, setDocuments] = useState<readonly AuraDocument[]>([])
    const [loading, setLoading] = useState(true)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const loadDocuments = useCallback(async () => {
        const result = await getDocumentsData()
        setDocuments(result.documents)
        setLoading(false)

        // Update selected document if it changed
        if (result.documents.length > 0) {
            setSelectedDocument((prev) => {
                if (!prev) return null
                const updated = result.documents.find((d) => d._id === prev._id)
                return updated ?? prev
            })
        }
    }, [])

    useEffect(() => {
        loadDocuments()
    }, [loadDocuments])

    // Poll while any document is processing
    const hasProcessing = documents.some((d) => d.status === 'processing')
    useEffect(() => {
        if (hasProcessing) {
            pollRef.current = setInterval(() => {
                loadDocuments()
            }, 3000)
        } else if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
        }
        return () => {
            if (pollRef.current) clearInterval(pollRef.current)
        }
    }, [hasProcessing, loadDocuments])

    const handleFilesSelected = useCallback(
        async (files: FileList) => {
            for (const file of Array.from(files)) {
                try {
                    const uploaded = await uploadDocument(file)
                    addToast('info', `Uploaded "${file.name}" — starting analysis...`)

                    // Refresh immediately to show the uploaded document
                    await loadDocuments()

                    // Fire analysis in the background (non-blocking)
                    analyzeDocument(uploaded._id)
                        .then(() => {
                            addToast('success', `"${file.name}" analyzed successfully`)
                            loadDocuments()
                        })
                        .catch((err) => {
                            addToast('error', `Analysis failed for "${file.name}": ${err instanceof Error ? err.message : 'Unknown error'}`)
                            loadDocuments()
                        })
                } catch (err) {
                    addToast('error', `Failed to upload "${file.name}": ${err instanceof Error ? err.message : 'Unknown error'}`)
                }
            }
        },
        [addToast, loadDocuments]
    )

    const handleDeleteDocument = useCallback(
        async (doc: AuraDocument) => {
            try {
                await deleteDocument(doc._id)
                addToast('success', `Deleted "${doc.name}"`)
                loadDocuments()
            } catch (err) {
                addToast('error', `Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`)
            }
        },
        [addToast, loadDocuments]
    )

    const handleAnalyze = useCallback(
        async (doc: AuraDocument) => {
            try {
                const updated = await analyzeDocument(doc._id)
                addToast('success', `Analysis complete for "${doc.name}"`)
                setSelectedDocument(updated)
                loadDocuments()
            } catch (err) {
                addToast('error', `Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
            }
        },
        [addToast, loadDocuments]
    )

    const handleApprove = useCallback(
        async (doc: AuraDocument) => {
            try {
                await updateDocument(doc._id, { status: 'processed' })
                addToast('success', `Approved "${doc.name}"`)
                setSelectedDocument(null)
                loadDocuments()
            } catch (err) {
                addToast('error', `Approval failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
            }
        },
        [addToast, loadDocuments]
    )

    const filteredDocuments = useMemo(() => {
        let result = documents.filter((doc) =>
            doc.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        if (activeFilter !== 'all') {
            result = result.filter((d) => d.status === activeFilter)
        }
        return result
    }, [documents, searchQuery, activeFilter])

    const processedCount = documents.filter((d) => d.status === 'processed').length
    const reviewingCount = documents.filter((d) => d.status === 'reviewing').length
    const pendingCount = documents.filter((d) => d.status === 'pending' || d.status === 'processing').length

    if (loading) {
        return <LoadingSpinner message="Loading documents..." />
    }

    // When a document is selected, show analysis view
    if (selectedDocument) {
        return (
            <DocumentAnalysis
                document={selectedDocument}
                onClose={() => setSelectedDocument(null)}
                onRescan={() => handleAnalyze(selectedDocument)}
                onApprove={() => handleApprove(selectedDocument)}
                addToast={addToast}
            />
        )
    }

    const filters: { readonly id: FilterType; readonly label: string; readonly count: number }[] = [
        { id: 'all', label: 'All', count: documents.length },
        { id: 'processed', label: 'Processed', count: processedCount },
        { id: 'reviewing', label: 'Reviewing', count: reviewingCount },
        { id: 'pending', label: 'Pending', count: pendingCount }
    ]

    return (
        <>
            {/* Header */}
            <header className="page-header">
                <div>
                    <h2>Document Analysis</h2>
                    <p>Upload invoices or contracts for instant AI processing</p>
                </div>
                <div className="search-bar">
                    <span className="icon">🔍</span>
                    <input
                        type="text"
                        placeholder="Search documents..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </header>

            {/* Upload Zone */}
            <FileDropZone onFilesSelected={handleFilesSelected} />

            {/* Filter Chips */}
            <div className="filter-chips">
                {filters.map((filter) => (
                    <button
                        key={filter.id}
                        className={`filter-chip ${activeFilter === filter.id ? 'active' : ''}`}
                        onClick={() => setActiveFilter(filter.id)}
                    >
                        {filter.label} ({filter.count})
                    </button>
                ))}
            </div>

            {/* Documents Table */}
            <DataTable
                documents={filteredDocuments}
                title="All Documents"
                onDocumentClick={(doc) => setSelectedDocument(doc)}
                onDocumentDelete={handleDeleteDocument}
            />
        </>
    )
}
