/**
 * NodeConfigPanel — dynamic configuration panel for selected workflow nodes.
 * Renders type-specific config forms based on the selected node type.
 */
import { useState, useEffect } from 'react'
import type { PipelineNodeType } from '@shared/types/document.types'
import { NODE_TYPE_MAP } from './node-types'
import { X } from 'lucide-react'

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
    onClose,
}: NodeConfigPanelProps) {
    const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(config)
    const typeDef = NODE_TYPE_MAP[nodeType]

    useEffect(() => {
        setLocalConfig(config)
    }, [config, nodeId])

    const updateField = (key: string, value: unknown) => {
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
                overflowY: 'auto',
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '16px 16px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
                        {nodeName}
                    </div>
                    <div style={{ fontSize: 10, color: typeDef?.color ?? '#6366f1', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
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
                        padding: 4,
                    }}
                >
                    <X size={16} />
                </button>
            </div>

            {/* Config fields */}
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {renderConfigFields(nodeType, localConfig, updateField)}
            </div>
        </div>
    )
}

function ConfigField({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>
                {label}
            </label>
            {children}
        </div>
    )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
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
                transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
        />
    )
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
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
                    transition: 'background 0.2s',
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
                        transition: 'left 0.2s',
                    }}
                />
            </button>
        </div>
    )
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[] }) {
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
                outline: 'none',
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

function NumberInput({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
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
                width: '100%',
            }}
        />
    )
}

function renderConfigFields(
    type: PipelineNodeType,
    config: Record<string, unknown>,
    update: (key: string, value: unknown) => void,
) {
    switch (type) {
        case 'ingest':
            return (
                <>
                    <ToggleSwitch
                        label="OCR Enabled"
                        checked={(config.ocrEnabled as boolean) ?? true}
                        onChange={(v) => update('ocrEnabled', v)}
                    />
                    <ConfigField label="Accepted Formats">
                        <TextInput
                            value={Array.isArray(config.acceptedFormats) ? (config.acceptedFormats as string[]).join(', ') : ''}
                            onChange={(v) => update('acceptedFormats', v.split(',').map((s) => s.trim()).filter(Boolean))}
                            placeholder="pdf, docx, jpg, png"
                        />
                    </ConfigField>
                </>
            )

        case 'ai_extract':
            return (
                <>
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
                    <ConfigField label="Operations (JSON)">
                        <textarea
                            value={JSON.stringify(config.operations ?? [], null, 2)}
                            onChange={(e) => {
                                try {
                                    update('operations', JSON.parse(e.target.value))
                                } catch { /* allow invalid JSON while typing */ }
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
                                minHeight: 100,
                                resize: 'vertical',
                            }}
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
                                } catch { /* allow invalid JSON while typing */ }
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
                                resize: 'vertical',
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
                                { value: 'DELETE', label: 'DELETE' },
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
                                } catch { /* allow invalid JSON while typing */ }
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
                                resize: 'vertical',
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
                                { value: 'xlsx', label: 'Excel (XLSX)' },
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
                                { value: 'webhook', label: 'Webhook' },
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
