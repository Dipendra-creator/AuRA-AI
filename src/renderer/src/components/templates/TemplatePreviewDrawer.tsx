/**
 * TemplatePreviewDrawer — Right-side slide-in drawer (inline styles).
 */

import { useState, useEffect, type ReactElement } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import type { PipelineTemplate } from '../../data/pipeline-templates'
import { buildPipelineFromTemplate } from '../../data/pipeline-templates'
import { MiniPipelinePreview } from './MiniPipelinePreview'
import { QuickConfigForm } from './QuickConfigForm'
import { createPipeline } from '../../data/data-service'

interface TemplatePreviewDrawerProps {
  readonly template: PipelineTemplate | null
  readonly open: boolean
  readonly onClose: () => void
  readonly onCreated: (name: string) => void
  readonly onNavigateToWorkflows: () => void
}

function buildDefaultConfig(template: PipelineTemplate): Record<string, unknown> {
  const cfg: Record<string, unknown> = {}
  for (const f of template.quickConfigFields) {
    if (f.defaultValue !== undefined) cfg[f.key] = f.defaultValue
  }
  return cfg
}

const ACCENT_BADGE: Record<string, { bg: string; text: string }> = {
  cyan:    { bg: 'rgba(6,182,212,0.12)',  text: '#22d3ee' },
  purple:  { bg: 'rgba(168,85,247,0.12)', text: '#c084fc' },
  emerald: { bg: 'rgba(16,185,129,0.12)', text: '#34d399' },
  red:     { bg: 'rgba(239,68,68,0.12)',  text: '#f87171' },
  amber:   { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24' },
  orange:  { bg: 'rgba(249,115,22,0.12)', text: '#fb923c' },
  slate:   { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8' },
}

export function TemplatePreviewDrawer({
  template,
  open,
  onClose,
  onCreated,
  onNavigateToWorkflows,
}: TemplatePreviewDrawerProps): ReactElement {
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (template) {
      setConfig(buildDefaultConfig(template))
      setError(null)
    }
  }, [template?.id])

  function handleConfigChange(key: string, value: unknown): void {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  async function handleUse(): Promise<void> {
    if (!template) return
    const missing = template.quickConfigFields
      .filter((f) => f.required && !config[f.key])
      .map((f) => f.label)
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.join(', ')}`)
      return
    }
    setIsCreating(true)
    setError(null)
    try {
      const payload = buildPipelineFromTemplate(template, config)
      await createPipeline({
        name: payload.name,
        workspace: payload.workspace,
        nodes: payload.nodes as Parameters<typeof createPipeline>[0]['nodes'],
      })
      onCreated(payload.name)
      onClose()
      onNavigateToWorkflows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pipeline. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const badge = template ? (ACCENT_BADGE[template.accentColor] ?? ACCENT_BADGE.slate) : ACCENT_BADGE.slate
  const durationLabel = template
    ? template.estimatedDurationSec < 60
      ? `~${template.estimatedDurationSec}s`
      : `~${Math.round(template.estimatedDurationSec / 60)}m`
    : ''

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 280ms ease',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100%',
          width: 480,
          zIndex: 50,
          background: '#0f172a',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {template && (
          <>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              padding: '24px 24px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: badge.bg,
                  color: badge.text,
                  letterSpacing: '0.04em',
                  width: 'fit-content',
                }}>
                  {template.category}
                </span>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', margin: 0, lineHeight: 1.3 }}>
                  {template.name}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                  <span>{template.nodeCount} nodes</span>
                  <span>·</span>
                  <span>{durationLabel} avg</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: 6,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'color 150ms ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

                {/* Pipeline preview */}
                <section>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                    Pipeline Preview
                  </p>
                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '12px 16px',
                    overflowX: 'auto',
                  }}>
                    <MiniPipelinePreview nodes={template.defaultPipeline.nodes} variant="expanded" />
                  </div>
                </section>

                {/* What this does */}
                <section>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                    What This Does
                  </p>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, margin: 0 }}>
                    {template.longDescription}
                  </p>
                  <div style={{
                    marginTop: 12,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, margin: 0 }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Use case: </span>
                      {template.useCaseText}
                    </p>
                  </div>
                </section>

                {/* Quick config */}
                {template.quickConfigFields.length > 0 && (
                  <section>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
                      Quick Config
                    </p>
                    <QuickConfigForm fields={template.quickConfigFields} values={config} onChange={handleConfigChange} />
                  </section>
                )}

                {/* Error */}
                {error && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}>
                    <AlertCircle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 12, color: '#f87171', margin: 0, lineHeight: 1.5 }}>{error}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '20px 24px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '9px 20px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUse}
                disabled={isCreating}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '9px 20px',
                  borderRadius: 8,
                  border: '1px solid rgba(6,182,212,0.4)',
                  background: 'rgba(6,182,212,0.15)',
                  color: '#22d3ee',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isCreating ? 'not-allowed' : 'pointer',
                  opacity: isCreating ? 0.6 : 1,
                  fontFamily: 'inherit',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!isCreating) e.currentTarget.style.background = 'rgba(6,182,212,0.25)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(6,182,212,0.15)'
                }}
              >
                {isCreating ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Creating…
                  </>
                ) : (
                  'Use This Template →'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
