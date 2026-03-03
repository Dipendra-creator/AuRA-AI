/**
 * Workflow Builder page — visual pipeline canvas with React Flow.
 * Integrates WorkflowCanvas with the data layer for loading and saving.
 */

import { useState, useEffect, useCallback, type ReactElement } from 'react'
import { LoadingSpinner } from '../components/LoadingSpinner'
import {
  getWorkflowsData,
  updatePipeline,
  executePipeline,
  type WorkflowsDataBundle
} from '../data/data-service'
import type { PipelineNode, PipelineEdge } from '../../../shared/types/document.types'
import type { ToastType } from '../components/Toast'
import WorkflowCanvas from '../components/workflow/WorkflowCanvas'

interface WorkflowsProps {
  readonly addToast: (type: ToastType, text: string) => void
}

export function Workflows({ addToast }: WorkflowsProps): ReactElement {
  const [data, setData] = useState<WorkflowsDataBundle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getWorkflowsData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  /** Save pipeline nodes + edges to the backend */
  const handleSave = useCallback(
    async (nodes: PipelineNode[], edges: PipelineEdge[]) => {
      if (!data?.pipeline.id) {
        addToast('error', 'Cannot save — no pipeline ID (using mock data)')
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

  /** Execute the pipeline */
  const handleExecute = useCallback(async () => {
    if (!data?.pipeline.id) {
      addToast('error', 'Cannot execute — no pipeline ID (using mock data)')
      return
    }
    try {
      const run = await executePipeline(data.pipeline.id)
      addToast('success', `Pipeline run started (${run._id})`)
    } catch (err) {
      addToast('error', `Execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [data, addToast])

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
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <WorkflowCanvas
          pipelineId={data.pipeline.id ?? null}
          pipelineName={data.pipeline.name}
          initialNodes={data.nodes as PipelineNode[]}
          initialEdges={data.edges as PipelineEdge[]}
          onSave={handleSave}
          onExecute={handleExecute}
        />
      </div>

      {/* Bottom Status Bar */}
      <div className="workflow-status-bar">
        <div className="status-bar-left">
          <span className="status-bar-label">STATUS: {data.pipeline.status.toUpperCase()}</span>
          <span className="status-bar-latency">LATENCY: {data.pipeline.latency}</span>
        </div>
        <div className="status-bar-right">
          <span>WORKSPACE: {data.pipeline.workspace}</span>
          <span>VERSION: {data.pipeline.version}</span>
        </div>
      </div>
    </div>
  )
}
