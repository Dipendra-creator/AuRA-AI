/**
 * QuickConfigForm — Dynamic form from QuickConfigField[].
 */

import type { ReactElement, ChangeEvent } from 'react'
import type { QuickConfigField } from '../../data/pipeline-templates'

interface QuickConfigFormProps {
  readonly fields: QuickConfigField[]
  readonly values: Record<string, unknown>
  readonly onChange: (key: string, value: unknown) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  color: '#f1f5f9',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 180ms ease',
}

export function QuickConfigForm({ fields, values, onChange }: QuickConfigFormProps): ReactElement {
  function handleChange(field: QuickConfigField, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const raw = e.target.value
    onChange(field.key, field.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {fields.map((field) => (
        <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Label */}
          <label style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>
            {field.label}
            {field.required && <span style={{ color: '#f87171', marginLeft: 4 }}>*</span>}
          </label>

          {/* Toggle */}
          {field.type === 'toggle' ? (
            <button
              type="button"
              onClick={() => onChange(field.key, !values[field.key])}
              style={{
                position: 'relative',
                width: 44,
                height: 24,
                borderRadius: 12,
                border: 'none',
                background: values[field.key] ? 'rgba(6,182,212,0.7)' : 'rgba(255,255,255,0.1)',
                cursor: 'pointer',
                transition: 'background 200ms ease',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: values[field.key] ? 22 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'white',
                  transition: 'left 200ms ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </button>

          ) : field.type === 'select' ? (
            <select
              value={String(values[field.key] ?? field.defaultValue ?? '')}
              onChange={(e) => handleChange(field, e)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {field.options?.map((opt) => (
                <option key={opt} value={opt} style={{ background: '#0f172a' }}>
                  {opt}
                </option>
              ))}
            </select>

          ) : (
            <input
              type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
              value={String(values[field.key] ?? field.defaultValue ?? '')}
              onChange={(e) => handleChange(field, e)}
              placeholder={field.placeholder}
              required={field.required}
              style={inputStyle}
            />
          )}

          {field.helpText && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
              {field.helpText}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
