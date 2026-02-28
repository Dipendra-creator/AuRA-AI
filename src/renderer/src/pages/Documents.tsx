/**
 * Documents page — document list with search, filters, and analysis view.
 * When a document is clicked, shows the split-view analysis panel.
 * Data sourced from mock data service.
 */

import { useState, useMemo, type ReactElement } from 'react'
import { DataTable } from '../components/DataTable'
import { DocumentAnalysis } from '../components/DocumentAnalysis'
import { FileDropZone } from '../components/FileDropZone'
import { getDocumentsData } from '../data/mock-data.service'
import type { AuraDocument } from '../../../shared/types/document.types'

type FilterType = 'all' | 'processed' | 'reviewing' | 'pending' | 'error'

export function Documents(): ReactElement {
    const [searchQuery, setSearchQuery] = useState('')
    const [activeFilter, setActiveFilter] = useState<FilterType>('all')
    const [selectedDocument, setSelectedDocument] = useState<AuraDocument | null>(null)

    const { documents } = useMemo(() => getDocumentsData(), [])

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

    // When a document is selected, show analysis view
    if (selectedDocument) {
        return <DocumentAnalysis document={selectedDocument} onClose={() => setSelectedDocument(null)} />
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
            <FileDropZone />

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
            />
        </>
    )
}
