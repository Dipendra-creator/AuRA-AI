/**
 * Documents page — document list with search and analysis view.
 */

import { useState, useEffect, useCallback, type ReactElement } from 'react'
import { DataTable } from '../components/DataTable'
import type { AuraDocument } from '../../../shared/types/document.types'

export function Documents(): ReactElement {
    const [documents, setDocuments] = useState<AuraDocument[]>([])
    const [searchQuery, setSearchQuery] = useState('')

    const loadDocuments = useCallback(async () => {
        try {
            const result = await window.documentAPI.list()
            if (result.success) {
                setDocuments(result.data)
            }
        } catch {
            console.warn('[Documents] Failed to load documents')
        }
    }, [])

    useEffect(() => {
        loadDocuments()
    }, [loadDocuments])

    const filteredDocuments = documents.filter((doc) =>
        doc.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const processedCount = documents.filter((d) => d.status === 'processed').length
    const reviewingCount = documents.filter((d) => d.status === 'reviewing').length

    return (
        <>
            {/* Header */}
            <header className="page-header">
                <div>
                    <h2>Documents</h2>
                    <p>
                        {documents.length} total documents · {processedCount} processed ·{' '}
                        {reviewingCount} reviewing
                    </p>
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

            {/* Filter Chips */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                <button className="btn-primary" style={{ fontSize: '12px', padding: '6px 16px' }}>
                    All ({documents.length})
                </button>
                <button className="btn-ghost" style={{ fontSize: '12px', padding: '6px 16px' }}>
                    Processed ({processedCount})
                </button>
                <button className="btn-ghost" style={{ fontSize: '12px', padding: '6px 16px' }}>
                    Reviewing ({reviewingCount})
                </button>
            </div>

            {/* Documents Table */}
            <DataTable
                documents={filteredDocuments}
                title="All Documents"
            />
        </>
    )
}
