/**
 * SchemaCustomization — Define custom extraction fields before data extraction.
 *
 * Users define columns (field name + column name + rules) that guide AI
 * data extraction. Each rule is a natural-language instruction for the AI.
 * Schemas are persisted to MongoDB and can be saved/loaded across sessions.
 */

import { useState, useCallback, useEffect, type ReactElement } from 'react'
import type { SchemaField, ExtractionSchema } from '../../../shared/types/document.types'
import { listSchemas, createSchema, updateSchema } from '../data/data-service'
import { Sparkles, Plus, Trash2, GripVertical, X, FileText, Save } from './Icons'

interface SchemaCustomizationProps {
  readonly onExtract: (schema: SchemaField[]) => void
  readonly extracting?: boolean
  readonly addToast?: (type: 'success' | 'error' | 'info', text: string) => void
}

const DEFAULT_FIELDS: SchemaField[] = [
  {
    field: 'invoice_number',
    columnName: 'Invoice Number',
    rules: [
      "Find the invoice number, usually after 'Invoice #' or 'Invoice No.'",
      'Check header area for invoice identifier'
    ]
  },
  {
    field: 'vendor_name',
    columnName: 'Vendor Name',
    rules: ['Extract the seller/vendor company name from the document header']
  },
  {
    field: 'total_amount',
    columnName: 'Total Amount',
    rules: ['Find the total/grand total amount with currency symbol']
  },
  {
    field: 'due_date',
    columnName: 'Due Date',
    rules: ['Look for payment due date or deadline']
  }
]

export function SchemaCustomization({
  onExtract,
  extracting = false,
  addToast
}: SchemaCustomizationProps): ReactElement {
  const [fields, setFields] = useState<SchemaField[]>(DEFAULT_FIELDS)
  const [newRuleInputs, setNewRuleInputs] = useState<Record<number, string>>({})
  const [expandedField, setExpandedField] = useState<number | null>(0)

  /** Currently loaded/saved schema ID — null means unsaved */
  const [schemaId, setSchemaId] = useState<string | null>(null)
  /** Schema name for saving */
  const [schemaName, setSchemaName] = useState('')
  /** List of saved schemas for the dropdown */
  const [savedSchemas, setSavedSchemas] = useState<ExtractionSchema[]>([])
  /** Whether the save operation is in progress */
  const [saving, setSaving] = useState(false)
  /** Whether to show the schema name input */
  const [showNameInput, setShowNameInput] = useState(false)

  // Load saved schemas on mount
  useEffect(() => {
    let ignore = false
    const loadSchemas = async (): Promise<void> => {
      try {
        const schemas = await listSchemas()
        if (!ignore) {
          setSavedSchemas(schemas)
        }
      } catch {
        // Silently fail — schemas are optional enhancement
      }
    }
    loadSchemas()
    return () => {
      ignore = true
    }
  }, [])

  /** Load a saved schema into the editor */
  const handleLoadSchema = useCallback(
    (schema: ExtractionSchema): void => {
      setFields([...schema.fields] as SchemaField[])
      setSchemaId(schema._id ?? null)
      setSchemaName(schema.name)
      setExpandedField(0)
      setNewRuleInputs({})
      setShowNameInput(false)
      addToast?.('info', `Loaded schema "${schema.name}"`)
    },
    [addToast]
  )

  /** Save or update the current schema */
  const handleSave = useCallback(async (): Promise<void> => {
    // If no name yet, show the name input
    if (!schemaName.trim() && !showNameInput) {
      setShowNameInput(true)
      return
    }

    const trimmedName = schemaName.trim()
    if (!trimmedName) {
      addToast?.('error', 'Schema name is required')
      return
    }

    const validFields = fields.filter((f) => f.field.trim() && f.columnName.trim())
    if (validFields.length === 0) {
      addToast?.('error', 'At least one valid field is required')
      return
    }

    setSaving(true)
    try {
      if (schemaId) {
        // Update existing
        const updated = await updateSchema(schemaId, {
          name: trimmedName,
          fields: validFields
        })
        addToast?.('success', `Schema "${trimmedName}" updated`)
        // Refresh the list
        setSavedSchemas((prev) => prev.map((s) => (s._id === schemaId ? updated : s)))
      } else {
        // Create new
        const created = await createSchema({
          name: trimmedName,
          fields: validFields
        })
        setSchemaId(created._id ?? null)
        addToast?.('success', `Schema "${trimmedName}" saved`)
        setSavedSchemas((prev) => [created, ...prev])
      }
      setShowNameInput(false)
    } catch (err) {
      addToast?.(
        'error',
        `Failed to save schema: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    } finally {
      setSaving(false)
    }
  }, [schemaId, schemaName, fields, addToast, showNameInput])

  const updateField = useCallback(
    (index: number, key: keyof SchemaField, value: string | string[]): void => {
      setFields((prev) => prev.map((f, i) => (i === index ? { ...f, [key]: value } : f)))
    },
    []
  )

  const addField = useCallback((): void => {
    const newField: SchemaField = {
      field: `field_${fields.length + 1}`,
      columnName: `Field ${fields.length + 1}`,
      rules: []
    }
    setFields((prev) => [...prev, newField])
    setExpandedField(fields.length)
  }, [fields.length])

  const removeField = useCallback((index: number): void => {
    setFields((prev) => prev.filter((_, i) => i !== index))
    setExpandedField(null)
  }, [])

  const addRule = useCallback(
    (fieldIndex: number): void => {
      const ruleText = newRuleInputs[fieldIndex]?.trim()
      if (!ruleText) return

      setFields((prev) =>
        prev.map((f, i) => (i === fieldIndex ? { ...f, rules: [...f.rules, ruleText] } : f))
      )
      setNewRuleInputs((prev) => ({ ...prev, [fieldIndex]: '' }))
    },
    [newRuleInputs]
  )

  const removeRule = useCallback((fieldIndex: number, ruleIndex: number): void => {
    setFields((prev) =>
      prev.map((f, i) =>
        i === fieldIndex ? { ...f, rules: f.rules.filter((_, ri) => ri !== ruleIndex) } : f
      )
    )
  }, [])

  const handleExtract = useCallback((): void => {
    const validFields = fields.filter((f) => f.field.trim() && f.columnName.trim())
    if (validFields.length === 0) return
    onExtract(validFields)
  }, [fields, onExtract])

  const isValid = fields.some((f) => f.field.trim() && f.columnName.trim())

  return (
    <div className="schema-panel">
      {/* Header */}
      <div className="schema-header">
        <div className="schema-title-group">
          <div className="schema-icon">
            <FileText size={20} />
          </div>
          <div>
            <h3 className="schema-title">Schema Customization</h3>
            <p className="schema-description">
              Define your extraction schema — specify columns, names, and rules to guide AI data
              extraction
            </p>
          </div>
        </div>
        <div className="schema-actions">
          <button
            className="schema-btn schema-btn-secondary"
            disabled={extracting || saving}
            onClick={handleSave}
          >
            <Save size={14} />
            {saving ? 'Saving...' : schemaId ? 'Update Schema' : 'Save Schema'}
          </button>
          <button
            className="schema-btn schema-btn-primary"
            disabled={!isValid || extracting}
            onClick={handleExtract}
          >
            <Sparkles size={14} />
            {extracting ? 'Extracting...' : 'Extract Data'}
          </button>
        </div>
      </div>

      {/* Schema Name Input + Saved Schemas Selector */}
      <div className="schema-meta-bar">
        {showNameInput || schemaId ? (
          <div className="schema-name-group">
            <label className="schema-input-label">Schema Name</label>
            <input
              type="text"
              className="schema-input schema-name-input"
              placeholder="e.g. Invoice Extraction"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSave()
                }
              }}
              autoFocus={showNameInput && !schemaId}
            />
          </div>
        ) : null}

        {savedSchemas.length > 0 && (
          <div className="schema-saved-list">
            <label className="schema-input-label">Saved Schemas</label>
            <div className="schema-chips">
              {savedSchemas.map((s) => (
                <button
                  key={s._id}
                  className={`schema-chip ${schemaId === s._id ? 'active' : ''}`}
                  onClick={() => handleLoadSchema(s)}
                  title={`Load "${s.name}" — ${s.fields.length} fields`}
                >
                  <FileText size={12} />
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fields List */}
      <div className="schema-fields-list">
        {fields.map((field, index) => (
          <div
            key={index}
            className={`schema-field-card ${expandedField === index ? 'expanded' : ''}`}
          >
            <div className="schema-field-header">
              <div className="schema-field-drag">
                <GripVertical size={16} />
              </div>
              <div className="schema-field-type-icon">
                <FileText size={14} />
              </div>

              <div className="schema-field-inputs">
                <div className="schema-input-group">
                  <label className="schema-input-label">Field Name</label>
                  <input
                    type="text"
                    className="schema-input"
                    value={field.field}
                    placeholder="e.g. invoice_number"
                    onChange={(e) => updateField(index, 'field', e.target.value)}
                  />
                </div>
                <div className="schema-input-group">
                  <label className="schema-input-label">Column Name</label>
                  <input
                    type="text"
                    className="schema-input"
                    value={field.columnName}
                    placeholder="e.g. Invoice Number"
                    onChange={(e) => updateField(index, 'columnName', e.target.value)}
                  />
                </div>
              </div>

              <div className="schema-field-actions">
                <button
                  className="schema-icon-btn"
                  onClick={() => setExpandedField(expandedField === index ? null : index)}
                  title="Toggle rules"
                >
                  <span
                    className={`schema-expand-arrow ${expandedField === index ? 'rotated' : ''}`}
                  >
                    ▾
                  </span>
                </button>
                <button
                  className="schema-icon-btn schema-icon-btn-danger"
                  onClick={() => removeField(index)}
                  title="Remove field"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Rules Section (expandable) */}
            {expandedField === index && (
              <div className="schema-rules-section">
                <div className="schema-rules-label">
                  Extraction Rules
                  <span className="schema-rules-count">{field.rules.length}</span>
                </div>

                {field.rules.length > 0 && (
                  <div className="schema-rules-list">
                    {field.rules.map((rule, ruleIndex) => (
                      <div key={ruleIndex} className="schema-rule-pill">
                        <span className="schema-rule-text">{rule}</span>
                        <button
                          className="schema-rule-remove"
                          onClick={() => removeRule(index, ruleIndex)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="schema-add-rule">
                  <input
                    type="text"
                    className="schema-input schema-rule-input"
                    placeholder="Add a rule, e.g. 'Look for text after Invoice #'"
                    value={newRuleInputs[index] ?? ''}
                    onChange={(e) =>
                      setNewRuleInputs((prev) => ({
                        ...prev,
                        [index]: e.target.value
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addRule(index)
                      }
                    }}
                  />
                  <button className="schema-btn schema-btn-add-rule" onClick={() => addRule(index)}>
                    <Plus size={14} />
                    Add Rule
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Field Button */}
      <button className="schema-add-field-btn" onClick={addField}>
        <Plus size={18} />
        Add New Field
      </button>
    </div>
  )
}
