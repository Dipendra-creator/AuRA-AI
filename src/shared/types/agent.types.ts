/**
 * Agent Types — Shared type definitions for the AI conversational agent.
 */

export type AgentMessageRole = 'user' | 'assistant' | 'system'

export type AgentActionType =
  | ''
  | 'greeting'
  | 'list_documents'
  | 'document_loaded'
  | 'answer'
  | 'clarify'
  | 'suggestion'
  | 'error'

export interface DocumentBrief {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly status: string
  readonly fileSize: number
  readonly updatedAt: string
  readonly fieldCount: number
}

export interface FieldExcerpt {
  readonly fieldName: string
  readonly value: string
  readonly confidence: number
}

export interface DocumentRef {
  readonly id: string
  readonly name: string
}

export interface AgentMessage {
  readonly id: string
  readonly role: AgentMessageRole
  readonly content: string
  readonly action?: AgentActionType
  readonly documents?: DocumentBrief[]
  readonly excerpts?: FieldExcerpt[]
  readonly documentRef?: DocumentRef
  readonly intent?: string
  readonly timestamp: string
}

export interface AgentSession {
  readonly id: string
  readonly userId: string
  readonly title: string
  readonly activeDocumentId?: string
  readonly activeDocumentName?: string
  readonly messages: AgentMessage[]
  readonly filters?: Record<string, string>
  readonly createdAt: string
  readonly lastActivityAt: string
}

export interface SessionSummary {
  readonly id: string
  readonly title: string
  readonly activeDocumentName?: string
  readonly messageCount: number
  readonly createdAt: string
  readonly lastActivityAt: string
}

export interface AgentChatRequest {
  readonly sessionId: string
  readonly message: string
  readonly documentId?: string
}

export interface AgentChatResponse {
  readonly sessionId: string
  readonly message: AgentMessage
  readonly session?: AgentSession
}
