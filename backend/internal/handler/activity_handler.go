package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

// ActivityHandler handles HTTP requests for activity endpoints.
type ActivityHandler struct {
	repo *repository.ActivityRepo
}

// NewActivityHandler creates a new ActivityHandler.
func NewActivityHandler(repo *repository.ActivityRepo) *ActivityHandler {
	return &ActivityHandler{repo: repo}
}

// List handles GET /api/v1/activity
func (h *ActivityHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}

	events, err := h.repo.List(r.Context(), limit)
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to fetch activity"))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(events))
}

// Create handles POST /api/v1/activity
func (h *ActivityHandler) Create(w http.ResponseWriter, r *http.Request) {
	var input domain.CreateActivityInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	event, err := h.repo.Create(r.Context(), input)
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to create activity"))
		return
	}

	domain.WriteJSON(w, http.StatusCreated, domain.SuccessResponse(event))
}
