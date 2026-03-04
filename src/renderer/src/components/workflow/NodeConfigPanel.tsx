/**
 * NodeConfigPanel — dynamic configuration panel for selected workflow nodes.
 * Renders type-specific config forms based on the selected node type.
 * Each node type shows a help banner explaining what the node does.
 */
import { useState } from 'react'
import type { PipelineNodeType } from '@shared/types/document.types'
import { NODE_TYPE_MAP } from './node-types'
import { X, Trash2, Info, ChevronDown, ChevronUp } from 'lucide-react'
import DocumentSelectorPanel from './DocumentSelectorPanel'

interface NodeConfigPanelProps {
  nodeId: string
  nodeName: string
  nodeType: PipelineNodeType
  config: Record<string, unknown>
  onConfigChange: (nodeId: string, config: Record<string, unknown>) => void
  onClose: () => void
}

export default function NodeConfigPanel({
  nodeId,
  nodeName,
  nodeType,
  config,
  onConfigChange,
  onClose
}: NodeConfigPanelProps): React.JSX.Element {
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(config)
  const [prevConfig, setPrevConfig] = useState(config)
  const [prevNodeId, setPrevNodeId] = useState(nodeId)
  const typeDef = NODE_TYPE_MAP[nodeType]

  // Adjust state during render when props change (React-recommended pattern).
  if (prevConfig !== config || prevNodeId !== nodeId) {
    setPrevConfig(config)
    setPrevNodeId(nodeId)
    setLocalConfig(config)
  }

  const updateField = (key: string, value: unknown): void => {
    const updated = { ...localConfig, [key]: value }
    setLocalConfig(updated)
    onConfigChange(nodeId, updated)
  }

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        background: 'rgba(0,0,0,0.3)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 16px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
            {nodeName}
          </div>
          <div
            style={{
              fontSize: 10,
              color: typeDef?.color ?? '#6366f1',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginTop: 2
            }}
          >
            {typeDef?.label ?? nodeType}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            padding: 4
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Help banner */}
      {typeDef?.helpText && (
        <div
          style={{
            margin: '12px 16px 0',
            padding: '8px 10px',
            borderRadius: 8,
            background: `${typeDef.color}10`,
            border: `1px solid ${typeDef.color}25`,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start'
          }}
        >
          <Info size={12} style={{ color: typeDef.color, flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
            {typeDef.helpText}
          </span>
        </div>
      )}

      {/* Config fields */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {renderConfigFields(nodeType, localConfig, updateField)}
      </div>
    </div>
  )
}

/* ---- Shared UI components ---- */

function ConfigField({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: '0.04em'
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): React.JSX.Element {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        padding: '7px 10px',
        color: 'rgba(255,255,255,0.9)',
        fontSize: 12,
        outline: 'none',
        transition: 'border-color 0.15s'
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
      }}
    />
  )
}

function ToggleSwitch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          border: 'none',
          background: checked ? '#6366f1' : 'rgba(255,255,255,0.1)',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 0.2s'
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            transition: 'left 0.2s'
          }}
        />
      </button>
    </div>
  )
}

function SelectInput({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: readonly { value: string; label: string }[]
}): React.JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        padding: '7px 10px',
        color: 'rgba(255,255,255,0.9)',
        fontSize: 12,
        outline: 'none'
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: '#1a1a2e' }}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}): React.JSX.Element {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      min={min}
      max={max}
      step={step}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        padding: '7px 10px',
        color: 'rgba(255,255,255,0.9)',
        fontSize: 12,
        outline: 'none',
        width: '100%'
      }}
    />
  )
}

/* ---- Transform Operation Types ---- */

const TRANSFORM_OP_TYPES = [
  { value: 'rename', label: 'Rename Field', fields: ['from', 'to'] },
  { value: 'filter', label: 'Keep Only Fields', fields: ['fields'] },
  { value: 'default', label: 'Set Default Value', fields: ['field', 'value'] },
  { value: 'coerce', label: 'Change Type', fields: ['field', 'targetType'] },
  { value: 'format', label: 'Format Field', fields: ['field', 'template'] },
  { value: 'concat', label: 'Concatenate Fields', fields: ['fields', 'separator', 'outputField'] },
  { value: 'compute', label: 'Compute Expression', fields: ['expression', 'outputField'] }
] as const

interface TransformOp {
  type: string
  [key: string]: unknown
}

function TransformOperationStack({
  operations,
  onChange
}: {
  operations: TransformOp[]
  onChange: (ops: TransformOp[]) => void
}): React.JSX.Element {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const addOperation = (type: string): void => {
    const newOp: TransformOp = { type }
    // Initialize with empty fields
    const def = TRANSFORM_OP_TYPES.find((t) => t.value === type)
    if (def) {
      for (const f of def.fields) {
        newOp[f] = f === 'fields' ? [] : ''
      }
    }
    const updated = [...operations, newOp]
    onChange(updated)
    setExpandedIdx(updated.length - 1)
  }

  const removeOperation = (idx: number): void => {
    const updated = operations.filter((_, i) => i !== idx)
    onChange(updated)
    if (expandedIdx === idx) setExpandedIdx(null)
  }

  const updateOperation = (idx: number, key: string, value: unknown): void => {
    const updated = operations.map((op, i) => (i === idx ? { ...op, [key]: value } : op))
    onChange(updated)
  }

  const moveUp = (idx: number): void => {
    if (idx === 0) return
    const updated = [...operations]
      ;[updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]]
    onChange(updated)
    setExpandedIdx(idx - 1)
  }

  const moveDown = (idx: number): void => {
    if (idx === operations.length - 1) return
    const updated = [...operations]
      ;[updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]]
    onChange(updated)
    setExpandedIdx(idx + 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {operations.length === 0 && (
        <div
          style={{
            padding: '12px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(255,255,255,0.08)',
            textAlign: 'center',
            fontSize: 11,
            color: 'rgba(255,255,255,0.3)'
          }}
        >
          No operations — all fields pass through
        </div>
      )}

      {operations.map((op, idx) => {
        const def = TRANSFORM_OP_TYPES.find((t) => t.value === op.type)
        const isExpanded = expandedIdx === idx

        return (
          <div
            key={idx}
            style={{
              borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden'
            }}
          >
            {/* Operation header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                cursor: 'pointer',
                background: isExpanded ? 'rgba(6,182,212,0.06)' : 'transparent'
              }}
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: 'rgba(6,182,212,0.15)',
                    color: '#06b6d4',
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                  {def?.label ?? op.type}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    moveUp(idx)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    padding: 2,
                    opacity: idx === 0 ? 0.3 : 1
                  }}
                  disabled={idx === 0}
                >
                  <ChevronUp size={10} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    moveDown(idx)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    padding: 2,
                    opacity: idx === operations.length - 1 ? 0.3 : 1
                  }}
                  disabled={idx === operations.length - 1}
                >
                  <ChevronDown size={10} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeOperation(idx)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(239,68,68,0.6)',
                    cursor: 'pointer',
                    padding: 2
                  }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>

            {/* Expanded fields */}
            {isExpanded && (
              <div
                style={{
                  padding: '6px 8px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  borderTop: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                {renderOpFields(op, (key, val) => updateOperation(idx, key, val))}
              </div>
            )}
          </div>
        )
      })}

      {/* Add operation dropdown */}
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) addOperation(e.target.value)
        }}
        style={{
          background: 'rgba(6,182,212,0.08)',
          border: '1px dashed rgba(6,182,212,0.3)',
          borderRadius: 6,
          padding: '6px 8px',
          color: '#06b6d4',
          fontSize: 11,
          outline: 'none',
          cursor: 'pointer'
        }}
      >
        <option value="" style={{ background: '#1a1a2e' }}>
          + Add Operation
        </option>
        {TRANSFORM_OP_TYPES.map((t) => (
          <option key={t.value} value={t.value} style={{ background: '#1a1a2e' }}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function renderOpFields(
  op: TransformOp,
  update: (key: string, value: unknown) => void
): React.JSX.Element {
  switch (op.type) {
    case 'rename':
      return (
        <>
          <MiniField
            label="From field"
            value={String(op.from ?? '')}
            onChange={(v) => update('from', v)}
            placeholder="original_name"
          />
          <MiniField
            label="To field"
            value={String(op.to ?? '')}
            onChange={(v) => update('to', v)}
            placeholder="new_name"
          />
        </>
      )
    case 'filter':
      return (
        <MiniField
          label="Fields to keep (comma-separated)"
          value={
            Array.isArray(op.fields) ? (op.fields as string[]).join(', ') : String(op.fields ?? '')
          }
          onChange={(v) =>
            update(
              'fields',
              v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          placeholder="name, amount, date"
        />
      )
    case 'default':
      return (
        <>
          <MiniField
            label="Field name"
            value={String(op.field ?? '')}
            onChange={(v) => update('field', v)}
            placeholder="field_name"
          />
          <MiniField
            label="Default value"
            value={String(op.value ?? '')}
            onChange={(v) => update('value', v)}
            placeholder="default_value"
          />
        </>
      )
    case 'coerce':
      return (
        <>
          <MiniField
            label="Field name"
            value={String(op.field ?? '')}
            onChange={(v) => update('field', v)}
            placeholder="field_name"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Target type</span>
            <select
              value={String(op.targetType ?? 'string')}
              onChange={(e) => update('targetType', e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                padding: '4px 6px',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 10,
                outline: 'none'
              }}
            >
              {['string', 'number', 'boolean', 'date'].map((t) => (
                <option key={t} value={t} style={{ background: '#1a1a2e' }}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </>
      )
    case 'format':
      return (
        <>
          <MiniField
            label="Field name"
            value={String(op.field ?? '')}
            onChange={(v) => update('field', v)}
            placeholder="field_name"
          />
          <MiniField
            label="Template"
            value={String(op.template ?? '')}
            onChange={(v) => update('template', v)}
            placeholder="{{value}} USD"
          />
        </>
      )
    case 'concat':
      return (
        <>
          <MiniField
            label="Fields to concat (comma-separated)"
            value={
              Array.isArray(op.fields)
                ? (op.fields as string[]).join(', ')
                : String(op.fields ?? '')
            }
            onChange={(v) =>
              update(
                'fields',
                v
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            placeholder="first_name, last_name"
          />
          <MiniField
            label="Separator"
            value={String(op.separator ?? ' ')}
            onChange={(v) => update('separator', v)}
            placeholder=" "
          />
          <MiniField
            label="Output field"
            value={String(op.outputField ?? '')}
            onChange={(v) => update('outputField', v)}
            placeholder="full_name"
          />
        </>
      )
    case 'compute':
      return (
        <>
          <MiniField
            label="Expression"
            value={String(op.expression ?? '')}
            onChange={(v) => update('expression', v)}
            placeholder="price * quantity"
          />
          <MiniField
            label="Output field"
            value={String(op.outputField ?? '')}
            onChange={(v) => update('outputField', v)}
            placeholder="total"
          />
        </>
      )
    default:
      return (
        <MiniField
          label="Type"
          value={op.type}
          onChange={(v) => update('type', v)}
          placeholder="operation type"
        />
      )
  }
}

function MiniField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 4,
          padding: '4px 6px',
          color: 'rgba(255,255,255,0.9)',
          fontSize: 10,
          outline: 'none'
        }}
      />
    </div>
  )
}

/* ---- Per-node-type config sections ---- */

function renderConfigFields(
  type: PipelineNodeType,
  config: Record<string, unknown>,
  update: (key: string, value: unknown) => void
): React.JSX.Element {
  switch (type) {
    case 'doc_select':
      return (
        <>
          <ConfigField label="Select Documents">
            <DocumentSelectorPanel
              selectedIds={
                Array.isArray(config.documentIds) ? (config.documentIds as string[]) : []
              }
              onSelectionChange={(ids) => update('documentIds', ids)}
            />
          </ConfigField>
          <ToggleSwitch
            label="Include Raw Text"
            checked={(config.includeRawText as boolean) ?? true}
            onChange={(v) => update('includeRawText', v)}
          />
          <ToggleSwitch
            label="Include Extracted Fields"
            checked={(config.includeExtractedFields as boolean) ?? true}
            onChange={(v) => update('includeExtractedFields', v)}
          />
        </>
      )

    case 'ai_extract':
      return (
        <>
          <ConfigField label="Extraction Prompt">
            <textarea
              value={(config.prompt as string) ?? ''}
              onChange={(e) => update('prompt', e.target.value)}
              placeholder="Describe what fields to extract, e.g.&#10;Extract the invoice number, vendor name, total amount, due date, and line items"
              rows={4}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 11,
                padding: '8px 10px',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.5
              }}
            />
          </ConfigField>
          <ConfigField label="Confidence Threshold">
            <NumberInput
              value={(config.confidenceThreshold as number) ?? 0.7}
              onChange={(v) => update('confidenceThreshold', v)}
              min={0}
              max={1}
              step={0.05}
            />
          </ConfigField>
        </>
      )

    case 'transform':
      return (
        <>
          <ConfigField label="Transform Operations">
            <TransformOperationStack
              operations={
                Array.isArray(config.operations) ? (config.operations as TransformOp[]) : []
              }
              onChange={(ops) => update('operations', ops)}
            />
          </ConfigField>
        </>
      )

    case 'form_fill':
      return (
        <>
          <ConfigField label="Template ID">
            <TextInput
              value={(config.templateId as string) ?? ''}
              onChange={(v) => update('templateId', v)}
              placeholder="Form template ObjectID"
            />
          </ConfigField>
          <ConfigField label="Field Mapping (JSON)">
            <textarea
              value={JSON.stringify(config.fieldMapping ?? {}, null, 2)}
              onChange={(e) => {
                try {
                  update('fieldMapping', JSON.parse(e.target.value))
                } catch {
                  /* allow invalid JSON while typing */
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                padding: '7px 10px',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 11,
                fontFamily: 'monospace',
                outline: 'none',
                minHeight: 80,
                resize: 'vertical'
              }}
            />
          </ConfigField>
        </>
      )

    case 'custom_api':
      return (
        <>
          <ConfigField label="HTTP Method">
            <SelectInput
              value={(config.method as string) ?? 'POST'}
              onChange={(v) => update('method', v)}
              options={[
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
                { value: 'PATCH', label: 'PATCH' },
                { value: 'DELETE', label: 'DELETE' }
              ]}
            />
          </ConfigField>
          <ConfigField label="URL">
            <TextInput
              value={(config.url as string) ?? ''}
              onChange={(v) => update('url', v)}
              placeholder="https://api.example.com/endpoint"
            />
          </ConfigField>
          <ConfigField label="Timeout (seconds)">
            <NumberInput
              value={(config.timeout as number) ?? 30}
              onChange={(v) => update('timeout', v)}
              min={1}
              max={300}
            />
          </ConfigField>
        </>
      )

    case 'review':
      return (
        <>
          <ConfigField label="Auto-Approve Threshold">
            <NumberInput
              value={(config.autoApproveThreshold as number) ?? 0.95}
              onChange={(v) => update('autoApproveThreshold', v)}
              min={0}
              max={1}
              step={0.05}
            />
          </ConfigField>
          <ToggleSwitch
            label="Allow Edits"
            checked={(config.allowEdits as boolean) ?? true}
            onChange={(v) => update('allowEdits', v)}
          />
        </>
      )

    case 'condition':
      return (
        <>
          <ConfigField label="Rules (JSON)">
            <textarea
              value={JSON.stringify(config.rules ?? [], null, 2)}
              onChange={(e) => {
                try {
                  update('rules', JSON.parse(e.target.value))
                } catch {
                  /* allow invalid JSON while typing */
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                padding: '7px 10px',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 11,
                fontFamily: 'monospace',
                outline: 'none',
                minHeight: 80,
                resize: 'vertical'
              }}
            />
          </ConfigField>
          <ConfigField label="Default Target Node ID">
            <TextInput
              value={(config.defaultTargetNodeId as string) ?? ''}
              onChange={(v) => update('defaultTargetNodeId', v)}
              placeholder="Node ID"
            />
          </ConfigField>
        </>
      )

    case 'export':
      return (
        <>
          <ConfigField label="Format">
            <SelectInput
              value={(config.format as string) ?? 'csv'}
              onChange={(v) => update('format', v)}
              options={[
                { value: 'csv', label: 'CSV' },
                { value: 'json', label: 'JSON' },
                { value: 'xlsx', label: 'Excel (XLSX)' }
              ]}
            />
          </ConfigField>
          <ConfigField label="Destination">
            <SelectInput
              value={(config.destination as string) ?? 'local'}
              onChange={(v) => update('destination', v)}
              options={[
                { value: 'local', label: 'Local Download' },
                { value: 's3', label: 'S3 Bucket' },
                { value: 'webhook', label: 'Webhook' }
              ]}
            />
          </ConfigField>
          <ConfigField label="Filename Template">
            <TextInput
              value={(config.filenameTemplate as string) ?? 'export_{{date}}'}
              onChange={(v) => update('filenameTemplate', v)}
              placeholder="export_{{date}}"
            />
          </ConfigField>
        </>
      )

    default:
      return (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          No configuration available for this node type.
        </div>
      )
  }
}
