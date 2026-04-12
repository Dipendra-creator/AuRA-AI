// Package handler — HTTP endpoints for the AI conversational agent.
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/service"
)

// AgentHandler handles HTTP requests for the conversational agent.
type AgentHandler struct {
	svc *service.AgentService
}

// NewAgentHandler creates a new AgentHandler.
func NewAgentHandler(svc *service.AgentService) *AgentHandler {
	return &AgentHandler{svc: svc}
}

// CreateSession handles POST /api/v1/agent/sessions
// Creates a new session and returns the greeting.
func (h *AgentHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)

	resp, err := h.svc.CreateSession(r.Context(), userID)
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse(err.Error()))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(resp))
}

// ListSessions handles GET /api/v1/agent/sessions
// Returns session summaries for the chat history sidebar.
func (h *AgentHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)

	sessions, err := h.svc.ListSessions(r.Context(), userID)
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse(err.Error()))
		return
	}
	if sessions == nil {
		sessions = []domain.SessionSummary{}
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(sessions))
}

// Chat handles POST /api/v1/agent/chat
// Processes a user message and returns the agent's reply.
func (h *AgentHandler) Chat(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)

	var req domain.AgentChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}
	if req.SessionID == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("sessionId is required"))
		return
	}
	if req.Message == "" && req.DocumentID == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("message or documentId is required"))
		return
	}

	resp, err := h.svc.ProcessMessage(r.Context(), req.SessionID, userID, req)
	if err != nil {
		if appErr, ok := err.(*domain.AppError); ok {
			domain.WriteJSON(w, appErr.Code, domain.ErrorResponse(appErr.Message))
			return
		}
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse(err.Error()))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(resp))
}

// GetSession handles GET /api/v1/agent/sessions/{id}
// Returns the full session state for restoring the UI.
func (h *AgentHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)
	id := r.PathValue("id")
	if id == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("session id is required"))
		return
	}

	sess, err := h.svc.GetSession(r.Context(), id, userID)
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse(err.Error()))
		return
	}
	if sess == nil {
		domain.WriteJSON(w, http.StatusNotFound, domain.ErrorResponse("session not found"))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(sess))
}

// DeleteSession handles DELETE /api/v1/agent/sessions/{id}
// Removes a session entirely.
func (h *AgentHandler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)
	id := r.PathValue("id")
	if id == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("session id is required"))
		return
	}

	if err := h.svc.DeleteSession(r.Context(), id, userID); err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse(err.Error()))
		return
	}
	domain.WriteJSON(w, http.StatusOK, domain.APIResponse{
		Success: true,
		Data:    map[string]string{"message": "session deleted"},
	})
}
