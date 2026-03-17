/**
 * TemplateGrid — Category filter tabs + responsive card grid.
 */

import { useState, type ReactElement } from 'react'
import { SearchX } from 'lucide-react'
import type { PipelineTemplate, TemplateCategory } from '../../data/pipeline-templates'
import { TemplateCard } from './TemplateCard'

const CATEGORIES: Array<TemplateCategory | 'All'> = [
  'All', 'Finance', 'Legal', 'HR', 'Healthcare', 'Government', 'E-Commerce', 'General',
]

interface TemplateGridProps {
  readonly templates: PipelineTemplate[]
  readonly activeCategory: TemplateCategory | 'All'
  readonly onCategoryChange: (cat: TemplateCategory | 'All') => void
  readonly searchQuery: string
  readonly onClearSearch: () => void
  readonly onPreview: (t: PipelineTemplate) => void
  readonly onUse: (t: PipelineTemplate) => void
}

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): ReactElement {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        border: active
          ? '1px solid rgba(6,182,212,0.4)'
          : `1px solid ${hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'}`,
        background: active
          ? 'rgba(6,182,212,0.12)'
          : hovered
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(255,255,255,0.03)',
        color: active ? '#22d3ee' : hovered ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.45)',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

export function TemplateGrid({
  templates,
  activeCategory,
  onCategoryChange,
  searchQuery,
  onClearSearch,
  onPreview,
  onUse,
}: TemplateGridProps): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Category tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {CATEGORIES.map((cat) => (
          <CategoryTab
            key={cat}
            label={cat}
            active={activeCategory === cat}
            onClick={() => onCategoryChange(cat)}
          />
        ))}
      </div>

      {/* Grid or empty state */}
      {templates.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: '80px 0',
          textAlign: 'center',
        }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <SearchX size={24} style={{ color: 'rgba(255,255,255,0.2)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              No templates found{searchQuery ? ` for "${searchQuery}"` : ''}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', margin: 0 }}>
              Try a different search term or category.
            </p>
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={onClearSearch}
              style={{
                padding: '7px 18px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} onPreview={onPreview} onUse={onUse} />
          ))}
        </div>
      )}
    </div>
  )
}
