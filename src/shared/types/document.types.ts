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

/** Extended pipeline node types */
export type PipelineNodeType =
  | 'doc_select'
  | 'ai_extract'
  | 'transform'
  | 'form_fill'
  | 'custom_api'
  | 'review'
  | 'condition'
  | 'export'

/** Pipeline node configuration — flexible key-value map per node type */
export interface PipelineNodeConfig {
  [key: string]: unknown
}

/** Canvas position for React Flow */
export interface NodePosition {
  readonly x: number
  readonly y: number
}

/** Pipeline workflow node */
export interface PipelineNode {
  readonly id: string
  readonly label: string
  readonly name: string
  readonly type: PipelineNodeType
  readonly icon: string
  readonly position: NodePosition
  readonly config: PipelineNodeConfig
}

/** Pipeline edge connecting two nodes */
export interface PipelineEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly label?: string
}

/** Pipeline metadata */
export interface PipelineMetadata {
  readonly id?: string
  readonly name: string
  readonly description: string
  readonly status: string
  readonly latency: string
  readonly workspace: string
  readonly version: string
}

/** Pipeline run status */
export type PipelineRunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Node run status */
export type NodeRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'waiting_review'

/** Result of a single node execution */
export interface NodeRunResult {
  readonly nodeId: string
  readonly status: NodeRunStatus
  readonly startedAt: string
  readonly endedAt?: string
  readonly output?: Record<string, unknown>
  readonly error?: string
  readonly durationMs: number
}

/** A single execution instance of a pipeline */
export interface PipelineRun {
  readonly _id: string
  readonly pipelineId: string
  readonly status: PipelineRunStatus
  readonly triggerBy: string
  readonly nodeRuns: readonly NodeRunResult[]
  readonly startedAt: string
  readonly endedAt?: string
}

/** Pipeline execution event from WebSocket */
export interface PipelineEvent {
  readonly type: string
  readonly pipelineId?: string
  readonly runId?: string
  readonly nodeId?: string
  readonly nodeName?: string
  readonly output?: Record<string, unknown>
  readonly error?: string
  readonly durationMs?: number
}

/** Per-node run status exposed to the canvas */
export interface NodeRunInfo {
  readonly status: string
  readonly error?: string
  readonly durationMs?: number
  readonly output?: Record<string, unknown>
}

/** Form template for the form-fill node */
export interface FormTemplate {
  readonly _id: string
  readonly name: string
  readonly description: string
  readonly fields: readonly FormTemplateField[]
  readonly version: string
}

/** Form template field definition */
export interface FormTemplateField {
  readonly key: string
  readonly label: string
  readonly type: string
  readonly required: boolean
  readonly default?: unknown
}

/** Document analysis view metadata */
export interface AnalysisViewMeta {
  readonly overallConfidence: number
  readonly modelVersion: string
  readonly ocrActive: boolean
  readonly stableModel: string
}
