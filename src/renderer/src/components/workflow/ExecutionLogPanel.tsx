/**
 * ExecutionLogPanel — sliding panel showing per-node execution logs.
 * Shows real-time status updates as the pipeline executes:
 *   - Running nodes pulse yellow
 *   - Completed nodes show green with duration
 *   - Failed nodes show red with expandable error details
 */
import { useEffect, useRef, type ReactElement } from 'react'
import type { NodeRunResult } from '@shared/types/document.types'
import {
  X,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react'

interface ExecutionLogPanelProps {
  logs: readonly NodeRunResult[]
  isRunning: boolean
  selectedNodeId: string | null
  onNodeClick: (nodeId: string) => void
  onClose: () => void
}

const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; icon: typeof CheckCircle2; label: string }
> = {
  completed: {
    color: '#10b981',
    bg: 'rgba(16,185,129,0.1)',
    icon: CheckCircle2,
    label: 'Completed'
  },
  failed: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: AlertCircle, label: 'Failed' },
  running: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Loader2, label: 'Running' },
  pending: {
    color: 'rgba(255,255,255,0.3)',
    bg: 'rgba(255,255,255,0.03)',
    icon: Clock,
    label: 'Pending'
  },
  skipped: {
    color: 'rgba(255,255,255,0.2)',
    bg: 'rgba(255,255,255,0.02)',
    icon: Clock,
    label: 'Skipped'
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export default function ExecutionLogPanel({
  logs,
  isRunning,
  selectedNodeId,
  onNodeClick,
  onClose
}: ExecutionLogPanelProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '40%',
        minHeight: 180,
        background: 'rgba(8,8,20,0.96)',
        borderTop: '1px solid rgba(99,102,241,0.2)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isRunning
                ? '#f59e0b'
                : logs.some((l) => l.status === 'failed')
                  ? '#ef4444'
                  : '#10b981',
              boxShadow: `0 0 8px ${isRunning ? '#f59e0b' : logs.some((l) => l.status === 'failed') ? '#ef4444' : '#10b981'}`
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}
          >
            Execution Log
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
            {logs.length} node{logs.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex'
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {logs.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: 24,
              color: 'rgba(255,255,255,0.3)',
              fontSize: 11
            }}
          >
            {isRunning ? 'Waiting for node execution...' : 'No execution logs yet'}
          </div>
        )}

        {logs.map((log) => {
          const cfg = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.pending
          const StatusIcon = cfg.icon
          const isExpanded = selectedNodeId === log.nodeId

          return (
            <div key={log.nodeId} style={{ marginBottom: 4 }}>
              {/* Log entry row */}
              <button
                onClick={() => onNodeClick(log.nodeId)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${isExpanded ? cfg.color + '40' : 'transparent'}`,
                  background: isExpanded ? cfg.bg : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'left'
                }}
              >
                {/* Expand icon */}
                {isExpanded ? (
                  <ChevronDown
                    size={12}
                    style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}
                  />
                ) : (
                  <ChevronRight
                    size={12}
                    style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}
                  />
                )}

                {/* Status icon */}
                <StatusIcon
                  size={14}
                  style={{
                    color: cfg.color,
                    flexShrink: 0,
                    animation: log.status === 'running' ? 'spin 1s linear infinite' : undefined
                  }}
                />

                {/* Node name */}
                <span
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.85)',
                    fontWeight: 500,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {log.nodeId}
                </span>

                {/* Status badge */}
                <span
                  style={{
                    fontSize: 9,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: cfg.bg,
                    color: cfg.color,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    flexShrink: 0
                  }}
                >
                  {cfg.label}
                </span>

                {/* Duration */}
                {log.durationMs > 0 && (
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                    {formatDuration(log.durationMs)}
                  </span>
                )}
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div
                  style={{
                    margin: '4px 0 4px 20px',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    fontSize: 10
                  }}
                >
                  {/* Error message */}
                  {log.error && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>Error: </span>
                      <span
                        style={{
                          color: 'rgba(255,255,255,0.7)',
                          fontFamily: 'monospace',
                          fontSize: 10
                        }}
                      >
                        {log.error}
                      </span>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div style={{ display: 'flex', gap: 16, color: 'rgba(255,255,255,0.4)' }}>
                    <span>Started: {new Date(log.startedAt).toLocaleTimeString()}</span>
                    {log.endedAt && (
                      <span>Ended: {new Date(log.endedAt).toLocaleTimeString()}</span>
                    )}
                    {log.durationMs > 0 && <span>Duration: {formatDuration(log.durationMs)}</span>}
                  </div>

                  {/* Output data */}
                  {log.output && Object.keys(log.output).length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span
                        style={{
                          color: 'rgba(255,255,255,0.5)',
                          fontWeight: 600,
                          display: 'block',
                          marginBottom: 4
                        }}
                      >
                        Output:
                      </span>
                      <pre
                        style={{
                          margin: 0,
                          padding: 8,
                          borderRadius: 4,
                          background: 'rgba(0,0,0,0.4)',
                          color: 'rgba(255,255,255,0.6)',
                          fontFamily: 'monospace',
                          fontSize: 9,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          maxHeight: 120,
                          overflow: 'auto'
                        }}
                      >
                        {JSON.stringify(log.output, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Spin animation for running icon */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
