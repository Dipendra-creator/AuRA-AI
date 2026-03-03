/**
 * Workflow Builder page — visual pipeline canvas with React Flow.
 * Integrates WorkflowCanvas with the data layer for loading, saving,
 * executing, and real-time execution status tracking.
 */

import { useState, useEffect, useCallback, useRef, type ReactElement } from 'react'
import { LoadingSpinner } from '../components/LoadingSpinner'
import {
  getWorkflowsData,
  updatePipeline,
  executePipeline,
  getPipelineRun,
  type WorkflowsDataBundle
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

/** Per-node run status exposed to the canvas */
export interface NodeRunInfo {
  status: string
  error?: string
  durationMs?: number
  output?: Record<string, unknown>
}

interface WorkflowsProps {
  readonly addToast: (type: ToastType, text: string) => void
}

export function Workflows({ addToast }: WorkflowsProps): ReactElement {
  const [data, setData] = useState<WorkflowsDataBundle | null>(null)
  const [loading, setLoading] = useState(true)

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false)
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeRunInfo>>({})
  const [executionLogs, setExecutionLogs] = useState<NodeRunResult[]>([])
  const [showLogPanel, setShowLogPanel] = useState(false)
  const [selectedLogNodeId, setSelectedLogNodeId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    getWorkflowsData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  // Cleanup polling on unmount
  useEffect(() => {
    return (): void => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  /** Start polling a pipeline run for status updates */
  const startPolling = useCallback(
    (pipelineId: string, runId: string) => {
      if (pollRef.current) clearInterval(pollRef.current)

      pollRef.current = setInterval(async () => {
        try {
          const run: PipelineRun = await getPipelineRun(pipelineId, runId)

          // Update per-node statuses
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

          // Stop polling when run is terminal
          if (['completed', 'failed', 'cancelled'].includes(run.status)) {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setIsExecuting(false)

            if (run.status === 'completed') {
              addToast('success', 'Pipeline execution completed successfully')
            } else if (run.status === 'failed') {
              const failedNode = (run.nodeRuns ?? []).find((nr) => nr.status === 'failed')
              addToast(
                'error',
                failedNode
                  ? `Pipeline failed at node: ${failedNode.error ?? 'Unknown error'}`
                  : 'Pipeline execution failed'
              )
            }
          }
        } catch {
          // Polling error — keep trying
        }
      }, 1000)
    },
    [addToast]
  )

  /** Save pipeline nodes + edges to the backend */
  const handleSave = useCallback(
    async (nodes: PipelineNode[], edges: PipelineEdge[]) => {
      if (!data?.pipeline.id) {
        addToast('error', 'Cannot save — no pipeline ID')
        return
      }
      try {
        await updatePipeline(data.pipeline.id, { nodes, edges })
        addToast('success', 'Pipeline saved successfully')
      } catch (err) {
        addToast('error', `Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    },
    [data, addToast]
  )

  /** Execute the pipeline with status polling */
  const handleExecute = useCallback(async () => {
    if (!data?.pipeline.id) {
      addToast('error', 'Cannot execute — no pipeline ID')
      return
    }

    // Reset state
    setIsExecuting(true)
    setNodeStatuses({})
    setExecutionLogs([])
    setShowLogPanel(true)

    try {
      const run = await executePipeline(data.pipeline.id)

      // Process initial result — may already have node results
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

      // If execution completed synchronously (small pipelines), show result
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        setIsExecuting(false)
        if (run.status === 'completed') {
          addToast('success', 'Pipeline execution completed successfully')
        } else if (run.status === 'failed') {
          const failedNode = (run.nodeRuns ?? []).find((nr) => nr.status === 'failed')
          addToast(
            'error',
            failedNode
              ? `Pipeline failed: ${failedNode.error ?? 'Unknown error'}`
              : 'Pipeline execution failed'
          )
        }
      } else {
        // Pipeline is still running — poll for updates
        addToast('success', `Pipeline run started (${run._id})`)
        startPolling(data.pipeline.id, run._id)
      }
    } catch (err) {
      setIsExecuting(false)
      addToast('error', `Execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [data, addToast, startPolling])

  /** Handle node click from log panel */
  const handleLogNodeClick = useCallback((nodeId: string) => {
    setSelectedLogNodeId((prev) => (prev === nodeId ? null : nodeId))
  }, [])

  if (loading || !data) {
    return <LoadingSpinner message="Loading pipelines..." />
  }

  return (
    <div
      className="workflow-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      {/* Main canvas area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <WorkflowCanvas
          pipelineId={data.pipeline.id ?? null}
          pipelineName={data.pipeline.name}
          initialNodes={data.nodes as PipelineNode[]}
          initialEdges={data.edges as PipelineEdge[]}
          onSave={handleSave}
          onExecute={handleExecute}
          isExecuting={isExecuting}
          nodeRunStatuses={nodeStatuses}
        />

        {/* Execution Log Panel */}
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

      {/* Bottom Status Bar */}
      <div className="workflow-status-bar">
        <div className="status-bar-left">
          <span className="status-bar-label">
            STATUS: {isExecuting ? 'EXECUTING' : data.pipeline.status.toUpperCase()}
          </span>
          <span className="status-bar-latency">LATENCY: {data.pipeline.latency}</span>
        </div>
        <div className="status-bar-right">
          <span>WORKSPACE: {data.pipeline.workspace}</span>
          <span>VERSION: {data.pipeline.version}</span>
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
