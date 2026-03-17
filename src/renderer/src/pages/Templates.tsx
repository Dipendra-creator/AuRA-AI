/**
 * Templates page — Curated library of pre-built pipeline workflows.
 */

import { useState, useMemo, type ReactElement } from 'react'
import { Search, LayoutTemplate } from 'lucide-react'
import type { ToastType } from '../components/Toast'
import type { PipelineTemplate, TemplateCategory } from '../data/pipeline-templates'
import { ALL_TEMPLATES } from '../data/pipeline-templates'
import { TemplateGrid } from '../components/templates/TemplateGrid'
import { TemplatePreviewDrawer } from '../components/templates/TemplatePreviewDrawer'

interface TemplatesProps {
  readonly addToast: (type: ToastType, text: string) => void
  readonly onNavigate: (page: string) => void
}

export function Templates({ addToast, onNavigate }: TemplatesProps): ReactElement {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'All'>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<PipelineTemplate | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return ALL_TEMPLATES.filter((t) => {
      const matchesCat = activeCategory === 'All' || t.category === activeCategory
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      return matchesCat && matchesSearch
    })
  }, [activeCategory, searchQuery])

  function openDrawer(template: PipelineTemplate): void {
    setSelectedTemplate(template)
    setIsDrawerOpen(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* Page header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '24px 32px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'rgba(6,182,212,0.1)',
            border: '1px solid rgba(6,182,212,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <LayoutTemplate size={18} style={{ color: '#22d3ee' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
              Pipeline Templates
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0', lineHeight: 1 }}>
              Start from a proven workflow — configure, import, and run in seconds.
            </p>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 260, flexShrink: 0 }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.3)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search templates…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: 36,
              paddingRight: 16,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.09)',
              background: 'rgba(255,255,255,0.04)',
              color: '#f1f5f9',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'border-color 150ms ease',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(6,182,212,0.4)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')}
          />
        </div>
      </header>

      {/* Scrollable grid content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 40px' }}>
        <TemplateGrid
          templates={filteredTemplates}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          searchQuery={searchQuery}
          onClearSearch={() => setSearchQuery('')}
          onPreview={openDrawer}
          onUse={openDrawer}
        />
      </div>

      {/* Preview drawer */}
      <TemplatePreviewDrawer
        template={selectedTemplate}
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onCreated={(name) => addToast('success', `"${name}" created — ready to run`)}
        onNavigateToWorkflows={() => onNavigate('workflows')}
      />
    </div>
  )
}
