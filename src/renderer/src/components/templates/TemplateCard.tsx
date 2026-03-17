/**
 * TemplateCard — Individual template card (glassmorphism, inline styles).
 */

import { useState, type ReactElement } from 'react'
import { Star } from 'lucide-react'
import type { PipelineTemplate } from '../../data/pipeline-templates'
import { MiniPipelinePreview } from './MiniPipelinePreview'

const ACCENT_COLORS: Record<string, { border: string; badge: string; badgeText: string; btnBg: string; btnBorder: string; btnText: string }> = {
  cyan:    { border: 'rgba(6,182,212,0.35)',   badge: 'rgba(6,182,212,0.12)',   badgeText: '#22d3ee', btnBg: 'rgba(6,182,212,0.15)',   btnBorder: 'rgba(6,182,212,0.4)',   btnText: '#22d3ee' },
  purple:  { border: 'rgba(168,85,247,0.35)',  badge: 'rgba(168,85,247,0.12)',  badgeText: '#c084fc', btnBg: 'rgba(168,85,247,0.15)',  btnBorder: 'rgba(168,85,247,0.4)',  btnText: '#c084fc' },
  emerald: { border: 'rgba(16,185,129,0.35)',  badge: 'rgba(16,185,129,0.12)',  badgeText: '#34d399', btnBg: 'rgba(16,185,129,0.15)',  btnBorder: 'rgba(16,185,129,0.4)',  btnText: '#34d399' },
  red:     { border: 'rgba(239,68,68,0.35)',   badge: 'rgba(239,68,68,0.12)',   badgeText: '#f87171', btnBg: 'rgba(239,68,68,0.15)',   btnBorder: 'rgba(239,68,68,0.4)',   btnText: '#f87171' },
  amber:   { border: 'rgba(251,191,36,0.35)',  badge: 'rgba(251,191,36,0.12)',  badgeText: '#fbbf24', btnBg: 'rgba(251,191,36,0.15)',  btnBorder: 'rgba(251,191,36,0.4)',  btnText: '#fbbf24' },
  orange:  { border: 'rgba(249,115,22,0.35)',  badge: 'rgba(249,115,22,0.12)',  badgeText: '#fb923c', btnBg: 'rgba(249,115,22,0.15)',  btnBorder: 'rgba(249,115,22,0.4)',  btnText: '#fb923c' },
  slate:   { border: 'rgba(148,163,184,0.25)', badge: 'rgba(148,163,184,0.1)',  badgeText: '#94a3b8', btnBg: 'rgba(148,163,184,0.1)',  btnBorder: 'rgba(148,163,184,0.3)', btnText: '#94a3b8' },
}

interface TemplateCardProps {
  readonly template: PipelineTemplate
  readonly onPreview: (t: PipelineTemplate) => void
  readonly onUse: (t: PipelineTemplate) => void
}

export function TemplateCard({ template, onPreview, onUse }: TemplateCardProps): ReactElement {
  const [hovered, setHovered] = useState(false)
  const accent = ACCENT_COLORS[template.accentColor] ?? ACCENT_COLORS.slate

  const durationLabel =
    template.estimatedDurationSec < 60
      ? `~${template.estimatedDurationSec}s`
      : `~${Math.round(template.estimatedDurationSec / 60)}m`

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: 20,
        borderRadius: 14,
        background: hovered ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hovered ? accent.border : 'rgba(255,255,255,0.07)'}`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'all 180ms ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? `0 8px 32px -8px ${accent.border}` : '0 2px 12px -4px rgba(0,0,0,0.3)',
        cursor: 'default',
      }}
    >
      {/* Header row: badge + star */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          padding: '3px 8px',
          borderRadius: 999,
          background: accent.badge,
          color: accent.badgeText,
          letterSpacing: '0.03em',
          whiteSpace: 'nowrap',
        }}>
          {template.category}
        </span>
        {template.featured && (
          <Star size={13} style={{ color: '#fbbf24', fill: '#fbbf24', flexShrink: 0 }} />
        )}
      </div>

      {/* Title + description */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.3, margin: 0 }}>
          {template.name}
        </h3>
        <p style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.45)',
          lineHeight: 1.55,
          margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {template.description}
        </p>
      </div>

      {/* Mini node strip */}
      <div style={{ padding: '4px 0' }}>
        <MiniPipelinePreview nodes={template.defaultPipeline.nodes} variant="strip" />
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
        <span>{template.nodeCount} nodes</span>
        <span>·</span>
        <span>{durationLabel} avg</span>
        <span>·</span>
        <span style={{ color: accent.badgeText }}>{template.category}</span>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => onPreview(template)}
          style={{
            flex: 1,
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.8)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
          }}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => onUse(template)}
          style={{
            flex: 1,
            padding: '7px 12px',
            borderRadius: 8,
            border: `1px solid ${accent.btnBorder}`,
            background: accent.btnBg,
            color: accent.btnText,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.8'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
        >
          Use →
        </button>
      </div>
    </div>
  )
}
