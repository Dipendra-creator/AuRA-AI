/**
 * Core document domain types for Aura AI.
 * Shared between main and renderer processes.
 */

/** Branded type to prevent accidental ID misuse */
export type DocumentId = string & { readonly __brand: unique symbol }

/** Document processing status */
export type DocumentStatus = 'pending' | 'processing' | 'processed' | 'reviewing' | 'error'

/** Supported document MIME types */
export type DocumentMimeType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

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
  readonly confidence: number
  readonly filePath: string
  readonly fileSize: number
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
  readonly manualTimeSaved: number
  readonly documentsProcessedChange: number
  readonly accuracyChange: number
  readonly timeSavedChange: number
}
