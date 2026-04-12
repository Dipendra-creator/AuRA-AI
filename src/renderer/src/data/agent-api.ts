/**
 * Agent API Client — HTTP helpers for the AI conversational agent.
 */

import type {
  AgentChatResponse,
  AgentSession,
  SessionSummary
} from '../../../shared/types/agent.types'
import { apiPost, apiGet, apiDelete } from './api-client'

/** Create a new session and get the greeting. */
export async function createAgentSession(): Promise<AgentChatResponse> {
  return apiPost<AgentChatResponse>('/agent/sessions', {})
}

/** List all sessions for the sidebar history. */
export async function listAgentSessions(): Promise<SessionSummary[]> {
  return apiGet<SessionSummary[]>('/agent/sessions')
}

/** Send a user message (or document selection) and get the agent's reply. */
export async function sendAgentMessage(
  sessionId: string,
  message: string,
  documentId?: string
): Promise<AgentChatResponse> {
  return apiPost<AgentChatResponse>('/agent/chat', { sessionId, message, documentId })
}

/** Retrieve the full session state (for restoring after refresh). */
export async function getAgentSession(sessionId: string): Promise<AgentSession> {
  return apiGet<AgentSession>(`/agent/sessions/${sessionId}`)
}

/** Delete a session. */
export async function deleteAgentSession(sessionId: string): Promise<void> {
  return apiDelete(`/agent/sessions/${sessionId}`)
}
