/**
 * Typed IPC contract for document operations.
 * Renderer and Main must import from here — never duplicate type definitions.
 */

import type { AuraDocument, CreateDocumentInput, DashboardStats, DocumentId } from '../types/document.types'
import type { Result } from '../types/result.types'

/** IPC channel names — centralized, no magic strings */
export const DocumentChannels = {
  LIST: 'documents:list',
  GET_BY_ID: 'documents:getById',
  CREATE: 'documents:create',
  DELETE: 'documents:delete',
  GET_STATS: 'documents:getStats'
} as const

/** Typed API exposed via preload contextBridge */
export interface DocumentAPI {
  list(): Promise<Result<AuraDocument[]>>
  getById(id: DocumentId): Promise<Result<AuraDocument>>
  create(input: CreateDocumentInput): Promise<Result<AuraDocument>>
  delete(id: DocumentId): Promise<Result<void>>
  getStats(): Promise<Result<DashboardStats>>
}
