/**
 * WorkflowNode — custom React Flow node component.
 * Renders each pipeline node with its type-specific colour,
 * icon, label, and connection handles.
 */
import { memo } from 'react'
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
}

function WorkflowNode({ data, selected }: NodeProps & { data: WorkflowNodeData }) {
  const typeDef = NODE_TYPE_MAP[data.nodeType]
  const IconComp = ICON_MAP[typeDef?.icon ?? 'cpu'] ?? Cpu

  const statusColor =
    data.runStatus === 'completed'
      ? '#10b981'
      : data.runStatus === 'running'
        ? '#f59e0b'
        : data.runStatus === 'failed'
          ? '#ef4444'
          : undefined

  return (
    <div
      className="workflow-node"
      style={{
        background: `linear-gradient(135deg, ${typeDef?.gradientFrom ?? '#6366f1'}20, ${typeDef?.gradientTo ?? '#4f46e5'}10)`,
        border: `1.5px solid ${selected ? (typeDef?.color ?? '#6366f1') : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14,
        padding: '14px 18px',
        minWidth: 180,
        backdropFilter: 'blur(12px)',
        transition: 'all 0.2s ease',
        boxShadow: selected
          ? `0 0 20px ${typeDef?.color ?? '#6366f1'}40`
          : '0 2px 12px rgba(0,0,0,0.3)',
        position: 'relative'
      }}
    >
      {/* Status indicator */}
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
            boxShadow: `0 0 6px ${statusColor}`
          }}
        />
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
              color: typeDef?.color ?? 'rgba(255,255,255,0.4)',
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: 1
            }}
          >
            {typeDef?.label ?? data.nodeType}
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
    </div>
  )
}

export default memo(WorkflowNode)
