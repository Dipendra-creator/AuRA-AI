/**
 * Workflows page — Two views:
 *  1. Dashboard: lists all saved pipelines with status, run history, and output
 *  2. Editor:    visual React Flow canvas for building/editing a pipeline
 */

import { useState, useEffect, useCallback, useRef, type ReactElement } from 'react'
import { LoadingSpinner } from '../components/LoadingSpinner'
import {
  getAllPipelines,
  updatePipeline,
  executePipeline,
  getPipelineRun,
  createPipeline,
  deletePipeline,
  listPipelineRuns,
  type PipelineListItem
} from '../data/data-service'
import type {
  PipelineNode,
  PipelineEdge,
  NodeRunResult,
  PipelineRun
} from '../../../shared/types/document.types'
import type { ToastType } from '../components/Toast'
import WorkflowCanvas from '../components/workflow/WorkflowCanvas'
import ExecutionLogPanel from '@renderer/components/workflow/ExecutionLogPanel'
import {
  Plus,
  Play,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Workflow,
  Layers,
  GitBranch
} from 'lucide-react'

/** Per-node run status exposed to the canvas */
export interface NodeRunInfo {
  status: string
  error?: string
  durationMs?: number
  output?: Record<string, unknown>
}

type ViewMode = 'dashboard' | 'editor'

interface WorkflowsProps {
  readonly addToast: (type: ToastType, text: string) => void
}

/* ─── Status Badge ─────────────────────────────────────────────── */

function StatusBadge({
  status,
  size = 'sm'
}: {
  status: string
  size?: 'sm' | 'md'
}): ReactElement {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    completed: { bg: 'rgba(16,185,129,0.12)', text: '#34d399', border: 'rgba(16,185,129,0.25)' },
    failed: { bg: 'rgba(239,68,68,0.12)', text: '#f87171', border: 'rgba(239,68,68,0.25)' },
    running: { bg: 'rgba(99,102,241,0.12)', text: '#a5b4fc', border: 'rgba(99,102,241,0.25)' },
    pending: { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', border: 'rgba(251,191,36,0.25)' },
    cancelled: { bg: 'rgba(156,163,175,0.12)', text: '#9ca3af', border: 'rgba(156,163,175,0.25)' },
    operational: {
      bg: 'rgba(16,185,129,0.12)',
      text: '#34d399',
      border: 'rgba(16,185,129,0.25)'
    }
  }
  const c = colors[status] ?? colors.pending
  const sz = size === 'md' ? { fontSize: 11, padding: '3px 10px' } : { fontSize: 9, padding: '2px 7px' }
  return (
    <span
      style={{
        ...sz,
        borderRadius: 999,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap'
      }}
    >
      {status}
    </span>
  )
}

/* ─── Run Status Icon ──────────────────────────────────────────── */

function RunStatusIcon({ status }: { status: string }): ReactElement {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={14} style={{ color: '#34d399' }} />
    case 'failed':
      return <XCircle size={14} style={{ color: '#f87171' }} />
    case 'running':
      return (
        <Loader2
          size={14}
          style={{ color: '#a5b4fc', animation: 'spin 1s linear infinite' }}
        />
      )
    default:
      return <Clock size={14} style={{ color: '#9ca3af' }} />
  }
}

/* ─── Time Ago Helper ──────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

/* ─── Run History Row ──────────────────────────────────────────── */

function RunRow({ run }: { run: PipelineRun }): ReactElement {
  const nodeCount = (run.nodeRuns ?? []).length
  const failedCount = (run.nodeRuns ?? []).filter((n) => n.status === 'failed').length
  const totalMs = (run.nodeRuns ?? []).reduce((sum, n) => sum + (n.durationMs ?? 0), 0)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)'
      }}
    >
      <RunStatusIcon status={run.status} />
      <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
        {run.status === 'completed'
          ? `${nodeCount} node${nodeCount !== 1 ? 's' : ''} completed`
          : run.status === 'failed'
            ? `Failed at ${failedCount} node${failedCount !== 1 ? 's' : ''}`
            : run.status}
      </span>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>
        {totalMs > 0 ? `${totalMs}ms` : ''}
      </span>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
        {timeAgo(run.startedAt)}
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════ */

export function Workflows({ addToast }: WorkflowsProps): ReactElement {
  const [view, setView] = useState<ViewMode>('dashboard')
  const [loading, setLoading] = useState(true)

  // Dashboard state
  const [pipelines, setPipelines] = useState<PipelineListItem[]>([])
  const [pipelineRuns, setPipelineRuns] = useState<Record<string, PipelineRun[]>>({})

  // Editor state
  const [editingPipeline, setEditingPipeline] = useState<PipelineListItem | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeRunInfo>>({})
  const [executionLogs, setExecutionLogs] = useState<NodeRunResult[]>([])
  const [showLogPanel, setShowLogPanel] = useState(false)
  const [selectedLogNodeId, setSelectedLogNodeId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Creating pipeline
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  /* ── Load All Pipelines ─────────────────────────────────────── */

  const loadPipelines = useCallback(async () => {
    try {
      const all = await getAllPipelines()
      setPipelines(all)
      // Fetch recent runs for each pipeline (in parallel, limit 5)
      const runsMap: Record<string, PipelineRun[]> = {}
      await Promise.all(
        all.map(async (p) => {
          try {
            const runs = await listPipelineRuns(p._id)
            runsMap[p._id] = runs.slice(0, 5)
          } catch {
            runsMap[p._id] = []
          }
        })
      )
      setPipelineRuns(runsMap)
    } catch {
      addToast('error', 'Failed to load pipelines')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadPipelines()
  }, [loadPipelines])

  // Cleanup polling
  useEffect(() => {
    return (): void => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  /* ── Create Pipeline ────────────────────────────────────────── */

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) {
      addToast('error', 'Pipeline name is required')
      return
    }
    try {
      await createPipeline({ name: newName.trim(), workspace: 'Default', nodes: [] })
      addToast('success', `Pipeline "${newName.trim()}" created`)
      setNewName('')
      setNewDesc('')
      setShowCreate(false)
      setLoading(true)
      await loadPipelines()
    } catch (err) {
      addToast('error', `Create failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [newName, addToast, loadPipelines])

  /* ── Delete Pipeline ────────────────────────────────────────── */

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      try {
        await deletePipeline(id)
        addToast('success', `Deleted "${name}"`)
        setPipelines((prev) => prev.filter((p) => p._id !== id))
      } catch (err) {
        addToast('error', `Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    },
    [addToast]
  )

  /* ── Open Pipeline Editor ───────────────────────────────────── */

  const openEditor = useCallback((pipeline: PipelineListItem) => {
    setEditingPipeline(pipeline)
    setNodeStatuses({})
    setExecutionLogs([])
    setShowLogPanel(false)
    setView('editor')
  }, [])

  /* ── Back to Dashboard ──────────────────────────────────────── */

  const backToDashboard = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setEditingPipeline(null)
    setView('dashboard')
    setLoading(true)
    await loadPipelines()
  }, [loadPipelines])

  /* ── Save Pipeline ──────────────────────────────────────────── */

  const handleSave = useCallback(
    async (nodes: PipelineNode[], edges: PipelineEdge[]) => {
      if (!editingPipeline) return
      try {
        await updatePipeline(editingPipeline._id, { nodes, edges })
        addToast('success', 'Pipeline saved successfully')
      } catch (err) {
        addToast('error', `Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    },
    [editingPipeline, addToast]
  )

  /* ── Polling ────────────────────────────────────────────────── */

  const startPolling = useCallback(
    (pipelineId: string, runId: string) => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const run: PipelineRun = await getPipelineRun(pipelineId, runId)
          const statuses: Record<string, NodeRunInfo> = {}
          for (const nr of run.nodeRuns ?? []) {
            statuses[nr.nodeId] = {
              status: nr.status,
              error: nr.error,
              durationMs: nr.durationMs,
              output: nr.output
            }
          }
          setNodeStatuses(statuses)
          setExecutionLogs([...(run.nodeRuns ?? [])])

          if (['completed', 'failed', 'cancelled'].includes(run.status)) {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setIsExecuting(false)
            if (run.status === 'completed')
              addToast('success', 'Pipeline execution completed')
            else if (run.status === 'failed') {
              const fn = (run.nodeRuns ?? []).find((n) => n.status === 'failed')
              addToast('error', fn ? `Failed: ${fn.error}` : 'Pipeline failed')
            }
          }
        } catch {
          /* keep trying */
        }
      }, 1000)
    },
    [addToast]
  )

  /* ── Execute ────────────────────────────────────────────────── */

  const handleExecute = useCallback(async () => {
    if (!editingPipeline) return
    setIsExecuting(true)
    setNodeStatuses({})
    setExecutionLogs([])
    setShowLogPanel(true)

    try {
      const run = await executePipeline(editingPipeline._id)
      const statuses: Record<string, NodeRunInfo> = {}
      for (const nr of run.nodeRuns ?? []) {
        statuses[nr.nodeId] = {
          status: nr.status,
          error: nr.error,
          durationMs: nr.durationMs,
          output: nr.output
        }
      }
      setNodeStatuses(statuses)
      setExecutionLogs([...(run.nodeRuns ?? [])])

      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        setIsExecuting(false)
        if (run.status === 'completed')
          addToast('success', 'Pipeline execution completed')
        else if (run.status === 'failed') {
          const fn = (run.nodeRuns ?? []).find((n) => n.status === 'failed')
          addToast('error', fn ? `Failed: ${fn.error}` : 'Pipeline failed')
        }
      } else {
        addToast('success', `Run started (${run._id})`)
        startPolling(editingPipeline._id, run._id)
      }
    } catch (err) {
      setIsExecuting(false)
      addToast('error', `Execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [editingPipeline, addToast, startPolling])

  const handleLogNodeClick = useCallback((nodeId: string) => {
    setSelectedLogNodeId((prev) => (prev === nodeId ? null : nodeId))
  }, [])

  /* ── Loading ────────────────────────────────────────────────── */

  if (loading) {
    return <LoadingSpinner message="Loading pipelines..." />
  }

  /* ══════════════════════════════════════════════════════════════
   *  EDITOR VIEW
   * ══════════════════════════════════════════════════════════════ */

  if (view === 'editor' && editingPipeline) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Main canvas */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <WorkflowCanvas
            pipelineId={editingPipeline._id}
            pipelineName={editingPipeline.name}
            initialNodes={editingPipeline.nodes ?? []}
            initialEdges={editingPipeline.edges ?? []}
            onSave={handleSave}
            onExecute={handleExecute}
            isExecuting={isExecuting}
            nodeRunStatuses={nodeStatuses}
            onBack={backToDashboard}
          />
          {showLogPanel && (
            <ExecutionLogPanel
              logs={executionLogs}
              isRunning={isExecuting}
              selectedNodeId={selectedLogNodeId}
              onNodeClick={handleLogNodeClick}
              onClose={() => setShowLogPanel(false)}
            />
          )}
        </div>

        {/* Bottom status bar */}
        <div className="workflow-status-bar">
          <div className="status-bar-left">
            <span className="status-bar-label">
              STATUS: {isExecuting ? 'EXECUTING' : editingPipeline.status?.toUpperCase() ?? 'IDLE'}
            </span>
          </div>
          <div className="status-bar-right">
            <span>v{editingPipeline.version ?? '1.0.0'}</span>
            {executionLogs.length > 0 && (
              <button
                onClick={() => setShowLogPanel(!showLogPanel)}
                style={{
                  background: 'rgba(99,102,241,0.2)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 6,
                  color: '#a5b4fc',
                  fontSize: 10,
                  padding: '2px 8px',
                  cursor: 'pointer'
                }}
              >
                {showLogPanel ? 'Hide Logs' : 'Show Logs'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════
   *  DASHBOARD VIEW
   * ══════════════════════════════════════════════════════════════ */

  return (
    <div style={{ padding: '0 32px', maxWidth: 1200, margin: '0 auto', height: '100%', overflowY: 'auto' }}>
      {/* Page Header */}
      <header className="page-header" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '28px 0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 24
      }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.95)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Workflow size={22} style={{ color: '#6366f1' }} />
            Workflows
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            Build, run, and manage your document processing pipelines
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(99,102,241,0.3)',
            transition: 'transform 0.15s, box-shadow 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.4)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = ''
            e.currentTarget.style.boxShadow = '0 2px 12px rgba(99,102,241,0.3)'
          }}
        >
          <Plus size={16} />
          Create Pipeline
        </button>
      </header>

      {/* Create Pipeline Modal */}
      {showCreate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setShowCreate(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(145deg, rgba(30,30,50,0.98), rgba(20,20,35,0.98))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: 28,
              width: 420,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.95)', margin: '0 0 16px' }}>
              Create New Pipeline
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>
                  Name
                </label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Invoice Processing Pipeline"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>
                  Description (optional)
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What does this pipeline do?"
                  rows={2}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: 13,
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Cards */}
      {pipelines.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 0',
            gap: 16
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'rgba(99,102,241,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Workflow size={28} style={{ color: '#6366f1' }} />
          </div>
          <h3 style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
            No pipelines yet
          </h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
            Create your first document processing pipeline to get started
          </p>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              marginTop: 8,
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
            Create Pipeline
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, paddingBottom: 32 }}>
          {pipelines.map((pipeline) => {
            const runs = pipelineRuns[pipeline._id] ?? []
            const nodeCount = (pipeline.nodes ?? []).length
            const edgeCount = (pipeline.edges ?? []).length

            return (
              <div
                key={pipeline._id}
                onClick={() => openEditor(pipeline)}
                style={{
                  background: 'linear-gradient(145deg, rgba(30,30,50,0.6), rgba(20,20,35,0.6))',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14,
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.transform = ''
                  e.currentTarget.style.boxShadow = ''
                }}
              >
                {/* Card Header */}
                <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <h3 style={{
                      fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)',
                      margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {pipeline.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <StatusBadge status={pipeline.status ?? 'operational'} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(pipeline._id, pipeline.name)
                        }}
                        title="Delete pipeline"
                        style={{
                          background: 'none', border: 'none', color: 'rgba(239,68,68,0.5)',
                          cursor: 'pointer', padding: 4, borderRadius: 4,
                          transition: 'color 0.15s'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(239,68,68,0.5)')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {pipeline.description && (
                    <p style={{
                      fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '0 0 8px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {pipeline.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Layers size={11} /> {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <GitBranch size={11} /> {edgeCount} edge{edgeCount !== 1 ? 's' : ''}
                    </span>
                    {pipeline.updatedAt && (
                      <span>Updated {timeAgo(pipeline.updatedAt)}</span>
                    )}
                  </div>
                </div>

                {/* Recent Runs */}
                <div style={{ padding: '10px 18px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Recent Runs
                  </div>
                  {runs.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', padding: '4px 0' }}>
                      No runs yet
                    </div>
                  ) : (
                    runs.slice(0, 3).map((run) => <RunRow key={run._id} run={run} />)
                  )}
                  {/* Quick run button */}
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditor(pipeline)
                      }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        padding: '6px 0',
                        borderRadius: 7,
                        border: '1px solid rgba(99,102,241,0.25)',
                        background: 'rgba(99,102,241,0.08)',
                        color: '#a5b4fc',
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                    >
                      <Play size={11} /> Open Editor
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
