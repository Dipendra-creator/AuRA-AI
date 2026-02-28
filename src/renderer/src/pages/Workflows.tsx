/**
 * Workflow Builder page — visual pipeline canvas with side panel.
 * Side-by-side layout: Canvas (left) + Node Configuration (right).
 * Includes top toolbar, left tool sidebar, zoom controls, and status bar.
 * Data sourced from mock data service.
 */

import { useState, useMemo, type ReactElement } from 'react'
import { getWorkflowsData } from '../data/mock-data.service'
import type { PipelineNode } from '../../../shared/types/document.types'

export function Workflows(): ReactElement {
    const { pipeline, nodes } = useMemo(() => getWorkflowsData(), [])
    const [activeNodeId, setActiveNodeId] = useState<string>(nodes[2]?.id ?? '')
    const [designMode, setDesignMode] = useState<'design' | 'monitor'>('design')

    const activeNode: PipelineNode | undefined = nodes.find((n) => n.id === activeNodeId)

    /** Get icon character for node type */
    function getNodeIcon(icon: string): string {
        const iconMap: Record<string, string> = {
            download: '⬇',
            extract: '⟐',
            validate: '✓',
            transform: '⟳',
            upload: '⬆'
        }
        return iconMap[icon] ?? '●'
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
                    <button className="btn-ghost toolbar-btn">
                        💾 Save
                    </button>
                    <button className="btn-ghost toolbar-btn toolbar-btn-test">
                        🔴 Test Pipeline
                    </button>
                    <button className="btn-primary toolbar-btn">
                        🚀 Deploy
                    </button>
                </div>
            </div>

            {/* Main Content: Tool sidebar + Canvas + Config Panel */}
            <div className="workflow-main">
                {/* Left Tool Sidebar */}
                <div className="workflow-tool-sidebar">
                    <button className="tool-icon active" title="Add Node">🔲</button>
                    <button className="tool-icon" title="Triggers">⚡</button>
                    <button className="tool-icon" title="Connectors">🔗</button>
                    <button className="tool-icon" title="Custom Code">{'</>'}</button>
                    <div className="tool-separator" />
                    <button className="tool-icon" title="Settings">⚙️</button>
                    <button className="tool-icon" title="Help">❓</button>
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
                            {nodes.map((node, index) => (
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
                                    {index < nodes.length - 1 && (
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
                        <button className="zoom-ctrl-btn" title="Zoom In">🔍+</button>
                        <button className="zoom-ctrl-btn" title="Zoom Out">🔍−</button>
                        <div className="zoom-separator" />
                        <button className="zoom-ctrl-btn" title="Fit to Screen">⛶</button>
                    </div>
                </div>

                {/* Right Config Panel */}
                {activeNode && (
                    <div className="workflow-config-panel glass-panel animate-slide-in-right">
                        <div className="config-panel-header">
                            <h3>Node Configuration</h3>
                            <button className="config-close-btn" onClick={() => setActiveNodeId('')}>
                                ✕
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
                            <div className="config-toggle-row">
                                <span>Strict JSON Schema</span>
                                <div className={`toggle-switch ${activeNode.config.strictJsonSchema ? 'on' : 'off'}`}>
                                    <div className="toggle-thumb" />
                                </div>
                            </div>
                            <div className="config-toggle-row">
                                <span>Data Type Matching</span>
                                <div className={`toggle-switch ${activeNode.config.dataTypeMatching ? 'on' : 'off'}`}>
                                    <div className="toggle-thumb" />
                                </div>
                            </div>
                            <div className="config-toggle-row">
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
                                    <button className="redirect-link-btn" title="Go to node">🔗</button>
                                </div>
                            </div>
                        )}

                        {/* Apply Button */}
                        <button className="btn-primary config-apply-btn">
                            Apply Changes ✓
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
