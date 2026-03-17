/**
 * MiniPipelinePreview — Lightweight inline DAG visualization.
 * No React Flow. Renders a horizontal strip of colored node squares.
 */

import type { ReactElement } from 'react'
import type { PipelineNode } from '../../../../shared/types/document.types'

const NODE_STYLES: Record<string, { bg: string; border: string; abbr: string }> = {
  doc_select: { bg: 'rgba(59,130,246,0.2)',   border: 'rgba(59,130,246,0.5)',   abbr: 'IN'  },
  ai_extract: { bg: 'rgba(6,182,212,0.2)',    border: 'rgba(6,182,212,0.5)',    abbr: 'AI'  },
  transform:  { bg: 'rgba(168,85,247,0.2)',   border: 'rgba(168,85,247,0.5)',   abbr: 'TR'  },
  condition:  { bg: 'rgba(234,179,8,0.2)',    border: 'rgba(234,179,8,0.5)',    abbr: 'IF'  },
  form_fill:  { bg: 'rgba(16,185,129,0.2)',   border: 'rgba(16,185,129,0.5)',   abbr: 'FF'  },
  custom_api: { bg: 'rgba(249,115,22,0.2)',   border: 'rgba(249,115,22,0.5)',   abbr: 'API' },
  review:     { bg: 'rgba(251,191,36,0.2)',   border: 'rgba(251,191,36,0.5)',   abbr: 'RV'  },
  export:     { bg: 'rgba(34,197,94,0.2)',    border: 'rgba(34,197,94,0.5)',    abbr: 'EX'  },
}

const DEFAULT_STYLE = { bg: 'rgba(100,116,139,0.2)', border: 'rgba(100,116,139,0.5)', abbr: '?' }

interface MiniPipelinePreviewProps {
  readonly nodes: PipelineNode[]
  readonly variant?: 'strip' | 'expanded'
}

export function MiniPipelinePreview({
  nodes,
  variant = 'strip',
}: MiniPipelinePreviewProps): ReactElement {
  const ordered = [...nodes].sort((a, b) => a.position.x - b.position.x)

  if (variant === 'strip') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
        {ordered.map((n, i) => {
          const s = NODE_STYLES[n.type] ?? DEFAULT_STYLE
          return (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <div
                title={n.label}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: `1px solid ${s.border}`,
                  background: s.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 700,
                  color: s.border,
                  letterSpacing: '0.03em',
                  flexShrink: 0,
                }}
              >
                {s.abbr}
              </div>
              {i < ordered.length - 1 && (
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, flexShrink: 0 }}>→</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Expanded — larger squares with label below
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
      {ordered.map((n, i) => {
        const s = NODE_STYLES[n.type] ?? DEFAULT_STYLE
        return (
          <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  border: `1px solid ${s.border}`,
                  background: s.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: s.border,
                }}
              >
                {s.abbr}
              </div>
              <span style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.35)',
                textAlign: 'center',
                maxWidth: 52,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {n.label}
              </span>
            </div>
            {i < ordered.length - 1 && (
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginBottom: 20 }}>→</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
