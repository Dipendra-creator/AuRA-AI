/**
 * Workflow Builder page — visual pipeline canvas.
 * Shows a node-based workflow editor matching the design mockup.
 */

import { useState, type ReactElement } from 'react'

interface WorkflowNode {
    readonly id: string
    readonly label: string
    readonly name: string
    readonly icon: string
    readonly type: 'process' | 'review' | 'export'
}

const sampleNodes: readonly WorkflowNode[] = [
    { id: '1', label: 'PROCESS', name: 'Extract Node', icon: '⬇️', type: 'process' },
    { id: '2', label: 'REVIEW', name: 'Validate Node', icon: '✅', type: 'review' },
    { id: '3', label: 'PROCESS', name: 'Transform Node', icon: '🔄', type: 'process' },
    { id: '4', label: 'EXPORT', name: 'Export Node', icon: '📤', type: 'export' }
]

export function Workflows(): ReactElement {
    const [activeNode, setActiveNode] = useState<string>('2')

    return (
        <>
            {/* Header */}
            <header className="page-header">
                <div>
                    <h2>Workflow Builder</h2>
                    <p>Design and manage your document processing pipelines.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-ghost">
                        🧪 Test Pipeline
                    </button>
                    <button className="btn-primary">
                        🚀 Deploy
                    </button>
                </div>
            </header>

            {/* Pipeline Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div
                    style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: 'var(--color-accent-emerald)',
                        boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)'
                    }}
                />
                <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    CANVAS ACTIVE: DATA PIPELINE V2.4
                </span>
            </div>

            {/* Workflow Canvas */}
            <div className="workflow-canvas glass-panel">
                <div className="workflow-canvas-grid" />
                <div className="workflow-nodes">
                    {sampleNodes.map((node, index) => (
                        <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                            <div
                                className={`workflow-node ${activeNode === node.id ? 'active' : ''}`}
                                onClick={() => setActiveNode(node.id)}
                            >
                                <span className="workflow-node-icon">{node.icon}</span>
                                <span className="workflow-node-label">{node.label}</span>
                                <span className="workflow-node-name">{node.name}</span>
                            </div>
                            {index < sampleNodes.length - 1 && (
                                <div className="workflow-connector" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Node Configuration Panel */}
            {activeNode && (
                <div
                    className="glass-panel animate-fade-in"
                    style={{ marginTop: '24px', padding: '24px' }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'white' }}>Node Configuration</h3>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            ID: ND-{activeNode}45-98
                        </span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">Strict JSON Schema</span>
                        <div
                            style={{
                                width: '44px',
                                height: '24px',
                                borderRadius: '12px',
                                background: 'var(--color-primary)',
                                position: 'relative',
                                cursor: 'pointer'
                            }}
                        >
                            <div
                                style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: 'white',
                                    position: 'absolute',
                                    top: '3px',
                                    right: '3px',
                                    transition: 'all 0.2s'
                                }}
                            />
                        </div>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">Data Type Matching</span>
                        <div
                            style={{
                                width: '44px',
                                height: '24px',
                                borderRadius: '12px',
                                background: 'var(--color-primary)',
                                position: 'relative',
                                cursor: 'pointer'
                            }}
                        >
                            <div
                                style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: 'white',
                                    position: 'absolute',
                                    top: '3px',
                                    right: '3px'
                                }}
                            />
                        </div>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">Handle NULL values</span>
                        <div
                            style={{
                                width: '44px',
                                height: '24px',
                                borderRadius: '12px',
                                background: 'var(--color-bg-surface)',
                                border: '1px solid var(--glass-border)',
                                position: 'relative',
                                cursor: 'pointer'
                            }}
                        >
                            <div
                                style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: 'var(--color-text-muted)',
                                    position: 'absolute',
                                    top: '3px',
                                    left: '3px'
                                }}
                            />
                        </div>
                    </div>
                    <div style={{ marginTop: '16px' }}>
                        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                            Apply Changes →
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
