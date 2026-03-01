/**
 * Workflow Builder page — visual pipeline canvas with side panel.
 * Side-by-side layout: Canvas (left) + Node Configuration (right).
 * Includes top toolbar, left tool sidebar, zoom controls, and status bar.
 * Save and Deploy buttons now wired to the Go backend API.
 */

import { useState, useEffect, useCallback, type ReactElement, type ReactNode } from 'react'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { getWorkflowsData, updatePipeline, type WorkflowsDataBundle } from '../data/data-service'
import type { PipelineNode } from '../../../shared/types/document.types'
import type { ToastType } from '../components/Toast'
import {
    Save, PlayCircle, Rocket, Loader2, Plus, Zap, Link, Settings, HelpCircle,
    ZoomIn, ZoomOut, Maximize, X, Check, Download, ScanSearch, CheckCircle,
    RefreshCw, Upload
} from '../components/Icons'

interface WorkflowsProps {
    readonly addToast: (type: ToastType, text: string) => void
}

export function Workflows({ addToast }: WorkflowsProps): ReactElement {
    const [data, setData] = useState<WorkflowsDataBundle | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeNodeId, setActiveNodeId] = useState<string>('')
    const [designMode, setDesignMode] = useState<'design' | 'monitor'>('design')
    // Local mutable copy of nodes for editing
    const [editedNodes, setEditedNodes] = useState<PipelineNode[]>([])

    useEffect(() => {
        getWorkflowsData().then((result) => {
            setData(result)
            setEditedNodes([...result.nodes] as PipelineNode[])
            setActiveNodeId(result.nodes[2]?.id ?? '')
            setLoading(false)
        })
    }, [])

    /** Update a node's config toggle */
    const handleToggle = useCallback(
        (nodeId: string, configKey: keyof PipelineNode['config']) => {
            setEditedNodes((prev) =>
                prev.map((node) =>
                    node.id === nodeId
                        ? {
                            ...node,
                            config: {
                                ...node.config,
                                [configKey]: !node.config[configKey]
                            }
                        }
                        : node
                )
            )
        },
        []
    )

    /** Save pipeline changes to backend */
    const handleSave = useCallback(async () => {
        if (!data?.pipeline.id) {
            addToast('error', 'Cannot save — no pipeline ID (using mock data)')
            return
        }
        setSaving(true)
        try {
            await updatePipeline(data.pipeline.id, { nodes: editedNodes })
            addToast('success', 'Pipeline saved successfully')
        } catch (err) {
            addToast('error', `Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setSaving(false)
        }
    }, [data, editedNodes, addToast])

    /** Deploy pipeline */
    const handleDeploy = useCallback(async () => {
        if (!data?.pipeline.id) {
            addToast('error', 'Cannot deploy — no pipeline ID (using mock data)')
            return
        }
        setSaving(true)
        try {
            await updatePipeline(data.pipeline.id, { status: 'deployed', nodes: editedNodes })
            addToast('success', 'Pipeline deployed successfully')
        } catch (err) {
            addToast('error', `Deploy failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setSaving(false)
        }
    }, [data, editedNodes, addToast])

    if (loading || !data) {
        return <LoadingSpinner message="Loading pipelines..." />
    }

    const { pipeline } = data
    const activeNode: PipelineNode | undefined = editedNodes.find((n) => n.id === activeNodeId)

    /** Get icon element for node type */
    function getNodeIcon(icon: string): ReactNode {
        const iconMap: Record<string, ReactNode> = {
            download: <Download size={16} />,
            extract: <ScanSearch size={16} />,
            validate: <CheckCircle size={16} />,
            transform: <RefreshCw size={16} />,
            upload: <Upload size={16} />
        }
        return iconMap[icon] ?? <CheckCircle size={16} />
    }

    /** Get label color class by node type */
    function getNodeLabelClass(type: PipelineNode['type']): string {
        switch (type) {
            case 'review':
                return 'node-label-cyan'
            case 'process':
                return 'node-label-purple'
            case 'export':
                return 'node-label-emerald'
            default:
                return 'node-label-cyan'
        }
    }

    return (
        <div className="workflow-page">
            {/* Top Toolbar */}
            <div className="workflow-toolbar">
                <div className="toolbar-left">
                    <div className="toolbar-mode-toggle">
                        <button
                            className={`mode-btn ${designMode === 'design' ? 'active' : ''}`}
                            onClick={() => setDesignMode('design')}
                        >
                            Design
                        </button>
                        <button
                            className={`mode-btn ${designMode === 'monitor' ? 'active' : ''}`}
                            onClick={() => setDesignMode('monitor')}
                        >
                            Monitor
                        </button>
                    </div>
                </div>
                <div className="toolbar-right">
                    <button
                        className="btn-ghost toolbar-btn"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : <><Save size={14} /> Save</>}
                    </button>
                    <button className="btn-ghost toolbar-btn toolbar-btn-test">
                        <PlayCircle size={14} /> Test Pipeline
                    </button>
                    <button
                        className="btn-primary toolbar-btn"
                        onClick={handleDeploy}
                        disabled={saving}
                    >
                        {saving ? <><Loader2 size={14} className="spin" /> Deploying...</> : <><Rocket size={14} /> Deploy</>}
                    </button>
                </div>
            </div>

            {/* Main Content: Tool sidebar + Canvas + Config Panel */}
            <div className="workflow-main">
                {/* Left Tool Sidebar */}
                <div className="workflow-tool-sidebar">
                    <button className="tool-icon active" title="Add Node"><Plus size={18} /></button>
                    <button className="tool-icon" title="Triggers"><Zap size={18} /></button>
                    <button className="tool-icon" title="Connectors"><Link size={18} /></button>
                    <button className="tool-icon" title="Custom Code">{'</>'}</button>
                    <div className="tool-separator" />
                    <button className="tool-icon" title="Settings"><Settings size={18} /></button>
                    <button className="tool-icon" title="Help"><HelpCircle size={18} /></button>
                </div>

                {/* Canvas Area */}
                <div className="workflow-canvas-area">
                    {/* Pipeline Status */}
                    <div className="pipeline-status-badge">
                        <span className="pipeline-status-dot" />
                        <span>CANVAS ACTIVE: {pipeline.name}</span>
                    </div>

                    {/* Canvas */}
                    <div className="workflow-canvas glass-panel">
                        <div className="workflow-canvas-grid" />
                        <div className="workflow-nodes">
                            {editedNodes.map((node, index) => (
                                <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
                                    <div
                                        className={`workflow-node ${activeNodeId === node.id ? 'active' : ''} animate-scale-in`}
                                        style={{ animationDelay: `${index * 100}ms` }}
                                        onClick={() => setActiveNodeId(node.id)}
                                    >
                                        <div className={`workflow-node-icon-circle ${getNodeLabelClass(node.type)}`}>
                                            <span>{getNodeIcon(node.icon)}</span>
                                        </div>
                                        <span className={`workflow-node-label ${getNodeLabelClass(node.type)}`}>
                                            {node.label}
                                        </span>
                                        <span className="workflow-node-name">{node.name}</span>
                                    </div>
                                    {index < editedNodes.length - 1 && (
                                        <div className="workflow-connector">
                                            <div className="connector-line" />
                                            <div className="connector-pulse" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Zoom Controls */}
                    <div className="workflow-zoom-controls">
                        <button className="zoom-ctrl-btn" title="Zoom In"><ZoomIn size={16} /></button>
                        <button className="zoom-ctrl-btn" title="Zoom Out"><ZoomOut size={16} /></button>
                        <div className="zoom-separator" />
                        <button className="zoom-ctrl-btn" title="Fit to Screen"><Maximize size={16} /></button>
                    </div>
                </div>

                {/* Right Config Panel */}
                {activeNode && (
                    <div className="workflow-config-panel glass-panel animate-slide-in-right">
                        <div className="config-panel-header">
                            <h3>Node Configuration</h3>
                            <button className="config-close-btn" onClick={() => setActiveNodeId('')}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* Node Identity */}
                        <div className="config-node-identity glass-panel">
                            <div className={`config-node-icon ${getNodeLabelClass(activeNode.type)}`}>
                                {getNodeIcon(activeNode.icon)}
                            </div>
                            <div className="config-node-info">
                                <h4 className="config-node-name">{activeNode.name.toUpperCase()}</h4>
                                <p className="config-node-id">ID: {activeNode.id}</p>
                            </div>
                        </div>

                        {/* Validation Rules */}
                        <div className="config-section">
                            <h5 className="config-section-title">VALIDATION RULES</h5>
                            <div
                                className="config-toggle-row"
                                onClick={() => handleToggle(activeNode.id, 'strictJsonSchema')}
                            >
                                <span>Strict JSON Schema</span>
                                <div className={`toggle-switch ${activeNode.config.strictJsonSchema ? 'on' : 'off'}`}>
                                    <div className="toggle-thumb" />
                                </div>
                            </div>
                            <div
                                className="config-toggle-row"
                                onClick={() => handleToggle(activeNode.id, 'dataTypeMatching')}
                            >
                                <span>Data Type Matching</span>
                                <div className={`toggle-switch ${activeNode.config.dataTypeMatching ? 'on' : 'off'}`}>
                                    <div className="toggle-thumb" />
                                </div>
                            </div>
                            <div
                                className="config-toggle-row"
                                onClick={() => handleToggle(activeNode.id, 'handleNullValues')}
                            >
                                <span>Handle NULL values</span>
                                <div className={`toggle-switch ${activeNode.config.handleNullValues ? 'on' : 'off'}`}>
                                    <div className="toggle-thumb" />
                                </div>
                            </div>
                        </div>

                        {/* API Integration */}
                        <div className="config-section">
                            <h5 className="config-section-title">API INTEGRATION</h5>
                            <div className="config-select">
                                <span>{activeNode.config.apiIntegration}</span>
                                <span className="select-chevron">▾</span>
                            </div>
                        </div>

                        {/* Success Redirect */}
                        {activeNode.config.successRedirect && (
                            <div className="config-section">
                                <h5 className="config-section-title">SUCCESS REDIRECT</h5>
                                <div className="config-redirect">
                                    <span>{activeNode.config.successRedirect}</span>
                                    <button className="redirect-link-btn" title="Go to node"><Link size={14} /></button>
                                </div>
                            </div>
                        )}

                        {/* Apply Button */}
                        <button
                            className="btn-primary config-apply-btn"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : <>Apply Changes <Check size={14} /></>}
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom Status Bar */}
            <div className="workflow-status-bar">
                <div className="status-bar-left">
                    <span className="status-bar-label">STATUS: OPERATIONAL</span>
                    <span className="status-bar-latency">LATENCY: {pipeline.latency}</span>
                </div>
                <div className="status-bar-right">
                    <span>ENTERPRISE WORKSPACE: {pipeline.workspace}</span>
                    <span>VERSION: {pipeline.version}</span>
                </div>
            </div>
        </div>
    )
}
