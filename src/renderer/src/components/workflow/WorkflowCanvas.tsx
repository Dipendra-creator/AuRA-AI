/**
 * WorkflowCanvas — the main React Flow canvas for the visual pipeline builder.
 * Handles node rendering, edge connections, drag-and-drop from the palette,
 * zoom controls, and save/deploy actions.
 */
import { useCallback, useRef, useState, useMemo, type DragEvent } from 'react'
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
    MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { PipelineNodeType, PipelineNode as DomainPipelineNode, PipelineEdge } from '@shared/types/document.types'
import WorkflowNode from './WorkflowNode'
import WorkflowSidebar from './WorkflowSidebar'
import NodeConfigPanel from './NodeConfigPanel'
import { NODE_TYPE_MAP } from './node-types'
import { Save, PlayCircle, Rocket, Zap } from 'lucide-react'

const nodeTypes = { workflowNode: WorkflowNode }

interface WorkflowCanvasProps {
    pipelineId: string | null
    pipelineName: string
    initialNodes: DomainPipelineNode[]
    initialEdges: PipelineEdge[]
    onSave: (nodes: DomainPipelineNode[], edges: PipelineEdge[]) => void
    onExecute: () => void
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
            isSelected: false,
        },
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
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(99,102,241,0.7)', width: 16, height: 16 },
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
        config: (n.data.config as Record<string, unknown>) ?? {},
    }))
}

function toDomainEdges(flowEdges: Edge[]): PipelineEdge[] {
    return flowEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
    }))
}

export default function WorkflowCanvas({
    pipelineName,
    initialNodes,
    initialEdges,
    onSave,
    onExecute,
}: WorkflowCanvasProps) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null)
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
    const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(initialNodes))
    const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(initialEdges))
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

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
                        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(99,102,241,0.7)', width: 16, height: 16 },
                    },
                    eds,
                ),
            )
        },
        [setEdges],
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

            const bounds = reactFlowWrapper.current.getBoundingClientRect()
            const position = rfInstance.screenToFlowPosition({
                x: e.clientX - bounds.left,
                y: e.clientY - bounds.top,
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
                    isSelected: false,
                },
            }

            setNodes((nds) => [...nds, newNode])
        },
        [rfInstance, setNodes],
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
                nds.map((n) =>
                    n.id === nodeId ? { ...n, data: { ...n.data, config } } : n,
                ),
            )
        },
        [setNodes],
    )

    const handleSave = useCallback(() => {
        onSave(toDomainNodes(nodes), toDomainEdges(edges))
    }, [nodes, edges, onSave])

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
                        padding: '0 16px',
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
                            icon={<PlayCircle size={14} />}
                            label="Test Run"
                            onClick={onExecute}
                            accent
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
                            background: '#0a0a14',
                        }}
                        defaultEdgeOptions={{
                            animated: true,
                            style: { stroke: 'rgba(99,102,241,0.4)', strokeWidth: 2 },
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
                                background: 'rgba(0,0,0,0.5)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 8,
                            }}
                        />
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
}: {
    icon: React.ReactNode
    label: string
    onClick: () => void
    accent?: boolean
}) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: accent ? 'none' : '1px solid rgba(255,255,255,0.1)',
                background: accent
                    ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                    : 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
            }}
        >
            {icon}
            {label}
        </button>
    )
}
