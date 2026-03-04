/**
 * WorkflowSidebar — draggable node palette for the workflow builder.
 * Users drag nodes from this sidebar onto the React Flow canvas.
 */
import { type DragEvent } from 'react'
import { FileSearch, Brain, Cpu, Edit3, Plug, Eye, GitFork, FileOutput } from 'lucide-react'
import { NODE_TYPE_DEFINITIONS, type NodeTypeDefinition } from './node-types'

const ICON_MAP: Record<string, React.FC<{ size?: number; className?: string }>> = {
  fileSearch: FileSearch,
  brain: Brain,
  cpu: Cpu,
  edit: Edit3,
  plug: Plug,
  eye: Eye,
  gitFork: GitFork,
  fileOutput: FileOutput
}

function NodePaletteItem({ def }: { def: NodeTypeDefinition }): React.JSX.Element {
  const IconComp = ICON_MAP[def.icon] ?? Cpu

  const onDragStart = (e: DragEvent): void => {
    e.dataTransfer.setData('application/workflow-node-type', def.type)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        cursor: 'grab',
        transition: 'all 0.15s ease',
        userSelect: 'none'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${def.color}15`
        e.currentTarget.style.borderColor = `${def.color}40`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: `linear-gradient(135deg, ${def.gradientFrom}, ${def.gradientTo})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <IconComp size={14} className="text-white" />
      </div>
      <div>
        <div
          style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1.2 }}
        >
          {def.label}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
          {def.description}
        </div>
      </div>
    </div>
  )
}

export default function WorkflowSidebar(): React.JSX.Element {
  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        background: 'rgba(0,0,0,0.2)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 8,
          paddingLeft: 4
        }}
      >
        NODE PALETTE
      </div>
      {NODE_TYPE_DEFINITIONS.map((def) => (
        <NodePaletteItem key={def.type} def={def} />
      ))}
    </div>
  )
}
