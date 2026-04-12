// Package domain — Agent conversation types for the AI-powered assistant.
package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// AgentMessageRole identifies who sent a message.
type AgentMessageRole string

const (
	AgentRoleUser      AgentMessageRole = "user"
	AgentRoleAssistant AgentMessageRole = "assistant"
	AgentRoleSystem    AgentMessageRole = "system"
)

// AgentActionType tells the frontend what interactive widget to render.
type AgentActionType string

const (
	AgentActionNone           AgentActionType = ""
	AgentActionGreeting       AgentActionType = "greeting"
	AgentActionListDocuments  AgentActionType = "list_documents"
	AgentActionDocumentLoaded AgentActionType = "document_loaded"
	AgentActionAnswer         AgentActionType = "answer"
	AgentActionClarify        AgentActionType = "clarify"
	AgentActionSuggestion     AgentActionType = "suggestion"
	AgentActionError          AgentActionType = "error"
)

// AgentMessage represents a single conversation turn.
type AgentMessage struct {
	ID          string           `json:"id" bson:"id"`
	Role        AgentMessageRole `json:"role" bson:"role"`
	Content     string           `json:"content" bson:"content"`
	Action      AgentActionType  `json:"action,omitempty" bson:"action,omitempty"`
	Documents   []DocumentBrief  `json:"documents,omitempty" bson:"documents,omitempty"`
	Excerpts    []FieldExcerpt   `json:"excerpts,omitempty" bson:"excerpts,omitempty"`
	DocumentRef *DocumentRef     `json:"documentRef,omitempty" bson:"document_ref,omitempty"`
	Intent      string           `json:"intent,omitempty" bson:"intent,omitempty"`
	Timestamp   time.Time        `json:"timestamp" bson:"timestamp"`
}

// DocumentBrief is a lightweight document summary for chat display.
type DocumentBrief struct {
	ID         string `json:"id" bson:"id"`
	Name       string `json:"name" bson:"name"`
	Type       string `json:"type" bson:"type"`
	Status     string `json:"status" bson:"status"`
	FileSize   int64  `json:"fileSize" bson:"file_size"`
	UpdatedAt  string `json:"updatedAt" bson:"updated_at"`
	FieldCount int    `json:"fieldCount" bson:"field_count"`
}

// FieldExcerpt references an extracted data point supporting an answer.
type FieldExcerpt struct {
	FieldName  string  `json:"fieldName" bson:"field_name"`
	Value      string  `json:"value" bson:"value"`
	Confidence float64 `json:"confidence" bson:"confidence"`
}

// DocumentRef tracks which document the conversation references.
type DocumentRef struct {
	ID   string `json:"id" bson:"id"`
	Name string `json:"name" bson:"name"`
}

// AgentSession holds the full state for an ongoing conversation.
type AgentSession struct {
	ID             bson.ObjectID     `json:"id" bson:"_id,omitempty"`
	UserID         bson.ObjectID     `json:"userId" bson:"user_id"`
	Title          string            `json:"title" bson:"title"`
	ActiveDocID    string            `json:"activeDocumentId,omitempty" bson:"active_doc_id,omitempty"`
	ActiveDocName  string            `json:"activeDocumentName,omitempty" bson:"active_doc_name,omitempty"`
	Messages       []AgentMessage    `json:"messages" bson:"messages"`
	Filters        map[string]string `json:"filters,omitempty" bson:"filters,omitempty"`
	CreatedAt      time.Time         `json:"createdAt" bson:"created_at"`
	LastActivityAt time.Time         `json:"lastActivityAt" bson:"last_activity_at"`
}

// SessionSummary is a lightweight representation for the chat history sidebar.
type SessionSummary struct {
	ID             bson.ObjectID `json:"id" bson:"_id"`
	Title          string        `json:"title" bson:"title"`
	ActiveDocName  string        `json:"activeDocumentName,omitempty" bson:"active_doc_name,omitempty"`
	MessageCount   int           `json:"messageCount" bson:"message_count"`
	CreatedAt      time.Time     `json:"createdAt" bson:"created_at"`
	LastActivityAt time.Time     `json:"lastActivityAt" bson:"last_activity_at"`
}

// AgentChatRequest is the inbound payload for sending a message.
type AgentChatRequest struct {
	SessionID  string `json:"sessionId"`
	Message    string `json:"message"`
	DocumentID string `json:"documentId,omitempty"`
}

// AgentChatResponse is the outbound payload.
type AgentChatResponse struct {
	SessionID string        `json:"sessionId"`
	Message   AgentMessage  `json:"message"`
	Session   *AgentSession `json:"session,omitempty"`
}
