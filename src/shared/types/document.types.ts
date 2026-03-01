/**
 * Core document domain types for Aura AI.
 * Shared between main and renderer processes.
 */

/** Branded type to prevent accidental ID misuse */
export type DocumentId = string & { readonly __brand: unique symbol }

/** Document processing status */
export type DocumentStatus = 'pending' | 'processing' | 'processed' | 'reviewing' | 'error'

/** Supported document MIME types */
export type DocumentMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Document type classification */
export type DocumentType = 'invoice' | 'contract' | 'receipt' | 'expense' | 'other'

/** Extracted field from AI analysis */
export interface ExtractedField {
  readonly fieldName: string
  readonly value: string
  readonly confidence: number
  readonly verified: boolean
}

/** Core document entity */
export interface AuraDocument {
  readonly _id: DocumentId
  readonly name: string
  readonly type: DocumentType
  readonly mimeType: DocumentMimeType
  readonly status: DocumentStatus
  readonly processingStep: string
  readonly confidence: number
  readonly filePath: string
  readonly fileSize: number
  readonly rawText: string
  readonly extractedFields: readonly ExtractedField[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** Input for creating a new document */
export interface CreateDocumentInput {
  readonly name: string
  readonly type: DocumentType
  readonly mimeType: DocumentMimeType
  readonly filePath: string
  readonly fileSize: number
}

/** Dashboard statistics */
export interface DashboardStats {
  readonly totalDocuments: number
  readonly accuracyRate: number
  readonly avgProcessingTime: number
  readonly activePipelines: number
  readonly documentsProcessedChange: number
  readonly accuracyChange: number
  readonly processingTimeChange: number
  readonly pipelinesChange: number
  readonly manualTimeSaved?: number
  readonly timeSavedChange?: number
}

/** Chart data point for accuracy trend */
export interface ChartDataPoint {
  readonly date: string
  readonly value: number
}

/** Activity timeline event types */
export type ActivityEventType = 'processed' | 'system' | 'created' | 'review'

/** Activity timeline event icon types */
export type ActivityEventIcon = 'check' | 'refresh' | 'plus' | 'warning'

/** Activity timeline event */
export interface ActivityEvent {
  readonly id: string
  readonly type: ActivityEventType
  readonly title: string
  readonly timestamp: string
  readonly source: string
  readonly icon: ActivityEventIcon
}

/** Pipeline node type classification */
export type PipelineNodeType = 'process' | 'review' | 'export'

/** Pipeline node configuration */
export interface PipelineNodeConfig {
  readonly strictJsonSchema: boolean
  readonly dataTypeMatching: boolean
  readonly handleNullValues: boolean
  readonly apiIntegration: string
  readonly successRedirect: string
}

/** Pipeline workflow node */
export interface PipelineNode {
  readonly id: string
  readonly label: string
  readonly name: string
  readonly type: PipelineNodeType
  readonly icon: string
  readonly config: PipelineNodeConfig
}

/** Pipeline metadata */
export interface PipelineMetadata {
  readonly id?: string
  readonly name: string
  readonly status: string
  readonly latency: string
  readonly workspace: string
  readonly version: string
}

/** Document analysis view metadata */
export interface AnalysisViewMeta {
  readonly overallConfidence: number
  readonly modelVersion: string
  readonly ocrActive: boolean
  readonly stableModel: string
}
