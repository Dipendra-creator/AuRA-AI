/**
 * WorkflowNode — custom React Flow node component.
 * Renders each pipeline node with its type-specific colour,
 * icon, label, connection handles, and execution status effects.
 *
 * Status effects:
 *   - Running: yellow border glow + pulsing dot
 *   - Completed: green dot + duration badge
 *   - Failed: red border glow + red dot + error message on hover
 */
import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { PipelineNodeType } from '@shared/types/document.types'
import { NODE_TYPE_MAP } from './node-types'
import { Upload, Brain, Cpu, Edit3, Plug, Eye, GitFork, FileOutput } from 'lucide-react'

const ICON_MAP: Record<string, React.FC<{ size?: number; className?: string }>> = {
    upload: Upload,
    brain: Brain,
    cpu: Cpu,
    edit: Edit3,
    plug: Plug,
    eye: Eye,
    gitFork: GitFork,
    fileOutput: FileOutput
}

interface WorkflowNodeData {
    label: string
    name: string
    nodeType: PipelineNodeType
    config: Record<string, unknown>
    isSelected: boolean
    runStatus?: string
    runError?: string
    runDurationMs?: number
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
}

function WorkflowNode({
    data,
    selected
}: NodeProps & { data: WorkflowNodeData }): React.JSX.Element {
    const typeDef = NODE_TYPE_MAP[data.nodeType]
    const IconComp = ICON_MAP[typeDef?.icon ?? 'cpu'] ?? Cpu
    const [showError, setShowError] = useState(false)

    const statusColor =
        data.runStatus === 'completed'
            ? '#10b981'
            : data.runStatus === 'running'
                ? '#f59e0b'
                : data.runStatus === 'failed'
                    ? '#ef4444'
                    : undefined

    const isRunning = data.runStatus === 'running'
    const isFailed = data.runStatus === 'failed'
    const isCompleted = data.runStatus === 'completed'

    // Border: use status color when available, otherwise default
    const borderColor = isFailed
        ? '#ef4444'
        : isRunning
            ? '#f59e0b'
            : isCompleted
                ? '#10b981'
                : selected
                    ? (typeDef?.color ?? '#6366f1')
                    : 'rgba(255,255,255,0.08)'

    // Box shadow: enhanced glow for active states
    const boxShadow = isFailed
        ? '0 0 20px rgba(239,68,68,0.3), 0 0 6px rgba(239,68,68,0.2)'
        : isRunning
            ? '0 0 20px rgba(245,158,11,0.3), 0 0 6px rgba(245,158,11,0.2)'
            : isCompleted
                ? '0 0 12px rgba(16,185,129,0.2)'
                : selected
                    ? `0 0 20px ${typeDef?.color ?? '#6366f1'}40`
                    : '0 2px 12px rgba(0,0,0,0.3)'

    return (
        <div
            className="workflow-node"
            style={{
                background: `linear-gradient(135deg, ${typeDef?.gradientFrom ?? '#6366f1'}20, ${typeDef?.gradientTo ?? '#4f46e5'}10)`,
                border: `1.5px solid ${borderColor}`,
                borderRadius: 14,
                padding: '14px 18px',
                minWidth: 180,
                backdropFilter: 'blur(12px)',
                transition: 'all 0.3s ease',
                boxShadow,
                position: 'relative',
                animation: isRunning ? 'nodeRunPulse 2s ease-in-out infinite' : undefined
            }}
            onMouseEnter={() => isFailed && setShowError(true)}
            onMouseLeave={() => setShowError(false)}
        >
            {/* Status indicator dot */}
            {statusColor && (
                <div
                    style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: statusColor,
                        boxShadow: `0 0 6px ${statusColor}`,
                        animation: isRunning ? 'dotPulse 1.5s ease-in-out infinite' : undefined
                    }}
                />
            )}

            {/* Duration badge (completed) */}
            {isCompleted && data.runDurationMs !== undefined && data.runDurationMs > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: -8,
                        right: 8,
                        padding: '1px 6px',
                        borderRadius: 8,
                        background: 'rgba(16,185,129,0.15)',
                        border: '1px solid rgba(16,185,129,0.3)',
                        fontSize: 8,
                        color: '#10b981',
                        fontWeight: 600,
                        letterSpacing: '0.03em'
                    }}
                >
                    {formatDuration(data.runDurationMs)}
                </div>
            )}

            {/* Error tooltip (failed) */}
            {isFailed && showError && data.runError && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        right: 0,
                        marginBottom: 6,
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        backdropFilter: 'blur(12px)',
                        fontSize: 9,
                        color: '#fca5a5',
                        lineHeight: 1.4,
                        maxWidth: 260,
                        wordBreak: 'break-word',
                        zIndex: 100,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
                    }}
                >
                    <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 2, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Error
                    </div>
                    {data.runError}
                </div>
            )}

            {/* Header with icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: `linear-gradient(135deg, ${typeDef?.gradientFrom ?? '#6366f1'}, ${typeDef?.gradientTo ?? '#4f46e5'})`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}
                >
                    <IconComp size={16} className="text-white" />
                </div>
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'rgba(255,255,255,0.95)',
                            letterSpacing: '0.02em',
                            lineHeight: 1.2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}
                    >
                        {data.name}
                    </div>
                    <div
                        style={{
                            fontSize: 10,
                            color: statusColor ?? typeDef?.color ?? 'rgba(255,255,255,0.4)',
                            fontWeight: 500,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            marginTop: 1
                        }}
                    >
                        {isRunning ? 'Running...' : isFailed ? 'Failed' : isCompleted ? 'Completed' : (typeDef?.label ?? data.nodeType)}
                    </div>
                </div>
            </div>

            {/* Input handle */}
            <Handle
                type="target"
                position={Position.Left}
                style={{
                    width: 10,
                    height: 10,
                    background: 'rgba(255,255,255,0.15)',
                    border: `2px solid ${typeDef?.color ?? '#6366f1'}`,
                    borderRadius: '50%'
                }}
            />

            {/* Output handle */}
            <Handle
                type="source"
                position={Position.Right}
                style={{
                    width: 10,
                    height: 10,
                    background: typeDef?.color ?? '#6366f1',
                    border: `2px solid ${typeDef?.color ?? '#6366f1'}`,
                    borderRadius: '50%'
                }}
            />

            {/* CSS animations */}
            <style>{`
        @keyframes nodeRunPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        @keyframes dotPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.7; }
        }
      `}</style>
        </div>
    )
}

export default memo(WorkflowNode)
