/**
 * ExtractedDataTable — Table component for displaying extracted data in structured format.
 *
 * When an applied schema is present, uses schema column names as table headers.
 * Without a schema, uses the field names from the extracted fields.
 * Supports confidence badges per cell, hover-to-highlight, and empty state.
 */

import { useCallback, type ReactElement } from 'react'
import type { ExtractedField, SchemaField } from '../../../shared/types/document.types'
import { Pencil, AlertTriangle } from './Icons'

interface ExtractedDataTableProps {
  readonly fields: readonly ExtractedField[]
  readonly schema?: readonly SchemaField[]
  readonly hoveredField: string | null
  readonly onHoverField: (value: string | null) => void
}

/** Returns CSS class for confidence level */
function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.9) return 'conf-high'
  if (confidence >= 0.7) return 'conf-medium'
  return 'conf-low'
}

/** Formats confidence as percentage string */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

/** Returns confidence indicator icon */
function getConfidenceIcon(confidence: number): string {
  if (confidence >= 0.9) return '●'
  if (confidence >= 0.7) return '!'
  return '▲'
}

export function ExtractedDataTable({
  fields,
  schema,
  hoveredField,
  onHoverField
}: ExtractedDataTableProps): ReactElement {
  /** Build a lookup map from fieldName (lowercase) → ExtractedField */
  const fieldIndex = useCallback((): Map<string, ExtractedField> => {
    const map = new Map<string, ExtractedField>()
    for (const f of fields) {
      map.set(f.fieldName.toLowerCase().trim(), f)
    }
    return map
  }, [fields])

  // Determine columns: schema columnNames or field names
  const hasSchema = schema && schema.length > 0

  if (hasSchema) {
    const index = fieldIndex()

    return (
      <div className="extracted-data-table-wrapper">
        <table className="extracted-data-table">
          <thead>
            <tr>
              {schema.map((sf) => (
                <th key={sf.field}>{sf.columnName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {schema.map((sf) => {
                const key = sf.field.toLowerCase().trim()
                const ef = index.get(key)
                if (!ef) {
                  return (
                    <td key={sf.field} className="table-cell-empty">
                      —
                    </td>
                  )
                }
                return (
                  <td
                    key={sf.field}
                    className={`table-cell ${getConfidenceClass(ef.confidence)} ${hoveredField === ef.value ? 'cell-hovered' : ''}`}
                    onMouseEnter={() => onHoverField(ef.value)}
                    onMouseLeave={() => onHoverField(null)}
                  >
                    <div className="table-cell-content">
                      <span className="table-cell-value">{ef.value}</span>
                      <span className={`table-cell-conf ${getConfidenceClass(ef.confidence)}`}>
                        <span className="conf-icon">{getConfidenceIcon(ef.confidence)}</span>
                        {formatConfidence(ef.confidence)}
                      </span>
                    </div>
                    {ef.confidence < 0.7 && (
                      <p className="table-cell-warning">
                        <AlertTriangle size={10} /> Low confidence
                      </p>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // Non-schema mode: display as a 2-column table (Field Name | Value)
  return (
    <div className="extracted-data-table-wrapper">
      <table className="extracted-data-table extracted-data-table-default">
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
            <th>Confidence</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => (
            <tr
              key={field.fieldName}
              className={`${hoveredField === field.value ? 'row-hovered' : ''}`}
              onMouseEnter={() => onHoverField(field.value)}
              onMouseLeave={() => onHoverField(null)}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <td className="table-field-name">{field.fieldName}</td>
              <td className="table-field-value">{field.value}</td>
              <td className={`table-field-conf ${getConfidenceClass(field.confidence)}`}>
                <span className="conf-icon">{getConfidenceIcon(field.confidence)}</span>
                {formatConfidence(field.confidence)}
              </td>
              <td>
                <button className="field-edit-btn" title="Edit field">
                  <Pencil size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
