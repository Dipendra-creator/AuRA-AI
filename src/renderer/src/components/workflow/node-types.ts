/**
 * Workflow node type configuration — defines the 8 node types with
 * their visual appearance, palette label, help text, and default config.
 */
import type { PipelineNodeType } from '@shared/types/document.types'

export interface NodeTypeDefinition {
  readonly type: PipelineNodeType
  readonly label: string
  readonly description: string
  readonly helpText: string
  readonly color: string
  readonly gradientFrom: string
  readonly gradientTo: string
  readonly icon: string
  readonly defaultConfig: Record<string, unknown>
}

export const NODE_TYPE_DEFINITIONS: readonly NodeTypeDefinition[] = [
  {
    type: 'ingest',
    label: 'Ingest',
    description: 'Upload & OCR',
    helpText:
      'Upload PDF, DOCX, JPG, or PNG files. Runs OCR automatically to extract text from scanned documents and images. Outputs raw text for downstream nodes.',
    color: '#3b82f6',
    gradientFrom: '#3b82f6',
    gradientTo: '#1d4ed8',
    icon: 'upload',
    defaultConfig: { ocrEnabled: true, acceptedFormats: ['pdf', 'docx', 'jpg', 'png'] }
  },
  {
    type: 'ai_extract',
    label: 'AI Extract',
    description: 'AI field extraction',
    helpText:
      'Uses AI to extract structured fields (name, date, amount, etc.) from the raw text. Set a confidence threshold to filter low-quality extractions.',
    color: '#8b5cf6',
    gradientFrom: '#8b5cf6',
    gradientTo: '#6d28d9',
    icon: 'brain',
    defaultConfig: { confidenceThreshold: 0.7 }
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Data transformations',
    helpText:
      'Add operations to rename, filter, set defaults, or format extracted fields. Use the operation stack below to build your transformations. Leave empty to pass all fields through.',
    color: '#06b6d4',
    gradientFrom: '#06b6d4',
    gradientTo: '#0891b2',
    icon: 'cpu',
    defaultConfig: { operations: [] }
  },
  {
    type: 'form_fill',
    label: 'Form Fill',
    description: 'Map to template',
    helpText:
      'Maps extracted fields to a form template. Select a template and configure field mappings to auto-populate forms.',
    color: '#10b981',
    gradientFrom: '#10b981',
    gradientTo: '#059669',
    icon: 'edit',
    defaultConfig: { templateId: '', fieldMapping: {} }
  },
  {
    type: 'custom_api',
    label: 'Custom API',
    description: 'HTTP callout',
    helpText:
      'Sends extracted data to an external API. Configure the HTTP method, URL, and timeout. The request body contains all fields from previous nodes.',
    color: '#f59e0b',
    gradientFrom: '#f59e0b',
    gradientTo: '#d97706',
    icon: 'plug',
    defaultConfig: { method: 'POST', url: '', headers: {}, bodyTemplate: {} }
  },
  {
    type: 'review',
    label: 'Review',
    description: 'Human approval gate',
    helpText:
      'Pauses the pipeline for human review. If confidence exceeds the auto-approve threshold, it passes automatically. Enable "Allow Edits" to let reviewers correct fields.',
    color: '#ec4899',
    gradientFrom: '#ec4899',
    gradientTo: '#db2777',
    icon: 'eye',
    defaultConfig: { autoApproveThreshold: 0.95, allowEdits: true }
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch on rules',
    helpText:
      'Routes data to different branches based on field values. Define rules to check conditions (e.g., amount > 1000). Set a default target for unmatched data.',
    color: '#f97316',
    gradientFrom: '#f97316',
    gradientTo: '#ea580c',
    icon: 'gitFork',
    defaultConfig: { rules: [], defaultTargetNodeId: '' }
  },
  {
    type: 'export',
    label: 'Export',
    description: 'CSV / JSON / XLSX',
    helpText:
      'Exports the final data as CSV, JSON, or Excel. Choose a destination (local, S3, or webhook) and set a filename pattern.',
    color: '#14b8a6',
    gradientFrom: '#14b8a6',
    gradientTo: '#0d9488',
    icon: 'fileOutput',
    defaultConfig: { format: 'csv', destination: 'local' }
  }
] as const

export const NODE_TYPE_MAP = Object.fromEntries(
  NODE_TYPE_DEFINITIONS.map((d) => [d.type, d])
) as Record<PipelineNodeType, NodeTypeDefinition>
