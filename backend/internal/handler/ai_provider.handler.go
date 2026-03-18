package handler

import (
	"encoding/json"
	"net/http"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/service"
)

// AIProviderHandler handles HTTP requests for AI provider configuration.
type AIProviderHandler struct {
	svc *service.AIProviderService
}

// NewAIProviderHandler creates a new AIProviderHandler.
func NewAIProviderHandler(svc *service.AIProviderService) *AIProviderHandler {
	return &AIProviderHandler{svc: svc}
}

// GetProvider handles GET /api/v1/ai-providers
// Returns the current Kilo Code configuration for the authenticated user (key masked).
func (h *AIProviderHandler) GetProvider(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)

	provider, err := h.svc.GetProvider(r.Context(), userID)
	if err != nil {
		handleError(w, err)
		return
	}

	if provider == nil {
		// No config yet — return an empty state so the frontend can show "Not configured"
		domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(nil))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(provider))
}

// SaveProvider handles POST /api/v1/ai-providers
// Saves (creates or updates) the Kilo Code API key.
func (h *AIProviderHandler) SaveProvider(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)

	var body struct {
		APIKey string `json:"apiKey"`
		Model  string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	saved, err := h.svc.SaveProvider(r.Context(), userID, body.APIKey, body.Model)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(saved))
}

// UpdateModel handles PATCH /api/v1/ai-providers
// Updates only the model for an existing Kilo Code configuration.
func (h *AIProviderHandler) UpdateModel(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)

	var body struct {
		Model string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	saved, err := h.svc.UpdateModel(r.Context(), userID, body.Model)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(saved))
}

// DeleteProvider handles DELETE /api/v1/ai-providers
// Removes the Kilo Code configuration for the authenticated user.
func (h *AIProviderHandler) DeleteProvider(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)

	if err := h.svc.DeleteProvider(r.Context(), userID); err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(nil))
}

// TestProvider handles POST /api/v1/ai-providers/test
// Tests connectivity to the Kilo API using the stored API key.
func (h *AIProviderHandler) TestProvider(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)

	result, err := h.svc.TestProvider(r.Context(), userID)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(result))
}

// mustUserID extracts the authenticated user's ObjectID from the request context.
// Panics if the middleware did not set the user (should never happen on protected routes).
func mustUserID(r *http.Request) bson.ObjectID {
	user, ok := r.Context().Value(domain.ContextKeyUser).(*domain.User)
	if !ok || user == nil {
		panic("mustUserID: user not in context — route must be protected by RequireAuth middleware")
	}
	return user.ID
}
