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

// ListProviders handles GET /api/v1/ai-providers
// Returns all configured AI providers for the authenticated user.
func (h *AIProviderHandler) ListProviders(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)

	providers, err := h.svc.GetAllProviders(r.Context(), userID)
	if err != nil {
		handleError(w, err)
		return
	}

	if providers == nil {
		providers = []domain.AIProvider{}
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(providers))
}

// GetProvider handles GET /api/v1/ai-providers/{type}
// Returns a specific provider config for the authenticated user (key masked).
func (h *AIProviderHandler) GetProvider(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)
	providerType := r.PathValue("type")
	if providerType == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("provider type is required"))
		return
	}

	provider, err := h.svc.GetProvider(r.Context(), userID, providerType)
	if err != nil {
		handleError(w, err)
		return
	}

	if provider == nil {
		domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(nil))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(provider))
}

// SaveProvider handles POST /api/v1/ai-providers
// Saves (creates or updates) an AI provider API key.
func (h *AIProviderHandler) SaveProvider(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)

	var body struct {
		ProviderType string `json:"providerType"`
		APIKey       string `json:"apiKey"`
		Model        string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}
	if body.ProviderType == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("providerType is required"))
		return
	}

	saved, err := h.svc.SaveProvider(r.Context(), userID, body.ProviderType, body.APIKey, body.Model)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(saved))
}

// SetActive handles POST /api/v1/ai-providers/{type}/activate
// Marks the specified provider as active and deactivates others.
func (h *AIProviderHandler) SetActive(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)
	providerType := r.PathValue("type")
	if providerType == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("provider type is required"))
		return
	}

	saved, err := h.svc.SetActiveProvider(r.Context(), userID, providerType)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(saved))
}

// UpdateModel handles PATCH /api/v1/ai-providers/{type}
// Updates only the model for an existing provider configuration.
func (h *AIProviderHandler) UpdateModel(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)
	providerType := r.PathValue("type")
	if providerType == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("provider type is required"))
		return
	}

	var body struct {
		Model string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	saved, err := h.svc.UpdateModel(r.Context(), userID, providerType, body.Model)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(saved))
}

// DeleteProvider handles DELETE /api/v1/ai-providers/{type}
// Removes a specific provider configuration for the authenticated user.
func (h *AIProviderHandler) DeleteProvider(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)
	providerType := r.PathValue("type")
	if providerType == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("provider type is required"))
		return
	}

	if err := h.svc.DeleteProvider(r.Context(), userID, providerType); err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(nil))
}

// TestProvider handles POST /api/v1/ai-providers/{type}/test
// Tests connectivity using the stored API key for the specified provider.
func (h *AIProviderHandler) TestProvider(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)
	providerType := r.PathValue("type")
	if providerType == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("provider type is required"))
		return
	}

	result, err := h.svc.TestProvider(r.Context(), userID, providerType)
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
