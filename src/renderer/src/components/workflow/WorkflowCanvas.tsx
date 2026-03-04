/**
 * WorkflowCanvas — the main React Flow canvas for the visual pipeline builder.
 * Handles node rendering, edge connections, drag-and-drop from the palette,
 * zoom controls, and save/deploy actions.
 */
import { useCallback, useRef, useState, useMemo, useEffect, type DragEvent } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  MarkerType
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type {
  PipelineNodeType,
  PipelineNode as DomainPipelineNode,
  PipelineEdge
} from '@shared/types/document.types'
import WorkflowNode from './WorkflowNode'
import WorkflowSidebar from './WorkflowSidebar'
import NodeConfigPanel from './NodeConfigPanel'
import { NODE_TYPE_MAP } from './node-types'
import { Save, PlayCircle, Rocket, Zap, Loader2 } from 'lucide-react'
import type { NodeRunInfo } from '../../pages/Workflows'

const nodeTypes = { workflowNode: WorkflowNode }

interface WorkflowCanvasProps {
  pipelineId: string | null
  pipelineName: string
  initialNodes: DomainPipelineNode[]
  initialEdges: PipelineEdge[]
  onSave: (nodes: DomainPipelineNode[], edges: PipelineEdge[]) => void | Promise<void>
  onExecute: () => void
  isExecuting?: boolean
  nodeRunStatuses?: Record<string, NodeRunInfo>
}

let nodeIdCounter = 0
function genNodeId(): string {
  nodeIdCounter++
  return `node_${Date.now()}_${nodeIdCounter}`
}

/** Convert domain nodes/edges to React Flow format */
function toFlowNodes(domainNodes: DomainPipelineNode[]): Node[] {
  return domainNodes.map((n) => ({
    id: n.id,
    type: 'workflowNode',
    position: { x: n.position.x, y: n.position.y },
    data: {
      label: n.label,
      name: n.name,
      nodeType: n.type,
      config: { ...n.config },
      isSelected: false
    }
  }))
}

function toFlowEdges(domainEdges: PipelineEdge[]): Edge[] {
  return domainEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: { stroke: 'rgba(99,102,241,0.5)', strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'rgba(99,102,241,0.7)',
      width: 16,
      height: 16
    }
  }))
}

/** Convert React Flow nodes/edges back to domain format */
function toDomainNodes(flowNodes: Node[]): DomainPipelineNode[] {
  return flowNodes.map((n) => ({
    id: n.id,
    label: n.data.label as string,
    name: n.data.name as string,
    type: n.data.nodeType as PipelineNodeType,
    icon: NODE_TYPE_MAP[n.data.nodeType as PipelineNodeType]?.icon ?? 'cpu',
    position: { x: n.position.x, y: n.position.y },
    config: (n.data.config as Record<string, unknown>) ?? {}
  }))
}

function toDomainEdges(flowEdges: Edge[]): PipelineEdge[] {
  return flowEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: typeof e.label === 'string' ? e.label : undefined
  }))
}

export default function WorkflowCanvas({
  pipelineName,
  initialNodes,
  initialEdges,
  onSave,
  onExecute,
  isExecuting = false,
  nodeRunStatuses = {}
}: WorkflowCanvasProps): React.JSX.Element {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(initialNodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(initialEdges))
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Merge execution statuses into node data whenever they change
  useEffect(() => {
    if (Object.keys(nodeRunStatuses).length === 0) return
    setNodes((nds) =>
      nds.map((n) => {
        const info = nodeRunStatuses[n.id]
        if (!info) return n
        return {
          ...n,
          data: {
            ...n.data,
            runStatus: info.status,
            runError: info.error,
            runDurationMs: info.durationMs
          }
        }
      })
    )
  }, [nodeRunStatuses, setNodes])

  // Re-initialize when initialNodes/initialEdges change
  const memoizedNodeTypes = useMemo(() => nodeTypes, [])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: 'rgba(99,102,241,0.5)', strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: 'rgba(99,102,241,0.7)',
              width: 16,
              height: 16
            }
          },
          eds
        )
      )
    },
    [setEdges]
  )

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const nodeType = e.dataTransfer.getData('application/workflow-node-type') as PipelineNodeType
      if (!nodeType || !rfInstance || !reactFlowWrapper.current) return

      // screenToFlowPosition already converts screen coords to flow coords,
      // so pass raw clientX/clientY — no need to subtract bounds offset
      const position = rfInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY
      })

      const typeDef = NODE_TYPE_MAP[nodeType]
      const newNode: Node = {
        id: genNodeId(),
        type: 'workflowNode',
        position,
        data: {
          label: typeDef?.label ?? nodeType,
          name: `${typeDef?.label ?? nodeType} Node`,
          nodeType,
          config: { ...(typeDef?.defaultConfig ?? {}) },
          isSelected: false
        }
      }

      setNodes((nds) => [...nds, newNode])
    },
    [rfInstance, setNodes]
  )

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const handleConfigChange = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config } } : n))
      )
    },
    [setNodes]
  )

  const handleSave = useCallback(async () => {
    await onSave(toDomainNodes(nodes), toDomainEdges(edges))
  }, [nodes, edges, onSave])

  /** Auto-save, then execute */
  const handleExecute = useCallback(async () => {
    await onSave(toDomainNodes(nodes), toDomainEdges(edges))
    onExecute()
  }, [nodes, edges, onSave, onExecute])

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      {/* Left sidebar — node palette */}
      <WorkflowSidebar />

      {/* Center — canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div
          style={{
            height: 52,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} style={{ color: '#6366f1' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
              {pipelineName || 'Untitled Pipeline'}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
              {nodes.length} nodes · {edges.length} edges
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ToolbarButton icon={<Save size={14} />} label="Save" onClick={handleSave} />
            <ToolbarButton
              icon={
                isExecuting ? (
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <PlayCircle size={14} />
                )
              }
              label={isExecuting ? 'Running...' : 'Test Run'}
              onClick={handleExecute}
              accent
              disabled={isExecuting}
            />
            <ToolbarButton icon={<Rocket size={14} />} label="Deploy" onClick={handleSave} />
          </div>
        </div>

        {/* Canvas */}
        <div ref={reactFlowWrapper} style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={memoizedNodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{
              background: '#0a0a14'
            }}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: 'rgba(99,102,241,0.4)', strokeWidth: 2 }
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(255,255,255,0.04)"
            />
            <Controls
              style={{
                background: 'rgba(15,15,30,0.9)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 10,
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                backdropFilter: 'blur(12px)'
              }}
              className="dark-controls"
            />
            {/* Dark theme overrides for React Flow Controls */}
            <style>{`
              .dark-controls .react-flow__controls-button {
                background: rgba(15,15,30,0.95) !important;
                border: none !important;
                border-bottom: 1px solid rgba(255,255,255,0.06) !important;
                fill: rgba(180,180,220,0.8) !important;
                color: rgba(180,180,220,0.8) !important;
                width: 28px !important;
                height: 28px !important;
                padding: 5px !important;
                transition: all 0.2s ease !important;
              }
              .dark-controls .react-flow__controls-button:hover {
                background: rgba(99,102,241,0.2) !important;
                fill: #a5b4fc !important;
                color: #a5b4fc !important;
              }
              .dark-controls .react-flow__controls-button:last-child {
                border-bottom: none !important;
              }
              .dark-controls .react-flow__controls-button svg {
                fill: inherit !important;
                max-width: 14px !important;
                max-height: 14px !important;
              }
            `}</style>
          </ReactFlow>
        </div>
      </div>

      {/* Right sidebar — config panel */}
      {selectedNode && (
        <NodeConfigPanel
          nodeId={selectedNode.id}
          nodeName={selectedNode.data.name as string}
          nodeType={selectedNode.data.nodeType as PipelineNodeType}
          config={(selectedNode.data.config as Record<string, unknown>) ?? {}}
          onConfigChange={handleConfigChange}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  )
}

function ToolbarButton({
  icon,
  label,
  onClick,
  accent = false,
  disabled = false
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  accent?: boolean
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 8,
        border: accent ? 'none' : '1px solid rgba(255,255,255,0.1)',
        background: accent ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'rgba(255,255,255,0.04)',
        color: 'rgba(255,255,255,0.9)',
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.6 : 1
      }}
    >
      {icon}
      {label}
    </button>
  )
}
